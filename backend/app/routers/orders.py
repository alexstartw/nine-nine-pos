from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from ..auth import require_admin
from ..database import get_session
from ..schemas import OrderRead, OrderUpdateRequest, PaginatedResponse, PaginationParams
from ..services.order_service import OrderService

router = APIRouter(prefix='/orders', tags=['orders'], dependencies=[Depends(require_admin)])


@router.get('', response_model=PaginatedResponse[OrderRead])
def list_orders(
  target_date: date | None = Query(default=None),
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session)
):
  return OrderService(session).list(params.page, params.size, params.offset, target_date)


@router.put('/{order_id}', response_model=OrderRead)
def update_order(order_id: int, payload: OrderUpdateRequest, session: Session = Depends(get_session)):
  return OrderService(session).update(order_id, payload)


@router.post('/{order_id}/cancel', response_model=OrderRead)
def cancel_order(order_id: int, session: Session = Depends(get_session)):
  return OrderService(session).cancel(order_id)
