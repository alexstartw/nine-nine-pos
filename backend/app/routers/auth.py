from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from ..auth import create_token
from ..config import get_settings

router = APIRouter(prefix='/auth', tags=['auth'])


class LoginRequest(BaseModel):
  username: str
  password: str


class LoginResponse(BaseModel):
  access_token: str
  role: str


@router.post('/login', response_model=LoginResponse)
def login(body: LoginRequest) -> LoginResponse:
  settings = get_settings()
  if body.username == settings.admin_username and body.password == settings.admin_password:
    return LoginResponse(access_token=create_token(body.username, 'admin'), role='admin')
  if body.username == settings.staff_username and body.password == settings.staff_password:
    return LoginResponse(access_token=create_token(body.username, 'staff'), role='staff')
  raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail='帳號或密碼錯誤')
