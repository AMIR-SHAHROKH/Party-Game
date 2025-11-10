# backend/app/db.py
from sqlmodel import SQLModel, create_engine, Session
import os

# --- Database connection ---
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@db:5432/postgres")
engine = create_engine(DATABASE_URL, echo=True)

# --- Session factory ---
def get_session():
    with Session(engine) as session:
        yield session

# --- Create all tables ---
def create_db_and_tables():
    SQLModel.metadata.create_all(engine)
