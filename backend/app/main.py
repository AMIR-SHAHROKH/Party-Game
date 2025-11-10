from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import socketio
from sqlmodel import SQLModel, create_engine, Session, select
import os
from .models import Question, Game, Player, Round, Submission, Vote
from .db import get_engine, create_db_and_tables

# Socket.IO server (async)
sio = socketio.AsyncServer(async_mode='asgi', cors_allowed_origins="*")
app = FastAPI()
app.add_middleware(
    CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"]
)

# mount socketio ASGI
from socketio import ASGIApp
app.mount("/", ASGIApp(sio, other_asgi_app=app))

# app startup: init DB
@app.on_event("startup")
def on_startup():
    create_db_and_tables()

# simple REST endpoints for admin / bootstrap
@app.post("/admin/questions/import")
async def import_questions(payload: dict):
    items = payload.get("questions", [])
    engine = get_engine()
    with Session(engine) as session:
        for t in items:
            q = Question(text=t)
            session.add(q)
        session.commit()
    return {"imported": len(items)}

@app.post("/games")
async def create_game(payload: dict):
    host_name = payload.get("host_name", "Host")
    engine = get_engine()
    with Session(engine) as session:
        g = Game()
        session.add(g)
        session.commit()
        # create host player
        p = Player(name=host_name, game_id=g.id)
        session.add(p)
        session.commit()
    return {"game_id": g.id, "host_player_id": p.id}

# small helper: pick random question
import random
def pick_random_question(session):
    q = session.exec(select(Question)).all()
    if not q:
        return None
    return random.choice(q)

# server-side mappings: sid -> player_id
SID_TO_PLAYER = {}
GAME_ROUND_STATE = {}  # game_id -> round_id

# Socket handlers
@sio.event
async def connect(sid, environ):
    print("connect", sid)

@sio.event
async def disconnect(sid):
    print("disconnect", sid)
    if sid in SID_TO_PLAYER:
        del SID_TO_PLAYER[sid]

@sio.event
async def join_game(sid, data):
    """
    data: { game_id, name, player_id (optional if reconnect) }
    """
    try:
        game_id = int(data.get("game_id"))
    except Exception:
        await sio.emit("error", {"msg": "invalid game_id"}, to=sid)
        return
    name = data.get("name") or "Player"
    provided_id = data.get("player_id")
    engine = get_engine()
    with Session(engine) as session:
        if provided_id:
            player = session.get(Player, provided_id)
            if not player:
                player = Player(name=name, game_id=game_id)
                session.add(player); session.commit()
        else:
            player = Player(name=name, game_id=game_id)
            session.add(player); session.commit()
        SID_TO_PLAYER[sid] = player.id
        sio.enter_room(sid, f"game_{game_id}")
        # broadcast player list
        players = session.exec(select(Player).where(Player.game_id==game_id)).all()
        simplified = [{"id": p.id, "name": p.name} for p in players]
        await sio.emit("player_list", {"players": simplified}, room=f"game_{game_id}")
        # send ack with player's id
        await sio.emit("joined", {"player_id": player.id}, to=sid)

@sio.event
async def start_round(sid, data):
    """
    host starts round: server picks random question
    data: { game_id }
    """
    try:
        game_id = int(data.get("game_id"))
    except Exception:
        await sio.emit("error", {"msg": "invalid game_id"}, to=sid)
        return
    engine = get_engine()
    with Session(engine) as session:
        q = pick_random_question(session)
        if q is None:
            await sio.emit("error", {"msg":"no questions in DB"}, to=sid); return
        r = Round(game_id=game_id, question_id=q.id, state="collecting")
        session.add(r); session.commit()
        GAME_ROUND_STATE[game_id] = r.id
        await sio.emit("round_started", {"round_id": r.id, "question": q.text}, room=f"game_{game_id}")

