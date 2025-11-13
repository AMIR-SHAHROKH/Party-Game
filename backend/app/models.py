# backend/app/models.py
from sqlmodel import SQLModel, Field
from typing import Optional
from datetime import datetime

class Question(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    text: str

class Game(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    game_id: int

class Round(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    game_id: int
    question_id: int
    state: str = "collecting"

class Submission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    round_id: int
    player_id: int
    text: str
    created_at: datetime = Field(default_factory=datetime.utcnow)

class Vote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    round_id: int
    submission_id: int
    voter_player_id: int
    created_at: datetime = Field(default_factory=datetime.utcnow)

class JoinGamePayload(BaseModel):
    player_name: str