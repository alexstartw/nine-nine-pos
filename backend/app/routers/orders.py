from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Member, Order, OrderItem, PaymentMethod, Product
from ..schemas import (
  OrderItemPayload,
  OrderItemRead,
  OrderMemberInfo,
  OrderRead,
  OrderUpdateRequest,
  PaginatedResponse,
  PaginationParams
)
from ..utils.pos_logic import calculate_discounts, normalize_phone, round_currency
from ..utils.time_utils import utc8_now, utc8_today

router = APIRouter(prefix='/orders', tags=['orders'])


def _build_order_items(
  session: Session,
  order_ids: List[int]
) -> Dict[int, List[OrderItemRead]]:
  if not order_ids:
    return {}

  items_map: Dict[int, List[OrderItemRead]] = {order_id: [] for order_id in order_ids}
  statement = (
    select(OrderItem, Product)
    .join(Product, Product.id == OrderItem.product_id)
    .where(OrderItem.order_id.in_(order_ids))
  )
  for order_item, product in session.exec(statement):
    items_map.setdefault(order_item.order_id, []).append(
      OrderItemRead(
        id=order_item.id,
        product_id=order_item.product_id,
        product_name=product.name,
        barcode=product.barcode,
        quantity=order_item.quantity,
        unit_price=order_item.unit_price,
        unit_cost=order_item.unit_cost,
        subtotal=order_item.subtotal,
        cost_subtotal=order_item.cost_subtotal
      )
    )
  return items_map


def _build_order_member(member: Optional[Member]) -> Optional[OrderMemberInfo]:
  if not member:
    return None
  return OrderMemberInfo(
    id=member.id,
    member_code=member.member_code,
    name=member.name,
    phone=member.phone
  )


def _serialize_order(
  order: Order,
  member: Optional[Member],
  items: List[OrderItemRead]
) -> OrderRead:
  return OrderRead(
    id=order.id,
    created_at=order.created_at,
    updated_at=order.updated_at,
    payment_method=order.payment_method,
    gross_total=order.gross_total,
    discount_total=order.discount_total,
    total_price=order.total_price,
    cost_total=order.cost_total,
    profit_total=order.profit_total,
    note=order.note,
    member_discount_applied=order.member_discount_applied,
    birthday_discount_applied=order.birthday_discount_applied,
    member=_build_order_member(member),
    items=items
  )


@router.get('', response_model=PaginatedResponse[OrderRead])
def list_orders(
  target_date: date | None = Query(default=None, description='查詢日期 (預設今日)'),
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session)
):
  date_to_use = target_date or utc8_today()
  day_start = datetime.combine(date_to_use, datetime.min.time())
  day_end = day_start + timedelta(days=1)

  total_statement = (
    select(func.count())
    .select_from(Order)
    .where(Order.created_at >= day_start, Order.created_at < day_end)
  )
  total = session.exec(total_statement).scalar_one()

  statement = (
    select(Order, Member)
    .outerjoin(Member, Member.id == Order.member_id)
    .where(Order.created_at >= day_start, Order.created_at < day_end)
    .order_by(Order.created_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )
  rows = session.exec(statement).all()

  order_ids = [order.id for order, _ in rows]
  items_map = _build_order_items(session, order_ids)

  data = [
    _serialize_order(order, member, items_map.get(order.id, []))
    for order, member in rows
  ]

  return PaginatedResponse[OrderRead](data=data, total=total, page=params.page, size=params.size)


@router.put('/{order_id}', response_model=OrderRead)
def update_order(
  order_id: int,
  payload: OrderUpdateRequest,
  session: Session = Depends(get_session)
):
  order = session.get(Order, order_id)
  if not order:
    raise HTTPException(status_code=404, detail='找不到訂單')

  member: Optional[Member] = session.get(Member, order.member_id) if order.member_id else None

  if payload.payment_method:
    if payload.payment_method not in {PaymentMethod.CASH, PaymentMethod.TRANSFER, PaymentMethod.MOBILE}:
      raise HTTPException(status_code=400, detail='付款方式無效')
    order.payment_method = payload.payment_method

  if payload.note is not None:
    order.note = payload.note.strip() or None

  if payload.member_phone is not None:
    normalized = normalize_phone(payload.member_phone)
    if not normalized:
      order.member_id = None
      member = None
    else:
      member = session.exec(select(Member).where(Member.phone == normalized)).scalars().first()
      if not member:
        raise HTTPException(status_code=404, detail='找不到會員')
      order.member_id = member.id

  if payload.items is not None:
    if not payload.items:
      raise HTTPException(status_code=400, detail='訂單至少需要一個商品')

    existing_items = session.exec(select(OrderItem).where(OrderItem.order_id == order.id)).all()
    for existing in existing_items:
      product = session.get(Product, existing.product_id)
      if product:
        product.stock += existing.quantity
        product.updated_at = utc8_now()
        session.add(product)
      session.delete(existing)
    session.flush()

    for item in payload.items:
      if item.quantity <= 0:
        raise HTTPException(status_code=400, detail='商品數量須大於 0')
      product = session.get(Product, item.product_id)
      if not product:
        raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')
      if product.stock < item.quantity:
        raise HTTPException(status_code=400, detail=f'{product.name} 庫存不足')

      unit_price = round_currency(product.price)
      unit_cost = round_currency(product.cost)
      subtotal = round_currency(unit_price * item.quantity)
      cost_subtotal = round_currency(unit_cost * item.quantity)

      product.stock -= item.quantity
      product.updated_at = utc8_now()
      session.add(product)

      order_item = OrderItem(
        order_id=order.id,
        product_id=product.id,
        quantity=item.quantity,
        unit_price=unit_price,
        unit_cost=unit_cost,
        subtotal=subtotal,
        cost_subtotal=cost_subtotal
      )
      session.add(order_item)

  items_map = _build_order_items(session, [order.id])
  current_items = items_map.get(order.id, [])
  if not current_items:
    raise HTTPException(status_code=400, detail='訂單至少需要一個商品')

  gross_total = sum(item.subtotal for item in current_items)
  cost_total = sum(item.cost_subtotal for item in current_items)
  now = utc8_now()

  (
    member_discount_amount,
    birthday_discount_amount,
    member_discount_applied,
    birthday_discount_applied
  ) = calculate_discounts(member, gross_total, session, now, exclude_order_id=order.id)

  discount_total = round_currency(member_discount_amount + birthday_discount_amount)
  net_total = max(gross_total - discount_total, 0)
  profit_total = net_total - cost_total

  order.gross_total = round_currency(gross_total)
  order.discount_total = discount_total
  order.discount = discount_total
  order.total_price = round_currency(net_total)
  order.cost_total = round_currency(cost_total)
  order.profit_total = round_currency(profit_total)
  order.member_discount_applied = member_discount_applied
  order.birthday_discount_applied = birthday_discount_applied
  order.updated_at = utc8_now()

  session.add(order)
  session.commit()
  session.refresh(order)

  return _serialize_order(order, member, current_items)
