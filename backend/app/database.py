from __future__ import annotations

from pathlib import Path
from typing import Generator

from sqlmodel import Session, SQLModel, create_engine, select

from .config import DEFAULT_DB_PATH, get_settings

settings = get_settings()

# Ensure SQLite directory exists
Path(DEFAULT_DB_PATH).parent.mkdir(parents=True, exist_ok=True)

def _clean_db_url(url: str) -> str:
  """Strip PgBouncer-specific query params that SQLAlchemy/psycopg2 don't support."""
  return url.split('?')[0] if url.startswith('postgresql') else url

connect_args = {'check_same_thread': False} if settings.database_url.startswith('sqlite') else {}
engine = create_engine(_clean_db_url(settings.database_url), echo=False, connect_args=connect_args)


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


def _ensure_order_columns() -> None:
  if not settings.database_url.startswith('sqlite'):
    return

  with engine.begin() as conn:
    columns = {
      row['name']
      for row in conn.exec_driver_sql("PRAGMA table_info('orders')").mappings()
    }

    column_defaults = {
      'is_cancelled': "ALTER TABLE orders ADD COLUMN is_cancelled INTEGER DEFAULT 0",
      'gross_total': "ALTER TABLE orders ADD COLUMN gross_total REAL DEFAULT 0",
      'discount_total': "ALTER TABLE orders ADD COLUMN discount_total REAL DEFAULT 0",
      'cost_total': "ALTER TABLE orders ADD COLUMN cost_total REAL DEFAULT 0",
      'profit_total': "ALTER TABLE orders ADD COLUMN profit_total REAL DEFAULT 0",
      'payment_method': "ALTER TABLE orders ADD COLUMN payment_method TEXT DEFAULT 'cash'",
      'member_discount_applied': "ALTER TABLE orders ADD COLUMN member_discount_applied INTEGER DEFAULT 0",
      'birthday_discount_applied': "ALTER TABLE orders ADD COLUMN birthday_discount_applied INTEGER DEFAULT 0",
      'note': "ALTER TABLE orders ADD COLUMN note TEXT",
      'reservation_id': "ALTER TABLE orders ADD COLUMN reservation_id INTEGER REFERENCES reservations(id)"
    }

    for column, statement in column_defaults.items():
      if column not in columns:
        conn.exec_driver_sql(statement)

    conn.exec_driver_sql("""
      UPDATE orders
      SET payment_method = lower(payment_method)
      WHERE payment_method IN ('CASH', 'TRANSFER', 'MOBILE')
    """)

    conn.exec_driver_sql("""
      UPDATE orders
      SET payment_method = 'transfer'
      WHERE payment_method = 'card'
    """)


def _ensure_order_manual_discount_column() -> None:
  """Add manual_discount_rate to orders — runs for both SQLite and PostgreSQL."""
  is_sqlite = settings.database_url.startswith('sqlite')

  with engine.begin() as conn:
    if is_sqlite:
      columns = {
        row['name']
        for row in conn.exec_driver_sql("PRAGMA table_info('orders')").mappings()
      }
      if 'manual_discount_rate' not in columns:
        conn.exec_driver_sql(
          "ALTER TABLE orders ADD COLUMN manual_discount_rate REAL DEFAULT 0 NOT NULL"
        )
    else:
      exists = conn.exec_driver_sql("""
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'orders' AND column_name = 'manual_discount_rate'
      """).scalar_one_or_none()
      if not exists:
        conn.exec_driver_sql(
          "ALTER TABLE orders ADD COLUMN IF NOT EXISTS manual_discount_rate FLOAT NOT NULL DEFAULT 0"
        )


def _ensure_order_item_columns() -> None:
  if not settings.database_url.startswith('sqlite'):
    return

  with engine.begin() as conn:
    columns = {
      row['name']
      for row in conn.exec_driver_sql("PRAGMA table_info('order_items')").mappings()
    }

    if 'unit_price' not in columns:
      conn.exec_driver_sql("ALTER TABLE order_items ADD COLUMN unit_price REAL DEFAULT 0")
    if 'unit_cost' not in columns:
      conn.exec_driver_sql("ALTER TABLE order_items ADD COLUMN unit_cost REAL DEFAULT 0")
    if 'cost_subtotal' not in columns:
      conn.exec_driver_sql("ALTER TABLE order_items ADD COLUMN cost_subtotal REAL DEFAULT 0")
    if 'custom_reason' not in columns:
      conn.exec_driver_sql("ALTER TABLE order_items ADD COLUMN custom_reason TEXT")


def _ensure_reservation_columns() -> None:
  if not settings.database_url.startswith('sqlite'):
    return

  with engine.begin() as conn:
    columns = {
      row['name']
      for row in conn.exec_driver_sql("PRAGMA table_info('reservations')").mappings()
    }

    if 'member_id' not in columns:
      conn.exec_driver_sql("ALTER TABLE reservations ADD COLUMN member_id INTEGER REFERENCES members(id)")
    if 'order_id' not in columns:
      conn.exec_driver_sql("ALTER TABLE reservations ADD COLUMN order_id INTEGER REFERENCES orders(id)")

    # backfill data length placeholder columns remain; quantity is kept for summary


def _ensure_reservation_items_table() -> None:
  if not settings.database_url.startswith('sqlite'):
    return

  with engine.begin() as conn:
    has_table = conn.exec_driver_sql("""
      SELECT name FROM sqlite_master WHERE type='table' AND name='reservation_items'
    """).scalar_one_or_none()

    if not has_table:
      conn.exec_driver_sql("""
        CREATE TABLE reservation_items (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          reservation_id INTEGER NOT NULL REFERENCES reservations(id),
          product_id INTEGER NOT NULL REFERENCES products(id),
          quantity INTEGER NOT NULL DEFAULT 1
        )
      """)

    # backfill from legacy single-product reservations if table is empty
    row_count = conn.exec_driver_sql("SELECT COUNT(*) FROM reservation_items").scalar_one()
    if row_count == 0:
      conn.exec_driver_sql("""
        INSERT INTO reservation_items (reservation_id, product_id, quantity)
        SELECT id, product_id, quantity
        FROM reservations
        WHERE product_id IS NOT NULL
      """)


def seed_default_admin() -> None:
  from .models import User, UserRole
  from .security.passwords import hash_password

  s = get_settings()
  if not s.admin_username or not s.admin_password:
    return

  with Session(engine) as session:
    existing_admin = session.exec(
      select(User).where(User.role == UserRole.ADMIN, User.is_active == True)
    ).first()
    if existing_admin:
      return

    same_name = session.exec(select(User).where(User.username == s.admin_username)).first()
    if same_name:
      return

    session.add(User(
      username=s.admin_username,
      password_hash=hash_password(s.admin_password),
      role=UserRole.ADMIN,
      is_active=True,
      display_name='Administrator',
    ))
    session.commit()


def init_db() -> None:
  from . import models  # noqa: F401 — 確保所有 SQLModel table 都已註冊進 metadata
  SQLModel.metadata.create_all(engine)
  _ensure_product_timestamp_columns()
  _ensure_stock_entry_columns()
  _ensure_member_columns()
  _ensure_order_columns()
  _ensure_order_manual_discount_column()
  _ensure_order_item_columns()
  _ensure_reservation_columns()
  _ensure_reservation_items_table()
  seed_default_admin()


def get_session() -> Generator[Session, None, None]:
  with Session(engine) as session:
    yield session
