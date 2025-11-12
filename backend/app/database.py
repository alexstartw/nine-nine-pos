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


def _ensure_product_timestamp_columns() -> None:
  if not settings.database_url.startswith('sqlite'):
    return

  with engine.begin() as conn:
    columns = {
      row['name']
      for row in conn.exec_driver_sql("PRAGMA table_info('products')").mappings()
    }

    if 'first_stocked_at' not in columns:
      conn.exec_driver_sql("ALTER TABLE products ADD COLUMN first_stocked_at DATETIME")
      conn.exec_driver_sql("UPDATE products SET first_stocked_at = created_at WHERE first_stocked_at IS NULL")

    if 'data_updated_at' not in columns:
      conn.exec_driver_sql("ALTER TABLE products ADD COLUMN data_updated_at DATETIME")
      conn.exec_driver_sql("UPDATE products SET data_updated_at = updated_at WHERE data_updated_at IS NULL")


def init_db() -> None:
  SQLModel.metadata.create_all(engine)
  _ensure_product_timestamp_columns()


def get_session() -> Generator[Session, None, None]:
  with Session(engine) as session:
    yield session
