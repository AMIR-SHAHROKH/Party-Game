# backend/app/admin_model.py
from sqlmodel import SQLModel, Field
from typing import Optional

class Admin(SQLModel, table=True):
    __tablename__ = "admin"
    __table_args__ = {"extend_existing": True}  # <-- fix duplicate table error

    id: Optional[int] = Field(default=None, primary_key=True)
    username: str = Field(index=True, nullable=False, unique=True)
    email: str = Field(index=True, nullable=False, unique=True)
    password: str = Field(nullable=False)
