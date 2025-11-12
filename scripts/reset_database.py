#!/usr/bin/env python3
"""
Utility script to purge all data from the database while keeping the schema intact.

Usage:
  python scripts/reset_database.py      # prompts for confirmation
  python scripts/reset_database.py --yes
"""
from __future__ import annotations

import argparse
import sys

from pathlib import Path
import sys

from sqlalchemy import text
from sqlmodel import SQLModel

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / 'backend'

for path in (ROOT_DIR, BACKEND_DIR):
  path_str = str(path)
  if path_str not in sys.path:
    sys.path.insert(0, path_str)

from app.database import engine
from app import models  # noqa: F401  # Ensure SQLModel metadata is populated


def truncate_all_tables(drop_sequences: bool = False) -> None:
  with engine.connect() as conn:
    trans = conn.begin()
    dialect = engine.dialect.name

    if dialect == 'sqlite':
      conn.execute(text('PRAGMA foreign_keys = OFF;'))

    for table in reversed(SQLModel.metadata.sorted_tables):
      conn.execute(table.delete())

    if drop_sequences and dialect != 'sqlite':
      for table in SQLModel.metadata.sorted_tables:
        if table.sequence is not None:
          conn.execute(table.sequence.drop(engine, checkfirst=True))
          conn.execute(table.sequence.create(engine, checkfirst=True))

    if dialect == 'sqlite':
      conn.execute(text('PRAGMA foreign_keys = ON;'))
    trans.commit()


def main() -> None:
  parser = argparse.ArgumentParser(description='Delete all data while preserving schema.')
  parser.add_argument(
    '--yes',
    action='store_true',
    help='Skip the confirmation prompt.'
  )
  args = parser.parse_args()

  if not args.yes:
    confirm = input(
      'This will delete ALL data from the database (schema will stay intact). Continue? [y/N]: '
    ).strip().lower()
    if confirm not in {'y', 'yes'}:
      print('Aborted.')
      sys.exit(0)

  truncate_all_tables()
  print('All data truncated successfully.')


if __name__ == '__main__':
  main()
