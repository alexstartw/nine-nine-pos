from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy import extract, func, select
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
    sort_dir: str = 'desc',
    birthday_month: Optional[int] = None,
  ) -> PaginatedResponse[MemberRead]:
    filters = self._build_list_filters(q, birthday_month)

    total_query = select(func.count()).select_from(Member)
    if filters:
      total_query = total_query.where(*filters)
    total = self.session.exec(total_query).scalar_one()

    # 累積消費 = 未取消訂單 total_price 加總。
    # 換貨單的 total_price 已是「新購 − 退回」淨額（可為負），直接加總即為實際淨付款。
    total_spent_subq = (
      select(
        Order.member_id,
        func.sum(Order.total_price).label('ts')
      )
      .where(Order.is_cancelled == False)  # noqa: E712
      .where(Order.member_id.is_not(None))
      .group_by(Order.member_id)
      .subquery()
    )
    total_spent_col = func.coalesce(total_spent_subq.c.ts, 0.0)

    statement = (
      select(Member, total_spent_col)
      .outerjoin(total_spent_subq, total_spent_subq.c.member_id == Member.id)
    )
    if filters:
      statement = statement.where(*filters)

    statement = statement.order_by(
      *self._build_order_by(sort, sort_dir, total_spent_col)
    ).offset(offset).limit(size)

    rows = self.session.exec(statement).all()
    data = [
      MemberRead.model_validate(m, from_attributes=True).model_copy(update={'total_spent': float(ts)})
      for m, ts in rows
    ]
    return PaginatedResponse[MemberRead](data=data, total=total, page=page, size=size)

  @staticmethod
  def _build_list_filters(q: Optional[str], birthday_month: Optional[int]) -> list:
    filters = []
    keyword_raw = q.strip() if q else ''
    if keyword_raw:
      keyword = f'%{keyword_raw}%'
      filters.append(
        Member.name.ilike(keyword)
        | Member.phone.ilike(keyword)
        | Member.member_code.ilike(keyword)
        | Member.note.ilike(keyword)
      )
    if birthday_month is not None:
      # SQLAlchemy 會依方言編譯：Postgres → EXTRACT，SQLite → strftime
      filters.append(Member.birthday.is_not(None))
      filters.append(extract('month', Member.birthday) == birthday_month)
    return filters

  @staticmethod
  def _build_order_by(sort: Optional[str], sort_dir: str, total_spent_col) -> list:
    descending = sort_dir.lower() != 'asc'

    def directed(col):
      return col.desc() if descending else col.asc()

    if sort == 'total_spent':
      primary = [directed(total_spent_col)]
    elif sort == 'name':
      primary = [directed(Member.name)]
    elif sort == 'joined':
      primary = [directed(Member.joined_date)]
    elif sort == 'updated':
      primary = [directed(Member.updated_at)]
    elif sort == 'birthday':
      # 依「月/日」排序（忽略年份），沒填生日的排最後
      primary = [
        Member.birthday.is_(None),
        directed(extract('month', Member.birthday)),
        directed(extract('day', Member.birthday)),
      ]
    else:
      primary = [directed(Member.created_at)]

    # 以 id 作為穩定的次要排序，避免同值時換頁順序跳動
    return [*primary, directed(Member.id)]

  def get_by_id(self, member_id: int) -> Member:
    member = self.session.get(Member, member_id)
    if not member:
      raise HTTPException(status_code=404, detail='找不到此會員')
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
