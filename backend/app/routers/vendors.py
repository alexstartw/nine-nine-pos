from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Product, Vendor
from ..schemas import PaginatedResponse, PaginationParams, VendorCreate, VendorRead, VendorUpdate

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
  session: Session = Depends(get_session)
):
  total = session.exec(select(func.count()).select_from(Vendor)).scalar_one()
  statement = (
    select(Vendor, func.count(Product.id).label('product_count'))
    .join(Product, Vendor.id == Product.vendor_id, isouter=True)
    .group_by(Vendor.id)
    .order_by(Vendor.created_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )
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
  vendor.updated_at = datetime.utcnow()

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
