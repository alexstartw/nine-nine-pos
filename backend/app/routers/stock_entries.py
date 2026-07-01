from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query, status
from sqlmodel import Session

from ..auth import require_admin
from ..database import get_session
from ..models import StockEntryMethod
from ..schemas import (
  ImportBatch,
  ImportBatchDetail,
  ImportBatchItem,
  ImportBatchItemUpdate,
  PaginatedResponse,
  PaginationParams,
  StockEntryRead,
)
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


@router.get('/batches', response_model=PaginatedResponse[ImportBatch])
def list_import_batches(params: PaginationParams = Depends(), session: Session = Depends(get_session)):
  return StockEntryService(session).list_import_batches(params.page, params.size, params.offset)


@router.get('/batches/{batch_id}', response_model=ImportBatchDetail)
def get_batch_detail(batch_id: str, session: Session = Depends(get_session)):
  return StockEntryService(session).get_batch_detail(batch_id)


@router.delete('/batches/{batch_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_batch(batch_id: str, session: Session = Depends(get_session)):
  StockEntryService(session).delete_batch(batch_id)


@router.patch('/batches/{batch_id}/items/{entry_id}', response_model=ImportBatchItem)
def update_batch_item(
  batch_id: str,
  entry_id: int,
  payload: ImportBatchItemUpdate,
  session: Session = Depends(get_session),
):
  return StockEntryService(session).update_batch_item(batch_id, entry_id, payload.quantity)
