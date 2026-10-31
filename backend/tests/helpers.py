"""測試共用：建立帳號與對應的 Authorization header。

get_current_user 每次請求都會回 DB 確認帳號，因此 token 必須對應到 DB 中存在且啟用的帳號。
"""
from __future__ import annotations

from sqlmodel import Session, select

from app.auth import create_token
from app.models import User, UserRole
from app.security.passwords import hash_password

STAFF_USERNAME = 'staff_user'
ADMIN_USERNAME = 'admin_user'
TEST_PASSWORD = 'correct-password'


def bearer(username: str, role: str) -> dict[str, str]:
  return {'Authorization': f'Bearer {create_token(username, role)}'}


STAFF = bearer(STAFF_USERNAME, 'staff')
ADMIN = bearer(ADMIN_USERNAME, 'admin')


def create_user(engine, username: str, role: str, is_active: bool = True) -> None:
  with Session(engine) as session:
    if session.exec(select(User).where(User.username == username)).first():
      return
    session.add(User(
      username=username,
      password_hash=hash_password(TEST_PASSWORD),
      role=UserRole.ADMIN if role == 'admin' else UserRole.STAFF,
      is_active=is_active,
    ))
    session.commit()


def seed_users(engine) -> None:
  create_user(engine, STAFF_USERNAME, 'staff')
  create_user(engine, ADMIN_USERNAME, 'admin')
