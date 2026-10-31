from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session, select

from ..auth import require_admin, require_staff
from ..database import get_session
from ..models import Order, OrderItem, Product, StockEntry
from ..schemas import (
  PaginatedResponse,
  PaginationParams,
  ProductCreate,
  ProductHistoryResponse,
  ProductImportSummary,
  ProductRead,
  ProductSaleRecord,
  ProductStockRecord,
  ProductSummary,
  ProductUpdate,
)
from ..services.product_service import ProductService
from ..utils.redact import PRODUCT_COST_FIELDS, SUMMARY_COST_FIELDS, redact, redact_many

router = APIRouter(prefix='/products', tags=['products'], dependencies=[Depends(require_staff)])


@router.get('', response_model=PaginatedResponse[ProductRead])
def list_products(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session),
  q: Optional[str] = Query(default=None),
  vendor_id: Optional[int] = Query(default=None),
  first_stocked_from: Optional[datetime] = Query(default=None),
  first_stocked_to: Optional[datetime] = Query(default=None),
  user: dict = Depends(require_staff),
):
  result = ProductService(session).list(
    params.page, params.size, params.offset, q, vendor_id, first_stocked_from, first_stocked_to
  )
  return result.model_copy(update={'data': redact_many(result.data, user, PRODUCT_COST_FIELDS)})


@router.get('/summary', response_model=ProductSummary)
def get_product_summary(session: Session = Depends(get_session), user: dict = Depends(require_staff)):
  return redact(ProductService(session).get_summary(), user, SUMMARY_COST_FIELDS)


@router.post('', response_model=ProductRead, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
def create_product(payload: ProductCreate, session: Session = Depends(get_session)):
  return ProductService(session).create(payload)


@router.get('/{product_id}/history', response_model=ProductHistoryResponse, dependencies=[Depends(require_admin)])
def get_product_history(product_id: int, session: Session = Depends(get_session)):
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=404, detail='商品不存在')

  stock_rows = session.exec(
    select(StockEntry)
    .where(StockEntry.product_id == product_id)
    .order_by(StockEntry.created_at.desc())
  ).all()

  sale_rows = session.exec(
    select(OrderItem, Order)
    .join(Order, Order.id == OrderItem.order_id)
    .where(OrderItem.product_id == product_id)
    .order_by(Order.created_at.desc())
  ).all()

  total_stocked = sum(r.quantity for r in stock_rows)
  total_sold = sum(oi.quantity for oi, order in sale_rows if not order.is_cancelled)

  return ProductHistoryResponse(
    product_id=product.id,
    product_name=product.name,
    total_stocked=total_stocked,
    total_sold=total_sold,
    current_stock=product.stock,
    stock_entries=[
      ProductStockRecord(id=r.id, quantity=r.quantity, method=r.method, created_at=r.created_at)
      for r in stock_rows
    ],
    sales=[
      ProductSaleRecord(
        order_id=order.id,
        order_created_at=order.created_at,
        is_cancelled=order.is_cancelled,
        quantity=oi.quantity,
        unit_price=oi.unit_price,
        subtotal=oi.subtotal,
      )
      for oi, order in sale_rows
    ],
  )


@router.get('/{product_id}', response_model=ProductRead)
def get_product(product_id: int, session: Session = Depends(get_session), user: dict = Depends(require_staff)):
  svc = ProductService(session)
  product, vendor = svc.get_by_id(product_id)
  return redact(svc.to_read(product, vendor), user, PRODUCT_COST_FIELDS)


@router.put('/{product_id}', response_model=ProductRead, dependencies=[Depends(require_admin)])
def update_product(product_id: int, payload: ProductUpdate, session: Session = Depends(get_session)):
  return ProductService(session).update(product_id, payload)


@router.delete('/{product_id}', status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_admin)])
def delete_product(product_id: int, session: Session = Depends(get_session)):
  ProductService(session).delete(product_id)


@router.post('/import', response_model=ProductImportSummary, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def import_products(file: UploadFile = File(...), session: Session = Depends(get_session)):
  if not file.filename.lower().endswith(('.xlsx', '.xlsm')):
    from fastapi import HTTPException
    raise HTTPException(status_code=400, detail='僅支援 .xlsx 或 .xlsm 檔案')
  return ProductService(session).import_from_excel(await file.read())


@router.post('/import-legacy', response_model=ProductImportSummary, status_code=status.HTTP_201_CREATED, dependencies=[Depends(require_admin)])
async def import_legacy_products(file: UploadFile = File(...), session: Session = Depends(get_session)):
  if not file.filename.lower().endswith(('.xlsx', '.xlsm')):
    from fastapi import HTTPException
    raise HTTPException(status_code=400, detail='僅支援 .xlsx 或 .xlsm 檔案')
  return ProductService(session).import_legacy_from_excel(await file.read())
