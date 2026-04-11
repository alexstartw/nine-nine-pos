from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, Query, UploadFile, status
from sqlmodel import Session

from ..auth import require_staff
from ..database import get_session
from ..schemas import (
  PaginatedResponse,
  PaginationParams,
  ProductCreate,
  ProductImportSummary,
  ProductRead,
  ProductSummary,
  ProductUpdate,
)
from ..services.product_service import ProductService

router = APIRouter(prefix='/products', tags=['products'], dependencies=[Depends(require_staff)])


@router.get('', response_model=PaginatedResponse[ProductRead])
def list_products(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session),
  q: Optional[str] = Query(default=None),
  vendor_id: Optional[int] = Query(default=None),
  first_stocked_from: Optional[datetime] = Query(default=None),
  first_stocked_to: Optional[datetime] = Query(default=None),
):
  return ProductService(session).list(
    params.page, params.size, params.offset, q, vendor_id, first_stocked_from, first_stocked_to
  )


@router.get('/summary', response_model=ProductSummary)
def get_product_summary(session: Session = Depends(get_session)):
  return ProductService(session).get_summary()


@router.post('', response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(payload: ProductCreate, session: Session = Depends(get_session)):
  return ProductService(session).create(payload)


@router.get('/{product_id}', response_model=ProductRead)
def get_product(product_id: int, session: Session = Depends(get_session)):
  svc = ProductService(session)
  product, vendor = svc.get_by_id(product_id)
  return svc.to_read(product, vendor)


@router.put('/{product_id}', response_model=ProductRead)
def update_product(product_id: int, payload: ProductUpdate, session: Session = Depends(get_session)):
  return ProductService(session).update(product_id, payload)


@router.delete('/{product_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, session: Session = Depends(get_session)):
  ProductService(session).delete(product_id)


@router.post('/import', response_model=ProductImportSummary, status_code=status.HTTP_201_CREATED)
async def import_products(file: UploadFile = File(...), session: Session = Depends(get_session)):
  if not file.filename.lower().endswith(('.xlsx', '.xlsm')):
    from fastapi import HTTPException
    raise HTTPException(status_code=400, detail='僅支援 .xlsx 或 .xlsm 檔案')
  return ProductService(session).import_from_excel(await file.read())


@router.post('/import-legacy', response_model=ProductImportSummary, status_code=status.HTTP_201_CREATED)
async def import_legacy_products(file: UploadFile = File(...), session: Session = Depends(get_session)):
  if not file.filename.lower().endswith(('.xlsx', '.xlsm')):
    from fastapi import HTTPException
    raise HTTPException(status_code=400, detail='僅支援 .xlsx 或 .xlsm 檔案')
  return ProductService(session).import_legacy_from_excel(await file.read())
