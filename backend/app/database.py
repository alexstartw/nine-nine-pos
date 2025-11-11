from __future__ import annotations

from pathlib import Path
from typing import Generator

from sqlmodel import Session, SQLModel, create_engine

from .config import DEFAULT_DB_PATH, get_settings

settings = get_settings()

# Ensure SQLite directory exists
Path(DEFAULT_DB_PATH).parent.mkdir(parents=True, exist_ok=True)

connect_args = {'check_same_thread': False} if settings.database_url.startswith('sqlite') else {}
engine = create_engine(settings.database_url, echo=False, connect_args=connect_args)


def init_db() -> None:
  SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
  with Session(engine) as session:
    yield session
