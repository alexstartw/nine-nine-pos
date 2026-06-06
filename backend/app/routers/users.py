from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response
from sqlmodel import Session

from ..auth import require_admin
from ..database import get_session
from ..schemas import (
  PaginatedResponse,
  PasswordResetRequest,
  UserCreate,
  UserRead,
  UserUpdate,
)
from ..services.user_service import UserService

router = APIRouter(
  prefix='/users',
  tags=['users'],
  dependencies=[Depends(require_admin)],
)


@router.get('', response_model=PaginatedResponse[UserRead])
def list_users(
  page: int = 1,
  size: int = 20,
  session: Session = Depends(get_session),
) -> PaginatedResponse[UserRead]:
  users, total = UserService(session).list(page=page, size=size)
  return PaginatedResponse(data=users, total=total, page=page, size=size)


@router.post('', response_model=UserRead, status_code=201)
def create_user(
  body: UserCreate,
  session: Session = Depends(get_session),
) -> UserRead:
  return UserService(session).create(body)


@router.get('/{user_id}', response_model=UserRead)
def get_user(user_id: int, session: Session = Depends(get_session)) -> UserRead:
  return UserService(session).get_by_id(user_id)


@router.put('/{user_id}', response_model=UserRead)
def update_user(
  user_id: int,
  body: UserUpdate,
  current_user: Annotated[dict, Depends(require_admin)],
  session: Session = Depends(get_session),
) -> UserRead:
  return UserService(session).update(user_id, body, current_user['username'])


@router.post('/{user_id}/reset-password')
def reset_password(
  user_id: int,
  body: PasswordResetRequest,
  session: Session = Depends(get_session),
) -> Response:
  UserService(session).reset_password(user_id, body)
  return Response(status_code=204)
