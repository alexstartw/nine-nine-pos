from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query
from sqlmodel import Session

from ..auth import require_admin
from ..database import get_session
from ..models import StockEntryMethod
from ..schemas import PaginatedResponse, PaginationParams, StockEntryRead
from ..services.stock_entry_service import StockEntryService

router = APIRouter(prefix='/stock-entries', tags=['stock'], dependencies=[Depends(require_admin)])


@router.get('', response_model=PaginatedResponse[StockEntryRead])
def list_stock_entries(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session),
  q: Optional[str] = Query(default=None),
  method: Optional[StockEntryMethod] = Query(default=None),
  created_from: Optional[datetime] = Query(default=None),
  created_to: Optional[datetime] = Query(default=None),
):
  return StockEntryService(session).list(
    params.page, params.size, params.offset, q, method, created_from, created_to
  )
