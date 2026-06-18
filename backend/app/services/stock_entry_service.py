from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, or_, select
from sqlmodel import Session

from ..models import Product, StockEntry, StockEntryMethod
from ..schemas import (
  ImportBatch,
  ImportBatchDetail,
  ImportBatchItem,
  PaginatedResponse,
  StockEntryRead,
)


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

  def list_import_batches(self, page: int, size: int, offset: int) -> PaginatedResponse[ImportBatch]:
    base = select(StockEntry).where(
      StockEntry.method == StockEntryMethod.IMPORT,
      StockEntry.batch_id.is_not(None),
    )

    count_stmt = select(func.count(func.distinct(StockEntry.batch_id))).where(
      StockEntry.method == StockEntryMethod.IMPORT,
      StockEntry.batch_id.is_not(None),
    )
    total = self.session.exec(count_stmt).scalar_one()

    # batch summary: batch_id, earliest created_at, item count, total qty
    summary_stmt = (
      select(
        StockEntry.batch_id,
        func.min(StockEntry.created_at).label('created_at'),
        func.count(StockEntry.id).label('item_count'),
        func.sum(StockEntry.quantity).label('total_quantity'),
      )
      .where(
        StockEntry.method == StockEntryMethod.IMPORT,
        StockEntry.batch_id.is_not(None),
      )
      .group_by(StockEntry.batch_id)
      .order_by(func.min(StockEntry.created_at).desc())
      .offset(offset)
      .limit(size)
    )
    rows = self.session.exec(summary_stmt).all()
    data = [
      ImportBatch(
        batch_id=row.batch_id,
        created_at=row.created_at,
        item_count=row.item_count,
        total_quantity=row.total_quantity,
      )
      for row in rows
    ]
    return PaginatedResponse[ImportBatch](data=data, total=total, page=page, size=size)

  def get_batch_detail(self, batch_id: str) -> ImportBatchDetail:
    entries = self.session.exec(
      select(StockEntry)
      .where(StockEntry.batch_id == batch_id)
      .order_by(StockEntry.id)
    ).scalars().all()
    if not entries:
      raise HTTPException(status_code=404, detail='找不到此批次紀錄')
    items = [
      ImportBatchItem(
        id=e.id,
        product_id=e.product_id,
        product_name=e.product_name,
        sku=e.sku,
        barcode=e.barcode,
        vendor_name=e.vendor_name,
        quantity=e.quantity,
      )
      for e in entries
    ]
    return ImportBatchDetail(batch_id=batch_id, created_at=entries[0].created_at, items=items)

  def delete_batch(self, batch_id: str) -> None:
    entries = self.session.exec(
      select(StockEntry).where(StockEntry.batch_id == batch_id)
    ).scalars().all()
    if not entries:
      raise HTTPException(status_code=404, detail='找不到此批次紀錄')

    for entry in entries:
      if entry.product_id:
        product = self.session.get(Product, entry.product_id)
        if product:
          product.stock = max(0, product.stock - entry.quantity)
          self.session.add(product)
      self.session.delete(entry)

    self.session.commit()

  def update_batch_item(self, batch_id: str, entry_id: int, new_quantity: int) -> ImportBatchItem:
    entry = self.session.get(StockEntry, entry_id)
    if not entry or entry.batch_id != batch_id:
      raise HTTPException(status_code=404, detail='找不到此入庫明細')

    delta = new_quantity - entry.quantity
    if delta != 0 and entry.product_id:
      product = self.session.get(Product, entry.product_id)
      if product:
        product.stock = max(0, product.stock + delta)
        self.session.add(product)

    entry.quantity = new_quantity
    self.session.add(entry)
    self.session.commit()
    self.session.refresh(entry)
    return ImportBatchItem(
      id=entry.id,
      product_id=entry.product_id,
      product_name=entry.product_name,
      sku=entry.sku,
      barcode=entry.barcode,
      vendor_name=entry.vendor_name,
      quantity=entry.quantity,
    )