@sio.event
async def submit_answer(sid, data):
    """
    data: { round_id, text }
    """
    try:
        round_id = int(data.get("round_id"))
    except Exception:
        await sio.emit("error", {"msg":"invalid round_id"}, to=sid); return
    text = data.get("text","")
    engine = get_engine()
    player_id = SID_TO_PLAYER.get(sid)
    if player_id is None:
        await sio.emit("error", {"msg":"not joined"}, to=sid); return
    with Session(engine) as session:
        sub = Submission(round_id=round_id, player_id=player_id, text=text)
        session.add(sub); session.commit()
        # we do not send mapping of player -> submission. send only count ack
        round_obj = session.get(Round, round_id)
        if round_obj is None:
            await sio.emit("error", {"msg":"round not found"}, to=sid); return
        count = session.exec(select(Submission).where(Submission.round_id==round_id)).count()
        await sio.emit("submission_received", {"round_id": round_id, "current_submissions": count}, room=f"game_{round_obj.game_id}")

@sio.event
async def reveal_submissions(sid, data):
    """
    host triggers reveal: server emits anonymized list
    data: { round_id }
    """
    try:
        round_id = int(data.get("round_id"))
    except Exception:
        await sio.emit("error", {"msg":"invalid round_id"}, to=sid); return
    engine = get_engine()
    with Session(engine) as session:
        subs = session.exec(select(Submission).where(Submission.round_id==round_id)).all()
        # anonymize by index
        list_out = []
        for i, s in enumerate(subs, start=1):
            list_out.append({"anon_id": f"A{i}", "submission_id": s.id, "text": s.text})
        # change round state
        r = session.get(Round, round_id)
        if r is None:
            await sio.emit("error", {"msg":"round not found"}, to=sid); return
        r.state = "voting"
        session.add(r); session.commit()
        await sio.emit("submissions_revealed", {"submissions": list_out, "round_id": round_id}, room=f"game_{r.game_id}")

@sio.event
async def vote_submission(sid, data):
    """
    data: { round_id, submission_id }
    """
    try:
        submission_id = int(data.get("submission_id"))
        round_id = int(data.get("round_id"))
    except Exception:
        await sio.emit("error", {"msg":"invalid ids"}, to=sid); return
    voter = SID_TO_PLAYER.get(sid)
    if voter is None:
        await sio.emit("error", {"msg":"not joined"}, to=sid); return
    engine = get_engine()
    with Session(engine) as session:
        # ensure no double vote
        exists = session.exec(select(Vote).where(Vote.voter_player_id==voter, Vote.round_id==round_id)).first()
        if exists:
            await sio.emit("error", {"msg":"already voted"}, to=sid); return
        v = Vote(round_id=round_id, submission_id=submission_id, voter_player_id=voter)
        session.add(v); session.commit()
        # broadcast vote counts (optional)
        subs_rows = session.exec(select(Submission.id).where(Submission.round_id==round_id)).all()
        counts = {}
        for s_id in subs_rows:
            c = session.exec(select(Vote).where(Vote.submission_id==s_id)).count()
            counts[str(s_id)] = c
        r = session.get(Round, round_id)
        await sio.emit("vote_update", {"counts": counts}, room=f"game_{r.game_id}")
        # if all players voted -> finish round
        total_players = session.exec(select(Player).where(Player.game_id==r.game_id)).count()
        total_votes = session.exec(select(Vote).where(Vote.round_id==round_id)).count()
        if total_votes >= total_players:
            # compute winner (naive)
            votes = session.exec(select(Vote.submission_id).where(Vote.round_id==round_id)).all()
            from collections import Counter
            ctr = Counter(votes)
            winner_sub_id = ctr.most_common(1)[0][0] if ctr else None
            result = {"winner_submission_id": winner_sub_id}
            # set round finished
            r.state = "finished"
            session.add(r); session.commit()
            await sio.emit("round_finished", result, room=f"game_{r.game_id}")
