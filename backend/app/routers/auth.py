from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlmodel import Session

from ..auth import create_token
from ..database import get_session
from ..services.user_service import UserService
from ..utils.rate_limit import login_rate_limiter

router = APIRouter(prefix='/auth', tags=['auth'])


class LoginRequest(BaseModel):
  username: str
  password: str


class LoginResponse(BaseModel):
  access_token: str
  role: str


def _client_key(request: Request, username: str) -> str:
  # 不自行解析 X-Forwarded-For：第一段可由客戶端任意偽造，每次換值就能繞過鎖定。
  # uvicorn 的 proxy_headers（預設信任 127.0.0.1，即同 container 的 nginx）
  # 已從可信 proxy 往回解析出真實來源 IP 並放在 request.client.host。
  # 再加上帳號名稱：同一出口 IP 的其他人不會因別人輸錯而被一起鎖住。
  ip = request.client.host if request.client else 'unknown'
  return f'{ip}|{username.strip().lower()}'


@router.post('/login', response_model=LoginResponse)
def login(
  body: LoginRequest,
  request: Request,
  session: Session = Depends(get_session),
) -> LoginResponse:
  key = _client_key(request, body.username)
  login_rate_limiter.check(key)

  user = UserService(session).authenticate(body.username, body.password)
  if not user:
    login_rate_limiter.record_failure(key)
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='帳號或密碼錯誤')

  login_rate_limiter.record_success(key)
  return LoginResponse(
    access_token=create_token(user.username, user.role),
    role=user.role,
  )
