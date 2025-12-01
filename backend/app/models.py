from sqlmodel import SQLModel, Field, Relationship
from datetime import datetime
from typing import Optional, List

class Question(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    text: str

class Game(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    rounds: int = 10
    host_player_id: Optional[int] = None
    players: List["Player"] = Relationship(back_populates="game")

class Player(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str
    game_id: int = Field(foreign_key="game.id")
    ready: bool = False
    game: Optional[Game] = Relationship(back_populates="players")

class Round(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    game_id: int = Field(foreign_key="game.id")

class Submission(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    player_id: int = Field(foreign_key="player.id")
    round_id: int = Field(foreign_key="round.id")
    text: str

class Vote(SQLModel, table=True):
    id: Optional[int] = Field(default=None, primary_key=True)
    round_id: int = Field(foreign_key="round.id")
    submission_id: int = Field(foreign_key="submission.id")
    voter_player_id: int = Field(foreign_key="player.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
