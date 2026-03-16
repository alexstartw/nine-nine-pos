from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from ..database import get_session
from ..models import ReservationPaymentStatus, ReservationStatus, ReservationType
from ..schemas import (
  MemberSuggestion,
  PaginatedResponse,
  PaginationParams,
  ReservationCreate,
  ReservationRead,
  ReservationUpdate,
)
from ..services.reservation_service import ReservationService

router = APIRouter(prefix='/reservations', tags=['reservations'])


@router.get('', response_model=PaginatedResponse[ReservationRead])
def list_reservations(
  params: PaginationParams = Depends(),
  reservation_type: Optional[ReservationType] = Query(default=None),
  status_filter: Optional[ReservationStatus] = Query(default=None, alias='status'),
  payment_status: Optional[ReservationPaymentStatus] = Query(default=None),
  q: Optional[str] = Query(default=None),
  session: Session = Depends(get_session)
):
  return ReservationService(session).list(
    params.page, params.size, params.offset,
    reservation_type, status_filter, payment_status, q
  )


@router.get('/member-suggestions', response_model=List[MemberSuggestion])
def member_suggestions(
  q: str = Query(..., min_length=1),
  session: Session = Depends(get_session)
):
  return ReservationService(session).search_members(q)


@router.post('', response_model=ReservationRead, status_code=status.HTTP_201_CREATED)
def create_reservation(payload: ReservationCreate, session: Session = Depends(get_session)):
  return ReservationService(session).create(payload)


@router.put('/{reservation_id}', response_model=ReservationRead)
def update_reservation(reservation_id: int, payload: ReservationUpdate, session: Session = Depends(get_session)):
  return ReservationService(session).update(reservation_id, payload)
