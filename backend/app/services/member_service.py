from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlmodel import Session

from ..models import Member, Order, OrderItem, Product
from ..schemas import (
  MemberCreate, MemberOrderItemRead, MemberOrderRecord, MemberPurchaseItem,
  MemberRead, MemberUpdate, OrderMemberInfo, PaginatedResponse,
)
from ..utils.time_utils import utc8_now


class MemberService:
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
  ) -> PaginatedResponse[MemberRead]:
    filters = []
    if q:
      keyword = f'%{q.strip()}%'
      filters.append(
        Member.name.ilike(keyword)
        | Member.phone.ilike(keyword)
        | Member.member_code.ilike(keyword)
        | Member.note.ilike(keyword)
      )

    total_query = select(func.count()).select_from(Member)
    if filters:
      total_query = total_query.where(*filters)
    total = self.session.exec(total_query).scalar_one()

    total_spent_subq = (
      select(
        Order.member_id,
        func.coalesce(func.sum(Order.total_price), 0.0).label('ts')
      )
      .where(Order.is_cancelled == False)
      .group_by(Order.member_id)
      .subquery()
    )

    statement = (
      select(Member, func.coalesce(total_spent_subq.c.ts, 0.0))
      .outerjoin(total_spent_subq, total_spent_subq.c.member_id == Member.id)
    )
    if filters:
      statement = statement.where(*filters)

    sort_field = Member.created_at
    if sort == 'name':
      sort_field = Member.name
    elif sort == 'joined':
      sort_field = Member.joined_date
    elif sort == 'updated':
      sort_field = Member.updated_at

    sort_field = sort_field.desc() if sort_dir.lower() != 'asc' else sort_field.asc()

    statement = statement.order_by(sort_field).offset(offset).limit(size)
    rows = self.session.exec(statement).all()
    data = [
      MemberRead.model_validate(m, from_attributes=True).model_copy(update={'total_spent': float(ts)})
      for m, ts in rows
    ]
    return PaginatedResponse[MemberRead](data=data, total=total, page=page, size=size)

  def get_by_id(self, member_id: int) -> Member:
    member = self.session.get(Member, member_id)
    if not member:
      raise HTTPException(status_code=404, detail='Member not found')
    return member

  def create(self, payload: MemberCreate) -> MemberRead:
    member = Member(**payload.model_dump())
    self.session.add(member)
    self.session.commit()
    self._ensure_member_code(member)
    self.session.refresh(member)
    return MemberRead.model_validate(member, from_attributes=True)

  def update(self, member_id: int, payload: MemberUpdate) -> MemberRead:
    member = self.get_by_id(member_id)
    for key, value in payload.model_dump(exclude_unset=True).items():
      setattr(member, key, value)
    member.updated_at = utc8_now()
    self.session.add(member)
    self.session.commit()
    self.session.refresh(member)
    return MemberRead.model_validate(member, from_attributes=True)

  def delete(self, member_id: int) -> None:
    member = self.get_by_id(member_id)
    self.session.delete(member)
    self.session.commit()

  def get_orders(self, member_id: int, page: int, size: int, offset: int) -> PaginatedResponse[MemberOrderRecord]:
    self.get_by_id(member_id)  # 404 if not found

    total = self.session.exec(
      select(func.count()).select_from(Order).where(Order.member_id == member_id)
    ).scalar_one()

    orders = self.session.exec(
      select(Order)
      .where(Order.member_id == member_id)
      .order_by(Order.created_at.desc())
      .offset(offset)
      .limit(size)
    ).scalars().all()

    order_ids = [o.id for o in orders]
    items_map: dict[int, list[MemberOrderItemRead]] = {oid: [] for oid in order_ids}
    if order_ids:
      for oi, product in self.session.exec(
        select(OrderItem, Product)
        .join(Product, Product.id == OrderItem.product_id)
        .where(OrderItem.order_id.in_(order_ids))
      ):
        items_map[oi.order_id].append(MemberOrderItemRead(
          product_name=product.name,
          color=product.color,
          size=product.size,
          quantity=oi.quantity,
          unit_price=oi.unit_price,
          subtotal=oi.subtotal,
        ))

    data = [
      MemberOrderRecord(
        id=o.id,
        created_at=o.created_at,
        payment_method=o.payment_method,
        total_price=o.total_price,
        gross_total=o.gross_total,
        discount_total=o.discount_total,
        is_cancelled=o.is_cancelled,
        note=o.note,
        items=items_map.get(o.id, []),
      )
      for o in orders
    ]
    return PaginatedResponse[MemberOrderRecord](data=data, total=total, page=page, size=size)

  def get_purchase_items(
    self,
    member_id: int,
    page: int,
    size: int,
    offset: int,
    q: Optional[str] = None
  ) -> PaginatedResponse[MemberPurchaseItem]:
    self.get_by_id(member_id)  # 404 if not found

    filters = [Order.member_id == member_id]
    if q:
      keyword = f'%{q.strip()}%'
      filters.append(
        Product.name.ilike(keyword) | Product.barcode.ilike(keyword)
      )

    total = self.session.exec(
      select(func.count())
      .select_from(OrderItem)
      .join(Order, Order.id == OrderItem.order_id)
      .join(Product, Product.id == OrderItem.product_id)
      .where(*filters)
    ).scalar_one()

    rows = self.session.exec(
      select(OrderItem, Order, Product)
      .join(Order, Order.id == OrderItem.order_id)
      .join(Product, Product.id == OrderItem.product_id)
      .where(*filters)
      .order_by(Order.created_at.desc())
      .offset(offset)
      .limit(size)
    ).all()

    data = [
      MemberPurchaseItem(
        order_id=order.id,
        order_created_at=order.created_at,
        is_cancelled=order.is_cancelled,
        product_name=product.name,
        barcode=product.barcode,
        color=product.color,
        size=product.size,
        quantity=oi.quantity,
        unit_price=oi.unit_price,
        subtotal=oi.subtotal,
      )
      for oi, order, product in rows
    ]
    return PaginatedResponse[MemberPurchaseItem](data=data, total=total, page=page, size=size)

  def build_order_member_info(self, member: Optional[Member]) -> Optional[OrderMemberInfo]:
    if not member:
      return None
    return OrderMemberInfo(
      id=member.id,
      member_code=member.member_code,
      name=member.name,
      phone=member.phone
    )

  def _ensure_member_code(self, member: Member) -> None:
    if member.member_code:
      return
    member.member_code = f'MEM{member.id:05d}'
    self.session.add(member)
    self.session.commit()
    self.session.refresh(member)
