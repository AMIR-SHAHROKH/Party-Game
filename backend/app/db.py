import asyncio
from sqlmodel import SQLModel
from sqlmodel.ext.asyncio.session import AsyncSession
from sqlalchemy.ext.asyncio import create_async_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import OperationalError

DATABASE_URL = "postgresql+asyncpg://postgres:postgres@db:5432/postgres"

engine = create_async_engine(DATABASE_URL, echo=True, future=True)

async_session = sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)

# Dependency
async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session

# Wait for DB
async def wait_for_db(retries=10, delay=2):
    for i in range(retries):
        try:
            async with engine.begin() as conn:
                await conn.run_sync(lambda sync_conn: None)
            print("✅ Database ready")
            return
        except OperationalError:
            print(f"⏳ Database not ready, retrying {i+1}/{retries}...")
            await asyncio.sleep(delay)
    raise RuntimeError("❌ Could not connect to the database")

# Create tables
async def create_db_and_tables():
    async with engine.begin() as conn:
        await conn.run_sync(SQLModel.metadata.create_all)
    print("✅ Tables created")
