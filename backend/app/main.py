# backend/app/main.py
from fastapi import FastAPI, Depends, HTTPException
from sqlmodel import Session, select
from fastapi.middleware.cors import CORSMiddleware
from .db import create_db_and_tables, get_session, engine
from .models import Question, Game, Player, Round, Submission, Vote
import random
import socketio

# --- Initialize Socket.IO ---
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")

# --- Initialize FastAPI ---
app = FastAPI(title="Party Game API")

# --- CORS ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- DB initialization ---
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# --- REST Endpoints ---

@app.get("/question/random")
def get_random_question(session: Session = Depends(get_session)):
    """Return a random question from the database."""
    questions = session.exec(select(Question)).all()
    if not questions:
        raise HTTPException(status_code=404, detail="No questions found")
    return random.choice(questions)

@app.post("/admin/questions/import")
async def import_questions(payload: dict, session: Session = Depends(get_session)):
    """Import a list of questions."""
    items = payload.get("questions", [])
    for t in items:
        q = Question(text=t)
        session.add(q)
    session.commit()
    return {"imported": len(items)}

@app.post("/games")
async def create_game(payload: dict, session: Session = Depends(get_session)):
    """Create a new game and host player."""
    host_name = payload.get("host_name", "Host")
    g = Game()
    session.add(g)
    session.commit()
    p = Player(name=host_name, game_id=g.id)
    session.add(p)
    session.commit()
    return {"game_id": g.id, "host_player_id": p.id}

# --- Global State ---
SID_TO_PLAYER = {}        # socket.id -> player_id
GAME_ROUND_STATE = {}     # game_id -> round_id

# --- Helper ---
def pick_random_question(session: Session):
    questions = session.exec(select(Question)).all()
    return random.choice(questions) if questions else None

# --- Socket.IO Events ---
@sio.event
async def connect(sid, environ):
    print(f"✅ Client connected: {sid}")

@sio.event
async def disconnect(sid):
    print(f"❌ Client disconnected: {sid}")
    SID_TO_PLAYER.pop(sid, None)

@sio.event
async def join_game(sid, data):
    """data: { game_id, name, player_id (optional if reconnect) }"""
    try:
        game_id = int(data.get("game_id"))
    except Exception:
        await sio.emit("error", {"msg": "invalid game_id"}, to=sid)
        return
    name = data.get("name") or "Player"
    provided_id = data.get("player_id")
    with Session(engine) as session:
        if provided_id:
            player = session.get(Player, provided_id)
            if not player:
                player = Player(name=name, game_id=game_id)
                session.add(player)
                session.commit()
        else:
            player = Player(name=name, game_id=game_id)
            session.add(player)
            session.commit()
        SID_TO_PLAYER[sid] = player.id
        sio.enter_room(sid, f"game_{game_id}")
        # broadcast player list
        players = session.exec(select(Player).where(Player.game_id == game_id)).all()
        simplified = [{"id": p.id, "name": p.name} for p in players]
        await sio.emit("player_list", {"players": simplified}, room=f"game_{game_id}")
        await sio.emit("joined", {"player_id": player.id}, to=sid)

@sio.event
async def start_round(sid, data):
    """Host starts a round with random question."""
    try:
        game_id = int(data.get("game_id"))
    except Exception:
        await sio.emit("error", {"msg": "invalid game_id"}, to=sid)
        return
    with Session(engine) as session:
        q = pick_random_question(session)
        if q is None:
            await sio.emit("error", {"msg": "no questions in DB"}, to=sid)
            return
        r = Round(game_id=game_id, question_id=q.id, state="collecting")
        session.add(r)
        session.commit()
        GAME_ROUND_STATE[game_id] = r.id
        await sio.emit("round_started", {"round_id": r.id, "question": q.text}, room=f"game_{game_id}")

@sio.event
async def submit_answer(sid, data):
    """Player submits an answer."""
    try:
        round_id = int(data.get("round_id"))
    except Exception:
        await sio.emit("error", {"msg": "invalid round_id"}, to=sid)
        return
    text = data.get("text", "")
    player_id = SID_TO_PLAYER.get(sid)
    if player_id is None:
        await sio.emit("error", {"msg": "not joined"}, to=sid)
        return
    with Session(engine) as session:
        sub = Submission(round_id=round_id, player_id=player_id, text=text)
        session.add(sub)
        session.commit()
        count = len(session.exec(select(Submission).where(Submission.round_id == round_id)).all())
        round_obj = session.get(Round, round_id)
        await sio.emit(
            "submission_received",
            {"round_id": round_id, "current_submissions": count},
            room=f"game_{round_obj.game_id}",
        )

@sio.event
async def reveal_submissions(sid, data):
    """Host reveals all submissions anonymously."""
    try:
        round_id = int(data.get("round_id"))
    except Exception:
        await sio.emit("error", {"msg": "invalid round_id"}, to=sid)
        return
    with Session(engine) as session:
        subs = session.exec(select(Submission).where(Submission.round_id == round_id)).all()
        list_out = [{"anon_id": f"A{i}", "submission_id": s.id, "text": s.text}
                    for i, s in enumerate(subs, start=1)]
        r = session.get(Round, round_id)
        r.state = "voting"
        session.add(r)
        session.commit()
        await sio.emit(
            "submissions_revealed",
            {"submissions": list_out, "round_id": round_id},
            room=f"game_{r.game_id}",
        )

@sio.event
async def vote_submission(sid, data):
    """Players vote for their favorite submission."""
    try:
        submission_id = int(data.get("submission_id"))
        round_id = int(data.get("round_id"))
    except Exception:
        await sio.emit("error", {"msg": "invalid ids"}, to=sid)
        return
    voter = SID_TO_PLAYER.get(sid)
    if voter is None:
        await sio.emit("error", {"msg": "not joined"}, to=sid)
        return
    with Session(engine) as session:
        exists = session.exec(
            select(Vote).where(Vote.voter_player_id == voter, Vote.round_id == round_id)
        ).first()
        if exists:
            await sio.emit("error", {"msg": "already voted"}, to=sid)
            return
        v = Vote(round_id=round_id, submission_id=submission_id, voter_player_id=voter)
        session.add(v)
        session.commit()
        subs_rows = session.exec(select(Submission.id).where(Submission.round_id == round_id)).all()
        counts = {}
        for s_id in subs_rows:
            c = len(session.exec(select(Vote).where(Vote.submission_id == s_id)).all())
            counts[str(s_id)] = c
        r = session.get(Round, round_id)
        await sio.emit("vote_update", {"counts": counts}, room=f"game_{r.game_id}")
        total_players = len(session.exec(select(Player).where(Player.game_id == r.game_id)).all())
        total_votes = len(session.exec(select(Vote).where(Vote.round_id == round_id)).all())
        if total_votes >= total_players:
            from collections import Counter
            votes = session.exec(select(Vote.submission_id).where(Vote.round_id == round_id)).all()
            ctr = Counter(votes)
            winner_sub_id = ctr.most_common(1)[0][0] if ctr else None
            result = {"winner_submission_id": winner_sub_id}
            r.state = "finished"
            session.add(r)
            session.commit()
            await sio.emit("round_finished", result, room=f"game_{r.game_id}")

# --- Combine FastAPI + Socket.IO ---
asgi_app = socketio.ASGIApp(sio, app)
