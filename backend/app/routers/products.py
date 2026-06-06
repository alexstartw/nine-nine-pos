from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from sqlmodel import Session, select

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

router = APIRouter(prefix='/products', tags=['products'])


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


@router.get('/{product_id}/history', response_model=ProductHistoryResponse)
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
