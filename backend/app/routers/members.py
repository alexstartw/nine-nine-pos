from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Member
from ..schemas import MemberCreate, MemberRead, MemberUpdate, PaginatedResponse, PaginationParams

router = APIRouter(prefix='/members', tags=['members'])


@router.get('', response_model=PaginatedResponse[MemberRead])
def list_members(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session)
):
  total = session.exec(select(func.count()).select_from(Member)).scalar_one()
  statement = (
    select(Member)
    .order_by(Member.created_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )
  members = session.exec(statement).scalars().all()
  data = [MemberRead.model_validate(member, from_attributes=True) for member in members]
  return PaginatedResponse[MemberRead](data=data, total=total, page=params.page, size=params.size)


def _ensure_member_code(member: Member, session: Session) -> None:
  if member.member_code:
    return
  member.member_code = f'MEM{member.id:05d}'
  session.add(member)
  session.commit()
  session.refresh(member)


@router.post('', response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def create_member(
  payload: MemberCreate,
  session: Session = Depends(get_session)
):
  member = Member(**payload.model_dump())
  session.add(member)
  session.commit()
  _ensure_member_code(member, session)
  session.refresh(member)
  return MemberRead.model_validate(member, from_attributes=True)


@router.get('/{member_id}', response_model=MemberRead)
def get_member(member_id: int, session: Session = Depends(get_session)):
  member = session.get(Member, member_id)
  if not member:
    raise HTTPException(status_code=404, detail='Member not found')
  return MemberRead.model_validate(member, from_attributes=True)


@router.put('/{member_id}', response_model=MemberRead)
def update_member(
  member_id: int,
  payload: MemberUpdate,
  session: Session = Depends(get_session)
):
  member = session.get(Member, member_id)
  if not member:
    raise HTTPException(status_code=404, detail='Member not found')

  update_data = payload.model_dump(exclude_unset=True)
  for key, value in update_data.items():
    setattr(member, key, value)
  member.updated_at = datetime.utcnow()

  session.add(member)
  session.commit()
  session.refresh(member)
  return MemberRead.model_validate(member, from_attributes=True)


@router.delete('/{member_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_member(member_id: int, session: Session = Depends(get_session)):
  member = session.get(Member, member_id)
  if not member:
    raise HTTPException(status_code=404, detail='Member not found')
  session.delete(member)
  session.commit()
  return None
