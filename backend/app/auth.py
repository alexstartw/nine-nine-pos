from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Annotated

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .config import get_settings

_bearer = HTTPBearer()


def create_token(username: str, role: str) -> str:
  settings = get_settings()
  payload = {
    'sub': username,
    'role': role,
    'exp': datetime.now(timezone.utc) + timedelta(hours=settings.jwt_expire_hours),
  }
  return jwt.encode(payload, settings.jwt_secret, algorithm='HS256')


def get_current_user(
  credentials: Annotated[HTTPAuthorizationCredentials, Depends(_bearer)],
) -> dict:
  settings = get_settings()
  try:
    payload = jwt.decode(
      credentials.credentials,
      settings.jwt_secret,
      algorithms=['HS256'],
    )
    return {'username': payload['sub'], 'role': payload['role']}
  except jwt.ExpiredSignatureError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Token expired')
  except jwt.InvalidTokenError:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='Invalid token')


def require_admin(user: Annotated[dict, Depends(get_current_user)]) -> dict:
  if user['role'] != 'admin':
    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail='Admin only')
  return user


def require_staff(user: Annotated[dict, Depends(get_current_user)]) -> dict:
  """Allow both admin and staff."""
  return user
