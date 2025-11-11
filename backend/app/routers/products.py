from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Product, Vendor
from ..schemas import PaginatedResponse, PaginationParams, ProductCreate, ProductRead, ProductUpdate, ProductVendor
from ..utils import calculate_gross_margin, generate_barcode

router = APIRouter(prefix='/products', tags=['products'])


def _product_to_read(product: Product, vendor: Vendor | None) -> ProductRead:
  gross, percent = calculate_gross_margin(product.price, product.cost)
  vendor_payload = ProductVendor.model_validate(vendor, from_attributes=True) if vendor else None
  return ProductRead.model_validate(
    product,
    from_attributes=True
  ).model_copy(update={'gross_margin': gross, 'gross_margin_percentage': percent, 'vendor': vendor_payload})


@router.get('', response_model=PaginatedResponse[ProductRead])
def list_products(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session)
):
  total = session.exec(select(func.count()).select_from(Product)).scalar_one()
  statement = (
    select(Product, Vendor)
    .join(Vendor, Product.vendor_id == Vendor.id, isouter=True)
    .order_by(Product.updated_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )
  rows = session.exec(statement).all()
  data = [_product_to_read(product, vendor) for product, vendor in rows]
  return PaginatedResponse[ProductRead](data=data, total=total, page=params.page, size=params.size)


@router.post('', response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
  payload: ProductCreate,
  session: Session = Depends(get_session)
):
  vendor = session.get(Vendor, payload.vendor_id) if payload.vendor_id else None
  barcode = generate_barcode(payload.vendor_id, payload.sku, payload.cost, payload.color, payload.size)
  product = Product(**payload.model_dump(), barcode=barcode)
  session.add(product)
  session.commit()
  session.refresh(product)
  return _product_to_read(product, vendor)


@router.get('/{product_id}', response_model=ProductRead)
def get_product(product_id: int, session: Session = Depends(get_session)):
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=404, detail='Product not found')
  vendor = session.get(Vendor, product.vendor_id) if product.vendor_id else None
  return _product_to_read(product, vendor)


@router.put('/{product_id}', response_model=ProductRead)
def update_product(
  product_id: int,
  payload: ProductUpdate,
  session: Session = Depends(get_session)
):
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=404, detail='Product not found')

  update_data = payload.model_dump(exclude_unset=True)
  for key, value in update_data.items():
    setattr(product, key, value)

  if any(key in update_data for key in {'vendor_id', 'sku', 'cost', 'color', 'size'}):
    product.barcode = generate_barcode(product.vendor_id, product.sku, product.cost, product.color, product.size)
  product.updated_at = datetime.utcnow()

  session.add(product)
  session.commit()
  session.refresh(product)
  vendor = session.get(Vendor, product.vendor_id) if product.vendor_id else None
  return _product_to_read(product, vendor)


@router.delete('/{product_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, session: Session = Depends(get_session)):
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=404, detail='Product not found')
  session.delete(product)
  session.commit()
  return None
