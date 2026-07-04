from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlmodel import Session

from ..models import Product, Vendor
from ..schemas import PaginatedResponse, VendorCreate, VendorRead, VendorUpdate
from ..utils.time_utils import utc8_now


class VendorService:
  def __init__(self, session: Session) -> None:
    self.session = session

  def list(
    self,
    page: int,
    size: int,
    offset: int,
    q: Optional[str] = None,
    sort: Optional[str] = None,
    sort_dir: str = 'desc'
  ) -> PaginatedResponse[VendorRead]:
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
    total = self.session.exec(total_query).scalar_one()

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
    statement = statement.order_by(sort_field).offset(offset).limit(size)

    rows = self.session.exec(statement).all()
    data = [
      VendorRead.model_validate(vendor, from_attributes=True).model_copy(update={'product_count': count})
      for vendor, count in rows
    ]
    return PaginatedResponse[VendorRead](data=data, total=total, page=page, size=size)

  def get_by_id(self, vendor_id: int) -> Vendor:
    vendor = self.session.get(Vendor, vendor_id)
    if not vendor:
      raise HTTPException(status_code=404, detail='找不到此廠商')
    return vendor

  def to_read(self, vendor: Vendor, product_count: Optional[int] = None) -> VendorRead:
    if product_count is None:
      product_count = self.session.exec(
        select(func.count()).select_from(Product).where(Product.vendor_id == vendor.id)
      ).scalar_one()
    return VendorRead.model_validate(vendor, from_attributes=True).model_copy(update={'product_count': product_count})

  def create(self, payload: VendorCreate) -> VendorRead:
    vendor = Vendor(**payload.model_dump())
    self.session.add(vendor)
    self.session.commit()
    self.session.refresh(vendor)
    return self.to_read(vendor, product_count=0)

  def update(self, vendor_id: int, payload: VendorUpdate) -> VendorRead:
    vendor = self.get_by_id(vendor_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
      setattr(vendor, key, value)
    vendor.updated_at = utc8_now()
    self.session.add(vendor)
    self.session.commit()
    self.session.refresh(vendor)
    return self.to_read(vendor)

  def delete(self, vendor_id: int) -> None:
    vendor = self.get_by_id(vendor_id)
    self.session.delete(vendor)
    self.session.commit()
