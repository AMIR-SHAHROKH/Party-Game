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

from .db import async_session
from .models import Question, Game, Player, Round, Submission, Vote

# -------------------------------------------------
# Socket.IO setup (mounted, not replacing FastAPI)
# -------------------------------------------------
sio = socketio.AsyncServer(cors_allowed_origins="*", async_mode="asgi")

# -------------------------------------------------
# FastAPI app
# -------------------------------------------------
app = FastAPI(
    title="🎉 Q&A Party Game API",
    description="""
Interactive real-time game API where players answer fun questions and vote for the best one!
""",
    version="1.0.0",
    docs_url="/swagger",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    root_path="/api",   
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost",
        "http://localhost:80",
        "http://127.0.0.1",
        "http://127.0.0.1:80",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# mount socket.io under /ws so FastAPI remains the root ASGI app (OpenAPI works)
app.mount("/ws", socketio.ASGIApp(sio))

# -------------------------------------------------
# Redis (used for ephemeral / runtime state that models don't store)
# - Stores: current round for a game, question assigned to a round, revealed flag
# -------------------------------------------------
redis_client: Optional[Redis] = None
REDIS_HOST = "redis"
REDIS_PORT = 6379
REDIS_DB = 0

# -------------------------------------------------
# Pydantic payloads
# -------------------------------------------------
class ImportQuestionsPayload(BaseModel):
    questions: List[str]

class CreateGamePayload(BaseModel):
    name: str
    host_name: str = "Host"
    rounds: int = 10

class JoinGamePayload(BaseModel):
    player_name: str

class StartGamePayload(BaseModel):
    host_id: int

class StartRoundPayload(BaseModel):
    host_id: int

class SubmitAnswerPayload(BaseModel):
    player_id: int
    text: str

class RevealPayload(BaseModel):
    host_id: int

class VotePayload(BaseModel):
    player_id: int
    submission_id: int

# -------------------------------------------------
# DB session dependency
# -------------------------------------------------
async def get_async_session() -> AsyncSession:
    async with async_session() as session:
        yield session

# -------------------------------------------------
# Startup (SAFE — no schema changes)
# -------------------------------------------------
@app.on_event("startup")
async def startup_event():
    global redis_client
    redis_client = Redis(
        host=REDIS_HOST,
        port=REDIS_PORT,
        db=REDIS_DB,
        decode_responses=True,
    )
    # ensure redis reachable (will raise if not)
    await redis_client.ping()
    print("✅ Redis connected")
    # NOTE: Do NOT create/drop tables here. Use migrations for schema management.

# -------------------------------------------------
# Helper
# -------------------------------------------------
async def pick_random_question(session: AsyncSession) -> Question:
    result = await session.execute(select(Question))
    questions = result.scalars().all()
    if not questions:
        # return a dummy object compatible with your model
        return Question(id=0, text="Default question for testing")
    return random.choice(questions)

# -------------------------------------------------
# REST endpoints (uses models from models.py)
# -------------------------------------------------
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
        session.add(Question(text=t))
    await session.commit()
    return {"imported": len(payload.questions)}

@app.post("/games")
async def create_game(
    payload: CreateGamePayload,
    session: AsyncSession = Depends(get_async_session)
):
    g = Game(
        name=payload.name,
        rounds=payload.rounds
    )
    session.add(g)
    await session.commit()
    await session.refresh(g)

    p = Player(name=payload.host_name, game_id=g.id)
    session.add(p)
    await session.commit()
    await session.refresh(p)

    g.host_player_id = p.id
    session.add(g)
    await session.commit()

    return {
        "game_id": g.id,
        "name": g.name,
        "host_player_id": p.id,
    }


@app.get("/games")
async def list_games(session: AsyncSession = Depends(get_async_session)):
    result = await session.execute(select(Game))
    games = result.scalars().all()
    return [
        {
            "id": g.id,
            "name": g.name,
            "created_at": g.created_at.isoformat() if g.created_at else None
        }
        for g in games
    ]


@app.get("/games/{game_id}")
async def get_game(game_id: int, session: AsyncSession = Depends(get_async_session)):
    game = await session.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    result = await session.execute(select(Player).where(Player.game_id == game_id))
    players = result.scalars().all()
    # include current active round id (from redis) for convenience
    current_round = await redis_client.get(f"game:{game_id}:current_round")
    return {
        "id": game.id,
        "created_at": game.created_at.isoformat() if game.created_at else None,
        "rounds": game.rounds,
        "host_player_id": game.host_player_id,
        "current_round_id": int(current_round) if current_round else None,
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
        raise HTTPException(404, "Game not found")
    p = Player(name=payload.player_name or "Player", game_id=game_id)
    session.add(p)
    await session.commit()
    await session.refresh(p)
    # notify via Socket.IO
    await sio.emit("player_joined", {"game_id": game_id, "player": {"id": p.id, "name": p.name}}, room=f"game_{game_id}")
    return {"player_id": p.id, "game_id": game_id}

# -------------------------------------------------
# Endpoint: start game (keeps schema unchanged; runtime state in redis)
# -------------------------------------------------
@app.post("/games/{game_id}/start")
async def start_game(
    game_id: int,
    payload: StartGamePayload,
    session: AsyncSession = Depends(get_async_session)
):
    game = await session.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.host_player_id != payload.host_id:
        raise HTTPException(403, "Only host can start the game")
    # mark game started in redis (we don't have a model field for started_at)
    await redis_client.set(f"game:{game_id}:started", "1")
    await sio.emit("game_started", {"game_id": game_id, "rounds": game.rounds}, room=f"game_{game_id}")
    return {"status": "started", "game_id": game_id}

# -------------------------------------------------
# Endpoint: start round
# - creates a Round row
# - picks a question and stores mapping in Redis: round:{round_id}:question -> question_id
# - sets revealed flag to "0"
# - sets game:{game_id}:current_round -> round_id
# - emits socket event with question text (hide text if you want)
# -------------------------------------------------
async def pick_random_question(session: AsyncSession, game_id: int) -> Question:
    """
    Pick a random Question that has NOT been used in this game.
    Uses Redis set `game:{game_id}:used_questions` to track used question ids.
    If no unused questions remain, raises HTTPException(400).
    """
    result = await session.execute(select(Question))
    questions = result.scalars().all()

    # read used question ids for this game from redis (strings)
    used_ids = set()
    if redis_client:
        used_strs = await redis_client.smembers(f"game:{game_id}:used_questions")
        if used_strs:
            # convert to ints if possible (guard against empty values)
            try:
                used_ids = set(int(x) for x in used_strs)
            except Exception:
                used_ids = set()

    # filter out used questions
    candidates = [q for q in questions if q.id not in used_ids]

    if not candidates:
        # no unused questions left for this game
        raise HTTPException(status_code=400, detail="No unused questions left for this game")

    return random.choice(candidates)


# -------------------------------------------------
# Endpoint: start round (UPDATED)
# -------------------------------------------------
@app.post("/games/{game_id}/start_round")
async def start_round(
    game_id: int,
    payload: StartRoundPayload,
    session: AsyncSession = Depends(get_async_session)
):
    game = await session.get(Game, game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.host_player_id != payload.host_id:
        raise HTTPException(403, "Only host can start rounds")

    # create round row
    rnd = Round(game_id=game_id)
    session.add(rnd)
    await session.commit()
    await session.refresh(rnd)

    # atomically increment the round counter for this game in Redis to get the round number
    # (guarantees sequential round numbers even under concurrency)
    round_num = 1
    if redis_client:
        round_num = await redis_client.incr(f"game:{game_id}:round_counter")

    # pick a question that hasn't been used in this game yet
    q = await pick_random_question(session, game_id)

    # persist mappings in redis
    # - round:{round_id}:question_id -> question id
    # - round:{round_id}:revealed -> "0"
    # - game:{game_id}:current_round -> round_id
    # - game:{game_id}:used_questions (set) add this question id
    await redis_client.set(f"round:{rnd.id}:question_id", q.id)
    await redis_client.set(f"round:{rnd.id}:revealed", "0")
    await redis_client.set(f"game:{game_id}:current_round", str(rnd.id))
    await redis_client.sadd(f"game:{game_id}:used_questions", str(q.id))

    # emit the new round (include round number and question text in payload)
    await sio.emit(
        "round_started",
        {
            "game_id": game_id,
            "round_id": rnd.id,
            "round_number": round_num,
            "question": {"id": q.id, "text": q.text},
        },
        room=f"game_{game_id}",
    )

    # return the round id, round number, question id and question text
    return {
        "round_number": round_num,
        "question_id": q.id,
        "question": q.text,
    }

# -------------------------------------------------
# Endpoint: submit answer for a round
# -------------------------------------------------
@app.post("/rounds/{round_id}/submit")
async def submit_answer(
    round_id: int,
    payload: SubmitAnswerPayload,
    session: AsyncSession = Depends(get_async_session)
):
    rnd = await session.get(Round, round_id)
    if not rnd:
        raise HTTPException(404, "Round not found")

    # ensure player belongs to that game (basic guard)
    player = await session.get(Player, payload.player_id)
    if not player or player.game_id != rnd.game_id:
        raise HTTPException(400, "Invalid player for this round")

    sub = Submission(round_id=round_id, player_id=payload.player_id, text=payload.text)
    session.add(sub)
    await session.commit()
    await session.refresh(sub)

    # notify other players
    await sio.emit("submission_received", {"round_id": round_id, "submission_id": sub.id}, room=f"game_{rnd.game_id}")

    return {"status": "submitted", "submission_id": sub.id}

# -------------------------------------------------
# Endpoint: reveal submissions for a round (host only)
# - flip revealed flag in redis and return all submissions
# -------------------------------------------------
@app.post("/rounds/{round_id}/reveal")
async def reveal_round(
    round_id: int,
    payload: RevealPayload,
    session: AsyncSession = Depends(get_async_session)
):
    rnd = await session.get(Round, round_id)
    if not rnd:
        raise HTTPException(404, "Round not found")

    game = await session.get(Game, rnd.game_id)
    if not game:
        raise HTTPException(404, "Game not found")
    if game.host_player_id != payload.host_id:
        raise HTTPException(403, "Only host can reveal")

    # set revealed flag
    await redis_client.set(f"round:{round_id}:revealed", "1")

    # fetch submissions
    result = await session.execute(select(Submission).where(Submission.round_id == round_id))
    subs = result.scalars().all()

    # emit revealed event with submissions
    await sio.emit("round_revealed", {"round_id": round_id, "submissions": [{"id": s.id, "text": s.text} for s in subs]}, room=f"game_{rnd.game_id}")

    return {"submissions": [{"id": s.id, "text": s.text} for s in subs]}

# -------------------------------------------------
# Endpoint: vote (requires round revealed)
# - uses Vote model's voter_player_id field
# -------------------------------------------------
@app.post("/rounds/{round_id}/vote")
async def vote_submission(
    round_id: int,
    payload: VotePayload,
    session: AsyncSession = Depends(get_async_session)
):
    rnd = await session.get(Round, round_id)
    if not rnd:
        raise HTTPException(404, "Round not found")

    # ensure round revealed
    revealed = await redis_client.get(f"round:{round_id}:revealed")
    if revealed != "1":
        raise HTTPException(400, "Round not revealed yet")

    # ensure player hasn't voted on this round
    existing = await session.execute(
        select(Vote).where(
            Vote.round_id == round_id,
            Vote.voter_player_id == payload.player_id,
        )
    )
    if existing.scalars().first():
        raise HTTPException(400, "Player already voted")

    # ensure submission exists and belongs to this round
    submission = await session.get(Submission, payload.submission_id)
    if not submission or submission.round_id != round_id:
        raise HTTPException(400, "Invalid submission for this round")

    vote = Vote(
        round_id=round_id,
        submission_id=payload.submission_id,
        voter_player_id=payload.player_id,
    )
    session.add(vote)
    await session.commit()
    await session.refresh(vote)

    # emit vote update (counts per submission) — compute counts quickly
    result_counts = await session.execute(select(Vote.submission_id).where(Vote.round_id == round_id))
    submission_ids = [row[0] for row in result_counts.all()]
    counts: Dict[int, int] = {}
    for sid in submission_ids:
        counts[sid] = counts.get(sid, 0) + 1

    await sio.emit("vote_update", {"round_id": round_id, "counts": counts}, room=f"game_{rnd.game_id}")

    return {"status": "voted", "vote_id": vote.id}

# -------------------------------------------------
# Endpoint: round results (calculate points per player for this round)
# - does NOT store aggregated player score in DB (models have no score field)
# - returns mapping player_id -> points for the round
# -------------------------------------------------
@app.get("/rounds/{round_id}/results")
async def round_results(
    round_id: int,
    session: AsyncSession = Depends(get_async_session)
):
    # join Vote -> Submission to find which player each vote credited
    q = select(Vote.submission_id, Submission.player_id).join(Submission, Submission.id == Vote.submission_id).where(Vote.round_id == round_id)
    result = await session.execute(q)
    rows = result.all()

    score_map: Dict[int, int] = {}
    for submission_id, player_id in rows:
        score_map[player_id] = score_map.get(player_id, 0) + 1

    return {"round_id": round_id, "scores": score_map}

# -------------------------------------------------
# Endpoint: game scores (aggregate over all rounds in a game)
# - returns computed scores per player for the game
# -------------------------------------------------
@app.get("/games/{game_id}/scores")
async def game_scores(
    game_id: int,
    session: AsyncSession = Depends(get_async_session)
):
    # collect round ids for game
    result_rounds = await session.execute(select(Round).where(Round.game_id == game_id))
    rounds = result_rounds.scalars().all()
    round_ids = [r.id for r in rounds]
    if not round_ids:
        return []

    # fetch votes for these rounds and map to player ids
    result = await session.execute(
        select(Vote.submission_id, Submission.player_id)
        .join(Submission, Submission.id == Vote.submission_id)
        .where(Vote.round_id.in_(round_ids))
    )
    rows = result.all()

    score_map: Dict[int, int] = {}
    for _, player_id in rows:
        score_map[player_id] = score_map.get(player_id, 0) + 1

    # assemble player info
    results = []
    for player_id, pts in score_map.items():
        player = await session.get(Player, player_id)
        results.append({"player_id": player_id, "player_name": player.name if player else None, "points": pts})

    results.sort(key=lambda x: x["points"], reverse=True)
    return results

# -------------------------------------------------
# Socket.IO: simple connection + join room handlers
# -------------------------------------------------
SID_TO_PLAYER: Dict[str, int] = {}

@sio.event
async def connect(sid, environ):
    print(f"✅ Client connected: {sid}")

@sio.event
async def disconnect(sid):
    SID_TO_PLAYER.pop(sid, None)
    print(f"❌ Client disconnected: {sid}")

@sio.event
async def join_game(sid, data):
    # joins room and returns current player list
    game_id = int(data.get("game_id", 0))
    name = data.get("name") or "Player"
    provided_id = data.get("player_id")

    async with async_session() as session:
        player = None

        if provided_id:
            player = await session.get(Player, provided_id)
            if player and player.game_id != game_id:
                player = None

        if not player:
            result = await session.execute(
                select(Player).where(Player.game_id == game_id, Player.name == name)
            )
            player = result.scalars().first()

        if not player:
            player = Player(name=name, game_id=game_id, ready=False)
            session.add(player)
            await session.commit()
            await session.refresh(player)

        SID_TO_PLAYER[sid] = player.id
        sio.enter_room(sid, f"game_{game_id}")

        result = await session.execute(select(Player).where(Player.game_id == game_id))
        players = result.scalars().all()

    await sio.emit(
        "player_list",
        {"players": [{"id": p.id, "name": p.name, "ready": p.ready} for p in players]},
        room=f"game_{game_id}",
    )

    await sio.emit("joined", {"player_id": player.id, "name": player.name}, to=sid)
