from __future__ import annotations

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from ..auth import require_staff
from ..database import get_session
from ..schemas import MemberCreate, MemberOrderRecord, MemberPurchaseItem, MemberRead, MemberUpdate, PaginatedResponse, PaginationParams
from ..services.member_service import MemberService

router = APIRouter(prefix='/members', tags=['members'], dependencies=[Depends(require_staff)])


@router.get('', response_model=PaginatedResponse[MemberRead])
def list_members(
  params: PaginationParams = Depends(),
  q: str | None = Query(default=None),
  sort: str | None = Query(default=None),
  sort_dir: str = Query(default='desc'),
  session: Session = Depends(get_session)
):
  return MemberService(session).list(params.page, params.size, params.offset, q, sort, sort_dir)


@router.post('', response_model=MemberRead, status_code=status.HTTP_201_CREATED)
def create_member(payload: MemberCreate, session: Session = Depends(get_session)):
  return MemberService(session).create(payload)


@router.get('/{member_id}', response_model=MemberRead)
def get_member(member_id: int, session: Session = Depends(get_session)):
  member = MemberService(session).get_by_id(member_id)
  return MemberRead.model_validate(member, from_attributes=True)


@router.put('/{member_id}', response_model=MemberRead)
def update_member(member_id: int, payload: MemberUpdate, session: Session = Depends(get_session)):
  return MemberService(session).update(member_id, payload)


@router.get('/{member_id}/orders', response_model=PaginatedResponse[MemberOrderRecord])
def get_member_orders(
  member_id: int,
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session)
):
  return MemberService(session).get_orders(member_id, params.page, params.size, params.offset)


@router.get('/{member_id}/items', response_model=PaginatedResponse[MemberPurchaseItem])
def get_member_purchase_items(
  member_id: int,
  params: PaginationParams = Depends(),
  q: str | None = Query(default=None, description='搜尋品名或條碼'),
  session: Session = Depends(get_session)
):
  return MemberService(session).get_purchase_items(
    member_id, params.page, params.size, params.offset, q
  )


@router.delete('/{member_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_member(member_id: int, session: Session = Depends(get_session)):
  MemberService(session).delete(member_id)
