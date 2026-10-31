from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlmodel import Session, select

from .config import get_settings
from .database import get_session
from .models import User

# auto_error=False：缺 token 時由我們回 401（HTTPBearer 預設回 403，前端不會導回登入頁）
_bearer = HTTPBearer(auto_error=False)


def create_token(username: str, role: str) -> str:
  settings = get_settings()
  payload = {
    'sub': username,
    'role': role,
    'exp': datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours),
  }
  return jwt.encode(payload, settings.jwt_secret, algorithm='HS256')


def get_current_user(
  credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(_bearer)],
  session: Annotated[Session, Depends(get_session)],
) -> dict:
  if credentials is None:
    raise HTTPException(
      status_code=status.HTTP_401_UNAUTHORIZED,
      detail='Not authenticated',
      headers={'WWW-Authenticate': 'Bearer'},
    )
  settings = get_settings()
  try:
    payload = jwt.decode(
      credentials.credentials,
      settings.jwt_secret,
      algorithms=['HS256'],
    )
    username = payload['sub']
  except jwt.ExpiredSignatureError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token expired')
  except (jwt.InvalidTokenError, KeyError):
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')

  # 每次請求都回 DB 確認帳號狀態：停用或刪除的帳號立即失效，
  # 角色以 DB 為準（降權後舊 token 不再帶有管理員權限）。
  user = session.exec(select(User).where(User.username == username)).first()
  if user is None or not user.is_active:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='帳號已停用或不存在')
  role = getattr(user.role, 'value', user.role)
  return {'username': user.username, 'role': role}


def is_admin(user: dict) -> bool:
  return user.get('role') == 'admin'


def require_admin(user: Annotated[dict, Depends(get_current_user)]) -> dict:
  if user['role'] != 'admin':
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin only')
  return user


def require_staff(user: Annotated[dict, Depends(get_current_user)]) -> dict:
  """Allow both admin and staff."""
  return user
