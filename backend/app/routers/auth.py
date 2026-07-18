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


def _client_key(request: Request) -> str:
  # Honour proxy header (ngrok/reverse proxy) then fall back to socket peer.
  forwarded = request.headers.get('x-forwarded-for')
  if forwarded:
    return forwarded.split(',')[0].strip()
  return request.client.host if request.client else 'unknown'


@router.post('/login', response_model=LoginResponse)
def login(
  body: LoginRequest,
  request: Request,
  session: Session = Depends(get_session),
) -> LoginResponse:
  key = _client_key(request)
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
