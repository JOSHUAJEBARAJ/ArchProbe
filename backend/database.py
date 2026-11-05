from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase

DATA_DIR = Path(__file__).resolve().parent / "data"
DATA_DIR.mkdir(exist_ok=True)

DATABASE_PATH = DATA_DIR / "archprobe.db"

engine = create_engine(f"sqlite:///{DATABASE_PATH}")


class Base(DeclarativeBase):
    pass