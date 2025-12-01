# backend/app/main.py

import random
from typing import List, Dict, Optional
from datetime import datetime

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

import socketio
from sqlmodel import select
from redis.asyncio import Redis
from sqlmodel.ext.asyncio.session import AsyncSession

from .db import engine, async_session, create_db_and_tables, get_session
from .models import Question, Game, Player, Round, Submission, Vote

# --- Socket.IO setup ---
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")

# --- FastAPI app setup ---
app = FastAPI(
    title="🎉 Q&A Party Game API",
    description="""
Interactive real‑time game API where players answer fun questions and vote for the best one!
Use the REST endpoints for admin tasks and the Socket.IO events for gameplay.
""",
    version="1.0.0",
    docs_url="/swagger",
    redoc_url="/redoc"
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Mount Socket.IO + FastAPI ---
asgi_app = socketio.ASGIApp(sio, app)

# --- Redis client config ---
redis_client: Optional[Redis] = None
REDIS_HOST = "redis"
REDIS_PORT = 6379
REDIS_DB = 0

# --- Pydantic payloads ---
class ImportQuestionsPayload(BaseModel):
    questions: List[str]

class CreateGamePayload(BaseModel):
    host_name: str = "Host"
    rounds: int = 10

class JoinGamePayload(BaseModel):
    player_name: str

# --- Dependency for SQLModel async session ---
async def get_async_session() -> AsyncSession:
    async with async_session() as session:
        yield session

# --- Startup event ---
@app.on_event("startup")
async def startup_event():
    global redis_client
    redis_client = Redis(host=REDIS_HOST, port=REDIS_PORT, db=REDIS_DB)
    try:
        pong = await redis_client.ping()
        print(f"✅ Redis connected: {pong}")
    except Exception as e:
        raise RuntimeError(f"❌ Redis connection failed: {e}")

    await create_db_and_tables()
    print("✅ Database tables created")

# --- Helper function ---
async def pick_random_question(session: AsyncSession) -> Question:
    result = await session.execute(select(Question))
    questions = result.scalars().all()
    if not questions:
        return Question(id=0, text="Default question for testing")
    return random.choice(questions)

# --- REST endpoints ---
@app.get("/question/random")
async def get_random_question(session: AsyncSession = Depends(get_async_session)):
    q = await pick_random_question(session)
    return {"id": q.id, "text": q.text}

@app.post("/admin/questions/import")
async def import_questions(
    payload: ImportQuestionsPayload,
    session: AsyncSession = Depends(get_async_session)
):
    for t in payload.questions:
        q = Question(text=t)
        session.add(q)
    await session.commit()
    return {"imported": len(payload.questions)}

@app.post("/games")
async def create_game(
    payload: CreateGamePayload,
    session: AsyncSession = Depends(get_async_session)
):
    host_name = payload.host_name or "Host"
    g = Game(rounds=payload.rounds)
    session.add(g)
    await session.commit()
    await session.refresh(g)

    p = Player(name=host_name, game_id=g.id, ready=False)
    session.add(p)
    await session.commit()
    await session.refresh(p)

    g.host_player_id = p.id
    session.add(g)
    await session.commit()
    await session.refresh(g)

    return {"game_id": g.id, "host_player_id": p.id}

@app.get("/games")
async def list_games(session: AsyncSession = Depends(get_async_session)):
    result = await session.execute(select(Game))
    games = result.scalars().all()
    return [
        {"id": g.id, "created_at": g.created_at.isoformat() if g.created_at else None}
        for g in games
    ]

@app.get("/games/{game_id}")
async def get_game(game_id: int, session: AsyncSession = Depends(get_async_session)):
    game = await session.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    result = await session.execute(select(Player).where(Player.game_id == game_id))
    players = result.scalars().all()
    return {
        "id": game.id,
        "created_at": game.created_at.isoformat() if game.created_at else None,
        "rounds": game.rounds,
        "host_player_id": game.host_player_id,
        "players": [{"id": p.id, "name": p.name, "ready": p.ready} for p in players],
    }

@app.post("/games/{game_id}/join")
async def join_game_rest(
    game_id: int,
    payload: JoinGamePayload,
    session: AsyncSession = Depends(get_async_session)
):
    game = await session.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    p = Player(name=payload.player_name or "Player", game_id=game_id)
    session.add(p)
    await session.commit()
    await session.refresh(p)
    return {"player_id": p.id, "game_id": game_id}

@app.get("/games/{game_id}/players")
async def get_players(game_id: int, session: AsyncSession = Depends(get_async_session)):
    game = await session.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    result = await session.execute(select(Player).where(Player.game_id == game_id))
    players = result.scalars().all()
    return [{"id": p.id, "name": p.name, "ready": p.ready} for p in players]

@app.get("/games/{game_id}/scores")
async def get_scores(game_id: int, session: AsyncSession = Depends(get_async_session)):
    game = await session.get(Game, game_id)
    if not game:
        raise HTTPException(status_code=404, detail="Game not found")
    result_rounds = await session.execute(select(Round).where(Round.game_id == game_id))
    rounds = result_rounds.scalars().all()
    round_ids = [r.id for r in rounds]
    if not round_ids:
        return []

    result_subs = await session.execute(select(Submission).where(Submission.round_id.in_(round_ids)))
    submissions = result_subs.scalars().all()
    submission_map = {s.id: s for s in submissions}

    result_votes = await session.execute(select(Vote).where(Vote.round_id.in_(round_ids)))
    votes = result_votes.scalars().all()

    scores: Dict[int, int] = {}
    for v in votes:
        sub = submission_map.get(v.submission_id)
        if not sub:
            continue
        scores[sub.player_id] = scores.get(sub.player_id, 0) + 1

    results = []
    for player_id, pts in scores.items():
        player = await session.get(Player, player_id)
        results.append({"player_id": player_id, "player_name": player.name if player else None, "points": pts})

    results.sort(key=lambda x: x["points"], reverse=True)
    return results

# --- Global State for Socket.IO ---
SID_TO_PLAYER: Dict[str, int] = {}
GAME_ROUND_STATE: Dict[int, int] = {}

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
    game_id = int(data.get("game_id", 0))
    name = data.get("name") or "Player"
    provided_id = data.get("player_id")

    async with async_session() as session:
        if provided_id:
            player = await session.get(Player, provided_id)
            if not player:
                player = Player(name=name, game_id=game_id, ready=False)
                session.add(player)
                await session.commit()
                await session.refresh(player)
        else:
            player = Player(name=name, game_id=game_id, ready=False)
            session.add(player)
            await session.commit()
            await session.refresh(player)

        SID_TO_PLAYER[sid] = player.id
        sio.enter_room(sid, f"game_{game_id}")

        result = await session.execute(select(Player).where(Player.game_id == game_id))
        players = result.scalars().all()
        simplified = [{"id": p.id, "name": p.name, "ready": p.ready} for p in players]

    await sio.emit("player_list", {"players": simplified}, room=f"game_{game_id}")
    await sio.emit("joined", {"player_id": player.id}, to=sid)

@sio.event
async def toggle_ready(sid, data):
    game_id = int(data.get("game_id", 0))
    ready = bool(data.get("ready", False))
    player_id = SID_TO_PLAYER.get(sid)
    if not player_id:
        return

    async with async_session() as session:
        player = await session.get(Player, player_id)
        if not player:
            return
        player.ready = ready
        session.add(player)
        await session.commit()

        result = await session.execute(select(Player).where(Player.game_id == game_id))
        players = result.scalars().all()
        simplified = [{"id": p.id, "name": p.name, "ready": p.ready} for p in players]

    await sio.emit("player_list", {"players": simplified}, room=f"game_{game_id}")

@sio.event
async def start_game(sid, data):
    game_id = int(data.get("game_id", 0))
    player_id = SID_TO_PLAYER.get(sid)

    async with async_session() as session:
        game = await session.get(Game, game_id)
        if not game:
            await sio.emit("error", {"msg": "game not found"}, to=sid)
            return
        if game.host_player_id and player_id != game.host_player_id:
            await sio.emit("error", {"msg": "only host can start the game"}, to=sid)
            return
        result = await session.execute(select(Player).where(Player.game_id == game_id))
        players = result.scalars().all()
        if not players:
            await sio.emit("error", {"msg": "no players"}, to=sid)
            return

    await sio.emit("game_started", {"game_id": game_id, "rounds": game.rounds}, room=f"game_{game_id}")
    GAME_ROUND_STATE[game_id] = None
