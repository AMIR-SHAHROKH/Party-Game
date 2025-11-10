from sqlmodel import SQLModel, create_engine
import os

DATABASE_URL = os.environ.get("DATABASE_URL","sqlite:///./db.sqlite3")

_engine = None
def get_engine():
    global _engine
    if _engine is None:
        _engine = create_engine(DATABASE_URL, echo=False)
    return _engine

def create_db_and_tables():
    engine = get_engine()
    SQLModel.metadata.create_all(engine)
