from __future__ import annotations

from typing import Optional

from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlmodel import Session

from ..database import get_session
from ..models import StockEntry, StockEntryMethod
from ..schemas import PaginatedResponse, PaginationParams, StockEntryRead

router = APIRouter(prefix='/stock-entries', tags=['stock'])


@router.get('', response_model=PaginatedResponse[StockEntryRead])
def list_stock_entries(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session),
  q: Optional[str] = Query(default=None, description='依商品名稱、SKU 或條碼搜尋'),
  method: Optional[StockEntryMethod] = Query(default=None, description='篩選來源類型'),
  created_from: Optional[datetime] = Query(default=None, description='入庫時間（起）'),
  created_to: Optional[datetime] = Query(default=None, description='入庫時間（迄）'),
):
  filters = []
  if q:
    keyword = q.strip()
    if keyword:
      pattern = f'%{keyword}%'
      filters.append(
        or_(
          StockEntry.product_name.ilike(pattern),
          StockEntry.sku.ilike(pattern),
          StockEntry.barcode.ilike(pattern)
        )
      )
  if method:
    filters.append(StockEntry.method == method)
  if created_from:
    filters.append(StockEntry.created_at >= created_from)
  if created_to:
    filters.append(StockEntry.created_at <= created_to)

  count_stmt = select(func.count()).select_from(StockEntry)
  if filters:
    count_stmt = count_stmt.where(*filters)
  total = session.exec(count_stmt).scalar_one()

  statement = (
    select(StockEntry)
    .order_by(StockEntry.created_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )
  if filters:
    statement = statement.where(*filters)

  entries = session.exec(statement).scalars().all()
  data = [
    StockEntryRead.model_validate(entry, from_attributes=True)
    for entry in entries
  ]

  return PaginatedResponse[StockEntryRead](data=data, total=total, page=params.page, size=params.size)
