from __future__ import annotations

from typing import Optional

from fastapi import HTTPException, status
from sqlmodel import Session, select

from ..models import User, UserRole
from ..schemas import PasswordResetRequest, UserCreate, UserRead, UserUpdate
from ..security.passwords import hash_password, verify_password


class UserService:
  def __init__(self, session: Session) -> None:
    self.session = session

  def list(self, page: int = 1, size: int = 20) -> tuple[list[UserRead], int]:
    offset = (page - 1) * size
    users = self.session.exec(select(User).offset(offset).limit(size)).all()
    total = len(self.session.exec(select(User)).all())
    return [UserRead.model_validate(u) for u in users], total

  def get_by_id(self, user_id: int) -> UserRead:
    user = self.session.get(User, user_id)
    if not user:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='用戶不存在')
    return UserRead.model_validate(user)

  def create(self, data: UserCreate) -> UserRead:
    existing = self.session.exec(select(User).where(User.username == data.username)).first()
    if existing:
      raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail='帳號已存在')
    user = User(
      username=data.username,
      password_hash=hash_password(data.password),
      role=data.role,
      is_active=True,
      display_name=data.display_name,
    )
    self.session.add(user)
    self.session.commit()
    self.session.refresh(user)
    return UserRead.model_validate(user)

  def update(self, user_id: int, data: UserUpdate, current_username: str) -> UserRead:
    user = self.session.get(User, user_id)
    if not user:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='用戶不存在')

    if data.role is not None and data.role != user.role:
      if user.username == current_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='不可修改自己的角色')
      if user.role == UserRole.ADMIN:
        self._assert_not_last_admin(user_id)

    if data.is_active is False and data.is_active != user.is_active:
      if user.username == current_username:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail='不可停用自己的帳號')
      if user.role == UserRole.ADMIN:
        self._assert_not_last_admin(user_id)

    if data.role is not None:
      user.role = data.role
    if data.display_name is not None:
      user.display_name = data.display_name
    if data.is_active is not None:
      user.is_active = data.is_active

    self.session.add(user)
    self.session.commit()
    self.session.refresh(user)
    return UserRead.model_validate(user)

  def reset_password(self, user_id: int, data: PasswordResetRequest) -> None:
    user = self.session.get(User, user_id)
    if not user:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='用戶不存在')
    user.password_hash = hash_password(data.new_password)
    self.session.add(user)
    self.session.commit()

  def authenticate(self, username: str, password: str) -> Optional[User]:
    user = self.session.exec(select(User).where(User.username == username)).first()
    if not user or not user.is_active:
      return None
    if not verify_password(password, user.password_hash):
      return None
    return user

  def _assert_not_last_admin(self, exclude_user_id: int) -> None:
    admins = self.session.exec(
      select(User).where(User.role == UserRole.ADMIN, User.is_active == True)
    ).all()
    active_admins = [a for a in admins if a.id != exclude_user_id]
    if not active_admins:
      raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail='系統需至少保留一個啟用中的管理員',
      )
