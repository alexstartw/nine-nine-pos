from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Product, Vendor
from ..schemas import PaginatedResponse, PaginationParams, VendorCreate, VendorRead, VendorUpdate
from ..utils.time_utils import utc8_now

router = APIRouter(prefix='/vendors', tags=['vendors'])


def _vendor_to_read(session: Session, vendor: Vendor, product_count: int | None = None) -> VendorRead:
  if product_count is None:
    product_count = session.exec(
      select(func.count()).select_from(Product).where(Product.vendor_id == vendor.id)
    ).scalar_one()
  return VendorRead.model_validate(vendor, from_attributes=True).model_copy(update={'product_count': product_count})


@router.get('', response_model=PaginatedResponse[VendorRead])
def list_vendors(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session),
  q: str | None = Query(default=None, description='關鍵字（名稱、聯絡人、電話或 Email）'),
  sort: str | None = Query(default=None, description='排序欄位：name, products, created'),
  sort_dir: str = Query(default='desc', description='asc 或 desc')
):
  filters = []
  if q:
    keyword = f'%{q.strip()}%'
    filters.append(
      Vendor.name.ilike(keyword)
      | Vendor.contact.ilike(keyword)
      | Vendor.phone.ilike(keyword)
      | Vendor.email.ilike(keyword)
    )

  total_query = select(func.count()).select_from(Vendor)
  if filters:
    total_query = total_query.where(*filters)
  total = session.exec(total_query).scalar_one()

  statement = (
    select(Vendor, func.count(Product.id).label('product_count'))
    .join(Product, Vendor.id == Product.vendor_id, isouter=True)
    .group_by(Vendor.id)
  )
  if filters:
    statement = statement.where(*filters)

  sort_field = Vendor.created_at
  if sort == 'name':
    sort_field = Vendor.name
  elif sort == 'products':
    sort_field = func.count(Product.id)

  sort_field = sort_field.desc() if sort_dir.lower() != 'asc' else sort_field.asc()

  statement = statement.order_by(sort_field).offset(params.offset).limit(params.size)
  rows = session.exec(statement).all()

  data = [
    VendorRead.model_validate(vendor, from_attributes=True).model_copy(update={'product_count': count})
    for vendor, count in rows
  ]

  return PaginatedResponse[VendorRead](data=data, total=total, page=params.page, size=params.size)


@router.post('', response_model=VendorRead, status_code=status.HTTP_201_CREATED)
def create_vendor(
  payload: VendorCreate,
  session: Session = Depends(get_session)
):
  vendor = Vendor(**payload.model_dump())
  session.add(vendor)
  session.commit()
  session.refresh(vendor)
  return _vendor_to_read(session, vendor, product_count=0)


@router.get('/{vendor_id}', response_model=VendorRead)
def get_vendor(vendor_id: int, session: Session = Depends(get_session)):
  vendor = session.get(Vendor, vendor_id)
  if not vendor:
    raise HTTPException(status_code=404, detail='Vendor not found')
  return _vendor_to_read(session, vendor)


@router.put('/{vendor_id}', response_model=VendorRead)
def update_vendor(
  vendor_id: int,
  payload: VendorUpdate,
  session: Session = Depends(get_session)
):
  vendor = session.get(Vendor, vendor_id)
  if not vendor:
    raise HTTPException(status_code=404, detail='Vendor not found')

  update_data = payload.model_dump(exclude_unset=True)
  for key, value in update_data.items():
    setattr(vendor, key, value)
  vendor.updated_at = utc8_now()

  session.add(vendor)
  session.commit()
  session.refresh(vendor)
  return _vendor_to_read(session, vendor)


@router.delete('/{vendor_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_vendor(vendor_id: int, session: Session = Depends(get_session)):
  vendor = session.get(Vendor, vendor_id)
  if not vendor:
    raise HTTPException(status_code=404, detail='Vendor not found')
  session.delete(vendor)
  session.commit()
  return None
