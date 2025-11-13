from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Member
from ..schemas import MemberCreate, MemberRead, MemberUpdate, PaginatedResponse, PaginationParams
from ..utils.time_utils import utc8_now

router = APIRouter(prefix='/members', tags=['members'])


@router.get('', response_model=PaginatedResponse[MemberRead])
def list_members(
  params: PaginationParams = Depends(),
  q: str | None = Query(default=None, description='關鍵字（姓名、電話、會員 ID 或備註）'),
  sort: str | None = Query(default=None, description='排序欄位，可用 name, joined, created'),
  sort_dir: str = Query(default='desc', description='asc 或 desc'),
  session: Session = Depends(get_session)
):
  filters = []
  if q:
    keyword = f'%{q.strip()}%'
    filters.append(
      Member.name.ilike(keyword)
      | Member.phone.ilike(keyword)
      | Member.member_code.ilike(keyword)
      | Member.note.ilike(keyword)
    )

  total_query = select(func.count()).select_from(Member)
  if filters:
    total_query = total_query.where(*filters)
  total = session.exec(total_query).scalar_one()

  statement = select(Member)
  if filters:
    statement = statement.where(*filters)

  sort_field = Member.created_at
  if sort == 'name':
    sort_field = Member.name
  elif sort == 'joined':
    sort_field = Member.joined_date
  elif sort == 'updated':
    sort_field = Member.updated_at

  sort_field = sort_field.desc() if sort_dir.lower() != 'asc' else sort_field.asc()

  statement = statement.order_by(sort_field).offset(params.offset).limit(params.size)
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
  member.updated_at = utc8_now()

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
