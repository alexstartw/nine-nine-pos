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

    if 'last_stocked_at' not in columns:
      conn.exec_driver_sql("ALTER TABLE products ADD COLUMN last_stocked_at DATETIME")
      conn.exec_driver_sql("UPDATE products SET last_stocked_at = created_at WHERE last_stocked_at IS NULL")


def _ensure_stock_entry_columns() -> None:
  if not settings.database_url.startswith('sqlite'):
    return

  with engine.begin() as conn:
    columns = {
      row['name']
      for row in conn.exec_driver_sql("PRAGMA table_info('stock_entries')").mappings()
    }
    if 'batch_id' not in columns:
      conn.exec_driver_sql("ALTER TABLE stock_entries ADD COLUMN batch_id TEXT")


def _ensure_member_columns() -> None:
  if not settings.database_url.startswith('sqlite'):
    return

  with engine.begin() as conn:
    columns = {
      row['name']
      for row in conn.exec_driver_sql("PRAGMA table_info('members')").mappings()
    }

    if 'member_code' not in columns:
      conn.exec_driver_sql("ALTER TABLE members ADD COLUMN member_code TEXT")
    if 'birthday' not in columns:
      conn.exec_driver_sql("ALTER TABLE members ADD COLUMN birthday DATE")
    if 'joined_date' not in columns:
      conn.exec_driver_sql("ALTER TABLE members ADD COLUMN joined_date DATE")
    if 'note' not in columns:
      conn.exec_driver_sql("ALTER TABLE members ADD COLUMN note TEXT")

    conn.exec_driver_sql("""
      UPDATE members
      SET member_code = COALESCE(
        NULLIF(member_code, ''),
        printf('MEM%05d', id)
      )
      WHERE member_code IS NULL OR member_code = ''
    """)

    conn.exec_driver_sql("""
      CREATE UNIQUE INDEX IF NOT EXISTS idx_members_member_code
      ON members(member_code)
    """)


def init_db() -> None:
  SQLModel.metadata.create_all(engine)
  _ensure_product_timestamp_columns()
  _ensure_stock_entry_columns()
  _ensure_member_columns()


def get_session() -> Generator[Session, None, None]:
  with Session(engine) as session:
    yield session
