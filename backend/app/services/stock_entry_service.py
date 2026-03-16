from __future__ import annotations

from datetime import datetime
from typing import Optional

from sqlalchemy import func, or_, select
from sqlmodel import Session

from ..models import StockEntry, StockEntryMethod
from ..schemas import PaginatedResponse, StockEntryRead


class StockEntryService:
  def __init__(self, session: Session) -> None:
    self.session = session

  def list(
    self,
    page: int,
    size: int,
    offset: int,
    q: Optional[str] = None,
    method: Optional[StockEntryMethod] = None,
    created_from: Optional[datetime] = None,
    created_to: Optional[datetime] = None,
  ) -> PaginatedResponse[StockEntryRead]:
    filters = []
    if q:
      keyword = q.strip()
      if keyword:
        pattern = f'%{keyword}%'
        filters.append(or_(
          StockEntry.product_name.ilike(pattern),
          StockEntry.sku.ilike(pattern),
          StockEntry.barcode.ilike(pattern)
        ))
    if method:
      filters.append(StockEntry.method == method)
    if created_from:
      filters.append(StockEntry.created_at >= created_from)
    if created_to:
      filters.append(StockEntry.created_at <= created_to)

    count_stmt = select(func.count()).select_from(StockEntry)
    if filters:
      count_stmt = count_stmt.where(*filters)
    total = self.session.exec(count_stmt).scalar_one()

    stmt = (
      select(StockEntry)
      .order_by(StockEntry.created_at.desc())
      .offset(offset)
      .limit(size)
    )
    if filters:
      stmt = stmt.where(*filters)

    entries = self.session.exec(stmt).scalars().all()
    data = [StockEntryRead.model_validate(e, from_attributes=True) for e in entries]
    return PaginatedResponse[StockEntryRead](data=data, total=total, page=page, size=size)
