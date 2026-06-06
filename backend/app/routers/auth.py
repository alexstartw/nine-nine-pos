from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlmodel import Session

from ..auth import create_token
from ..database import get_session
from ..services.user_service import UserService

router = APIRouter(prefix='/auth', tags=['auth'])


class LoginRequest(BaseModel):
  username: str
  password: str


class LoginResponse(BaseModel):
  access_token: str
  role: str


@router.post('/login', response_model=LoginResponse)
def login(body: LoginRequest, session: Session = Depends(get_session)) -> LoginResponse:
  user = UserService(session).authenticate(body.username, body.password)
  if not user:
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='帳號或密碼錯誤')
  return LoginResponse(
    access_token=create_token(user.username, user.role),
    role=user.role,
  )
