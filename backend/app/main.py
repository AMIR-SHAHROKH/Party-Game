# backend/app/main.py
import time
import random
from typing import List, Dict, Optional

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import Session, select
from pydantic import BaseModel
import socketio
from sqlalchemy.exc import OperationalError

from .db import create_db_and_tables, get_session, engine
from .models import Question, Game, Player, Round, Submission, Vote

# --- Initialize Socket.IO ---
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")

# --- Initialize FastAPI ---
app = FastAPI(
    title="🎉 Q&A Party Game API",
    description="""
Interactive real-time game API where players answer fun questions and vote for the best one!

Use the **Socket.IO events** for gameplay and these REST endpoints for admin tasks.
""",
    version="1.0.0",
    docs_url="/swagger",
    redoc_url="/redoc",
)

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
    retries = 10  # number of attempts
    wait_time = 2  # seconds between retries
    for attempt in range(1, retries + 1):
        try:
            create_db_and_tables()
            print("✅ Database connected and tables created.")
            break
        except OperationalError:
            print(f"⚠️ Database not ready (attempt {attempt}/{retries}), retrying in {wait_time}s...")
            time.sleep(wait_time)
    else:
        raise RuntimeError("❌ Database not ready after multiple attempts")


# --- Pydantic Models for requests/responses ---
class ImportQuestionsPayload(BaseModel):
    questions: List[str] = ["What is your favorite color?", "Tell a funny story"]


class CreateGamePayload(BaseModel):
    host_name: str = "Host"


class JoinGamePayload(BaseModel):
    player_name: str


# --- REST Endpoints ---

@app.get("/question/random")
def get_random_question(session: Session = Depends(get_session)):
    """Return a random question from the database."""
    questions = session.exec(select(Question)).all()
    if not questions:
        # fallback question
        return {"id": 0, "text": "Default question for testing"}
    q = random.choice(questions)
    return {"id": q.id, "text": q.text}


@app.post("/admin/questions/import")
def import_questions(payload: ImportQuestionsPayload, session: Session = Depends(get_session)):
    """Import a list of questions."""
    items = payload.questions
    for t in items:
        q = Question(text=t)
        session.add(q)
    session.commit()
    return {"imported": len(items)}


@app.post("/games")
def create_game(payload: CreateGamePayload, session: Session = Depends(get_session)):
    """Create a new game and host player."""
    host_name = payload.host_name or "Host"
    g = Game()
    session.add(g)
    session.commit()
    session.refresh(g)
    p = Player(name=host_name, game_id=g.id)
    session.add(p)
    session.commit()
    session.refresh(p)
    return {"game_id": g.id, "host_player_id": p.id}


@app.get("/games")
def list_games(session: Session = Depends(get_session)):
    """Return all games for the lobby."""
    games = session.exec(select(Game)).all()
    return [
        {"id": g.id, "created_at": g.created_at.isoformat() if g.created_at else None}
        for g in games
    ]


@app.post("/games/{game_id}/join")
def join_game_rest(game_id: int, payload: JoinGamePayload, session: Session = Depends(get_session)):
    """Join a game via REST (creates a player record)."""
    # Validate the game exists
    game = session.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    p = Player(name=payload.player_name or "Player", game_id=game_id)
    session.add(p)
    session.commit()
    session.refresh(p)

    # Broadcast new player list via Socket.IO (if running)
    try:
        players = session.exec(select(Player).where(Player.game_id == game_id)).all()
        simplified = [{"id": pl.id, "name": pl.name} for pl in players]
        # use sio.emit to broadcast to room (if socket server has clients)
        # room name used elsewhere: f"game_{game_id}"
        # this emit is safe even if no clients connected
        sio.start_background_task(lambda: sio.emit("player_list", {"players": simplified}, room=f"game_{game_id}"))
    except Exception:
        # don't fail the request if socket broadcast fails
        pass

    return {"player_id": p.id, "game_id": game_id}


@app.get("/games/{game_id}/players")
def get_players(game_id: int, session: Session = Depends(get_session)):
    """Return players in a given game."""
    game = session.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    players = session.exec(select(Player).where(Player.game_id == game_id)).all()
    return [{"id": p.id, "name": p.name} for p in players]


@app.get("/games/{game_id}/scores")
def get_scores(game_id: int, session: Session = Depends(get_session)):
    """
    Return computed scores for a game.
    Score logic: each Vote points to a submission; attribute points to the submission's player.
    """
    # verify game exists
    game = session.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")

    # find rounds for this game
    rounds = session.exec(select(Round).where(Round.game_id == game_id)).all()
    round_ids = [r.id for r in rounds]
    if not round_ids:
        return []

    # find submissions for those rounds
    submissions = session.exec(select(Submission).where(Submission.round_id.in_(round_ids))).all()
    submission_map = {s.id: s for s in submissions}

    # tally votes per submission
    votes = session.exec(select(Vote).where(Vote.round_id.in_(round_ids))).all()
    scores: Dict[int, int] = {}  # player_id -> points
    for v in votes:
        sub = submission_map.get(v.submission_id)
        if not sub:
            continue
        scores[sub.player_id] = scores.get(sub.player_id, 0) + 1

    # convert to list of {player, points}
    results = []
    for player_id, pts in scores.items():
        player = session.get(Player, player_id)
        results.append({"player_id": player_id, "player_name": player.name if player else None, "points": pts})

    # sort desc
    results.sort(key=lambda x: x["points"], reverse=True)
    return results


# --- Global State ---
SID_TO_PLAYER: Dict[str, int] = {}        # socket.id -> player_id
GAME_ROUND_STATE: Dict[int, int] = {}     # game_id -> round_id


# --- Helper ---
def pick_random_question(session: Session) -> Question:
    questions = session.exec(select(Question)).all()
    if not questions:
        return Question(id=0, text="Default question for testing")
    return random.choice(questions)


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
                session.refresh(player)
        else:
            player = Player(name=name, game_id=game_id)
            session.add(player)
            session.commit()
            session.refresh(player)
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
        r = Round(game_id=game_id, question_id=q.id, state="collecting")
        session.add(r)
        session.commit()
        session.refresh(r)
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
        # count submissions
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
        # compute counts
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
