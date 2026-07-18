from __future__ import annotations

from datetime import date

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from ..database import get_session
from ..schemas import (
  ExchangeCheckoutRequest,
  ExchangeCheckoutResponse,
  ExchangeOriginalLookupResponse,
  PosDailySummary,
  PosCheckoutRequest,
  PosCheckoutResponse,
  PosMemberLookupResponse,
  PosProductResponse,
)
from ..services.exchange_service import ExchangeService
from ..services.pos_service import PosService

router = APIRouter(prefix='/pos', tags=['pos'])


@router.get('/products/{barcode}', response_model=PosProductResponse)
def get_product_by_barcode(barcode: str, session: Session = Depends(get_session)):
  return PosService(session).get_product_by_barcode(barcode)


@router.get('/members/by-phone', response_model=PosMemberLookupResponse)
def get_member_by_phone(
  phone: str = Query(..., min_length=4),
  session: Session = Depends(get_session)
):
  return PosService(session).get_member_by_phone(phone)


@router.get('/members/search', response_model=list[PosMemberLookupResponse])
def search_members(
  query: str = Query(..., min_length=3, max_length=4),
  session: Session = Depends(get_session)
):
  return PosService(session).search_members(query)


@router.get('/summary/daily', response_model=PosDailySummary)
def get_daily_summary(
  target_date: date | None = Query(default=None),
  session: Session = Depends(get_session)
):
  return PosService(session).get_daily_summary(target_date)


@router.post('/checkout', response_model=PosCheckoutResponse, status_code=status.HTTP_201_CREATED)
def checkout(payload: PosCheckoutRequest, session: Session = Depends(get_session)):
  return PosService(session).checkout(payload)


@router.get('/orders/{order_id}/exchange-lookup', response_model=ExchangeOriginalLookupResponse)
def exchange_lookup(order_id: int, session: Session = Depends(get_session)):
  return ExchangeService(session).lookup_original_order(order_id)


@router.post('/exchange', response_model=ExchangeCheckoutResponse, status_code=status.HTTP_201_CREATED)
def exchange_checkout(payload: ExchangeCheckoutRequest, session: Session = Depends(get_session)):
  return ExchangeService(session).exchange_checkout(payload)
