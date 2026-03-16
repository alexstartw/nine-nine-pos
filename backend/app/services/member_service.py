from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlmodel import Session

from ..models import Member
from ..schemas import MemberCreate, MemberRead, MemberUpdate, OrderMemberInfo, PaginatedResponse
from ..utils.time_utils import utc8_now


class MemberService:
  def __init__(self, session: Session) -> None:
    self.session = session

  def list(
    self,
    page: int,
    size: int,
    offset: int,
    q: Optional[str] = None,
    sort: Optional[str] = None,
    sort_dir: str = 'desc'
  ) -> PaginatedResponse[MemberRead]:
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
    total = self.session.exec(total_query).scalar_one()

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

    statement = statement.order_by(sort_field).offset(offset).limit(size)
    members = self.session.exec(statement).scalars().all()
    data = [MemberRead.model_validate(m, from_attributes=True) for m in members]
    return PaginatedResponse[MemberRead](data=data, total=total, page=page, size=size)

  def get_by_id(self, member_id: int) -> Member:
    member = self.session.get(Member, member_id)
    if not member:
      raise HTTPException(status_code=404, detail='Member not found')
    return member

  def create(self, payload: MemberCreate) -> MemberRead:
    member = Member(**payload.model_dump())
    self.session.add(member)
    self.session.commit()
    self._ensure_member_code(member)
    self.session.refresh(member)
    return MemberRead.model_validate(member, from_attributes=True)

  def update(self, member_id: int, payload: MemberUpdate) -> MemberRead:
    member = self.get_by_id(member_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
      setattr(member, key, value)
    member.updated_at = utc8_now()
    self.session.add(member)
    self.session.commit()
    self.session.refresh(member)
    return MemberRead.model_validate(member, from_attributes=True)

  def delete(self, member_id: int) -> None:
    member = self.get_by_id(member_id)
    self.session.delete(member)
    self.session.commit()

  def build_order_member_info(self, member: Optional[Member]) -> Optional[OrderMemberInfo]:
    if not member:
      return None
    return OrderMemberInfo(
      id=member.id,
      member_code=member.member_code,
      name=member.name,
      phone=member.phone
    )

  def _ensure_member_code(self, member: Member) -> None:
    if member.member_code:
      return
    member.member_code = f'MEM{member.id:05d}'
    self.session.add(member)
    self.session.commit()
    self.session.refresh(member)
