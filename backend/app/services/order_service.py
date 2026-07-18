from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlmodel import Session

from ..models import Member, Order, OrderItem, PaymentMethod, Product
from ..schemas import (
  OrderItemPayload,
  OrderItemRead,
  OrderMemberInfo,
  OrderRead,
  OrderUpdateRequest,
  PaginatedResponse,
)
from ..utils.pos_logic import normalize_phone, round_currency
from ..utils.stock import apply_stock_delta, deduct_stock
from ..utils.time_utils import utc8_now, utc8_today
from .member_service import MemberService


class OrderService:
  def __init__(self, session: Session) -> None:
    self.session = session
    self._member_service = MemberService(session)

  # ── Serialization helpers ──────────────────────────────────────────────────

  def build_order_items(self, order_ids: List[int]) -> Dict[int, List[OrderItemRead]]:
    if not order_ids:
      return {}

    items_map: Dict[int, List[OrderItemRead]] = {oid: [] for oid in order_ids}
    statement = (
      select(OrderItem, Product)
      .join(Product, Product.id == OrderItem.product_id)
      .where(OrderItem.order_id.in_(order_ids))
    )
    for order_item, product in self.session.exec(statement):
      items_map.setdefault(order_item.order_id, []).append(
        OrderItemRead(
          id=order_item.id,
          product_id=order_item.product_id,
          product_name=product.name,
          barcode=product.barcode,
          color=product.color,
          size=product.size,
          quantity=order_item.quantity,
          unit_price=order_item.unit_price,
          unit_cost=order_item.unit_cost,
          subtotal=order_item.subtotal,
          cost_subtotal=order_item.cost_subtotal,
          custom_reason=order_item.custom_reason,
          custom_price_used=bool(order_item.custom_reason and order_item.custom_reason != '預定/留貨'),
          is_return=order_item.is_return,
          original_order_item_id=order_item.original_order_item_id,
        )
      )
    return items_map

  def serialize(
    self,
    order: Order,
    member: Optional[Member],
    items: List[OrderItemRead]
  ) -> OrderRead:
    return OrderRead(
      id=order.id,
      created_at=order.created_at,
      updated_at=order.updated_at,
      payment_method=self._normalize_payment_method(order.payment_method),
      reservation_id=order.reservation_id,
      is_cancelled=order.is_cancelled,
      gross_total=order.gross_total,
      discount_total=order.discount_total,
      total_price=order.total_price,
      cost_total=order.cost_total,
      profit_total=order.profit_total,
      note=order.note,
      member_discount_applied=order.member_discount_applied,
      birthday_discount_applied=order.birthday_discount_applied,
      member=self._member_service.build_order_member_info(member),
      items=items,
      is_exchange=order.is_exchange,
      original_order_id=order.original_order_id,
      exchange_refund_total=order.exchange_refund_total,
    )

  # ── Query operations ───────────────────────────────────────────────────────

  def list(
    self,
    page: int,
    size: int,
    offset: int,
    target_date: Optional[date] = None,
    product_name: Optional[str] = None,
    member_name: Optional[str] = None,
  ) -> PaginatedResponse[OrderRead]:
    searching = bool(product_name or member_name)

    base_count = select(func.count(Order.id.distinct())).select_from(Order)
    base_rows = (
      select(Order, Member)
      .outerjoin(Member, Member.id == Order.member_id)
    )

    # Date filter: always apply when provided; when not searching, default to today
    if target_date:
      day_start = datetime.combine(target_date, datetime.min.time())
      day_end = day_start + timedelta(days=1)
      base_count = base_count.where(Order.created_at >= day_start, Order.created_at < day_end)
      base_rows = base_rows.where(Order.created_at >= day_start, Order.created_at < day_end)
    elif not searching:
      day_start = datetime.combine(utc8_today(), datetime.min.time())
      day_end = day_start + timedelta(days=1)
      base_count = base_count.where(Order.created_at >= day_start, Order.created_at < day_end)
      base_rows = base_rows.where(Order.created_at >= day_start, Order.created_at < day_end)

    # Product name: join order_items → products
    if product_name:
      keyword = f'%{product_name.strip()}%'
      base_count = (
        base_count
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.name.ilike(keyword))
      )
      base_rows = (
        base_rows
        .join(OrderItem, OrderItem.order_id == Order.id)
        .join(Product, Product.id == OrderItem.product_id)
        .where(Product.name.ilike(keyword))
        .distinct()
      )

    # Member name
    if member_name:
      keyword = f'%{member_name.strip()}%'
      base_count = base_count.where(Member.name.ilike(keyword))
      base_rows = base_rows.where(Member.name.ilike(keyword))

    total = self.session.exec(base_count).scalar_one()

    rows = self.session.exec(
      base_rows.order_by(Order.created_at.desc()).offset(offset).limit(size)
    ).all()

    order_ids = [order.id for order, _ in rows]
    items_map = self.build_order_items(order_ids)
    data = [
      self.serialize(order, member, items_map.get(order.id, []))
      for order, member in rows
    ]
    return PaginatedResponse[OrderRead](data=data, total=total, page=page, size=size)

  # ── Mutation operations ────────────────────────────────────────────────────

  def update(self, order_id: int, payload: OrderUpdateRequest) -> OrderRead:
    order = self.session.get(Order, order_id)
    if not order:
      raise HTTPException(status_code=404, detail='找不到訂單')
    if order.is_cancelled:
      raise HTTPException(status_code=400, detail='已取消的訂單無法修改')

    member: Optional[Member] = self.session.get(Member, order.member_id) if order.member_id else None

    if payload.payment_method is not None:
      order.payment_method = self._normalize_payment_method(payload.payment_method)

    if payload.note is not None:
      order.note = payload.note.strip() or None

    if payload.member_phone:  # non-empty string only — update member
      member = self._resolve_member_by_phone(payload.member_phone)
      order.member_id = member.id if member else None
    # empty string or None → keep existing member unchanged

    if payload.items is not None:
      if not payload.items:
        raise HTTPException(status_code=400, detail='訂單至少需要一個商品')
      self._replace_order_items(order, payload.items)

    items_map = self.build_order_items([order.id])
    current_items = items_map.get(order.id, [])
    if not current_items:
      raise HTTPException(status_code=400, detail='訂單至少需要一個商品')

    if payload.manual_discount_rate is not None and not (0 <= payload.manual_discount_rate <= 0.9):
      raise HTTPException(status_code=400, detail='折扣率需介於 0% 與 90% 之間')

    self._recalculate_order_totals(
      order, member, current_items,
      manual_discount_rate=payload.manual_discount_rate,
      round_down_to_ten=payload.round_down_to_ten,
    )
    order.updated_at = utc8_now()
    self.session.add(order)
    self.session.commit()
    self.session.refresh(order)
    return self.serialize(order, member, current_items)

  def cancel(self, order_id: int) -> OrderRead:
    order = self.session.get(Order, order_id)
    if not order:
      raise HTTPException(status_code=404, detail='找不到訂單')
    if order.is_cancelled:
      raise HTTPException(status_code=400, detail='訂單已取消')

    member: Optional[Member] = self.session.get(Member, order.member_id) if order.member_id else None
    items = self.session.exec(select(OrderItem).where(OrderItem.order_id == order.id)).scalars().all()

    for item in items:
      product = self.session.get(Product, item.product_id)
      if product:
        apply_stock_delta(self.session, product, item.quantity)

    order.is_cancelled = True
    order.updated_at = utc8_now()
    self.session.add(order)
    self.session.commit()
    self.session.refresh(order)

    items_map = self.build_order_items([order.id])
    return self.serialize(order, member, items_map.get(order.id, []))

  # ── Private helpers ────────────────────────────────────────────────────────

  def _normalize_payment_method(self, value: PaymentMethod | str) -> PaymentMethod:
    if isinstance(value, PaymentMethod):
      return value
    try:
      return PaymentMethod(str(value).strip().lower())
    except ValueError:
      raise HTTPException(status_code=400, detail='付款方式無效')

  def _resolve_member_by_phone(self, phone: str) -> Optional[Member]:
    normalized = normalize_phone(phone)
    if not normalized:
      return None
    member = self.session.exec(select(Member).where(Member.phone == normalized)).scalars().first()
    if not member:
      raise HTTPException(status_code=404, detail='找不到會員')
    return member

  def _replace_order_items(self, order: Order, new_items: List[OrderItemPayload]) -> None:
    existing = self.session.exec(
      select(OrderItem).where(OrderItem.order_id == order.id)
    ).scalars().all()
    for item in existing:
      product = self.session.get(Product, item.product_id)
      if product:
        apply_stock_delta(self.session, product, item.quantity)
      self.session.delete(item)
    self.session.flush()

    for item in new_items:
      if item.quantity <= 0:
        raise HTTPException(status_code=400, detail='商品數量須大於 0')
      product = self.session.get(Product, item.product_id)
      if not product:
        raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')

      unit_price = round_currency(product.price)
      custom_reason = None
      if item.custom_price is not None:
        if item.custom_price < 0:
          raise HTTPException(status_code=400, detail='自訂售價必須大於等於 0')
        unit_price = round_currency(item.custom_price)
        custom_reason = item.custom_reason  # None if not explicitly provided

      deduct_stock(self.session, product, item.quantity)
      self.session.add(OrderItem(
        order_id=order.id,
        product_id=product.id,
        quantity=item.quantity,
        unit_price=unit_price,
        unit_cost=round_currency(product.cost),
        subtotal=round_currency(unit_price * item.quantity),
        cost_subtotal=round_currency(product.cost * item.quantity),
        custom_reason=custom_reason
      ))

  def _recalculate_order_totals(
    self,
    order: Order,
    member: Optional[Member],
    items: List[OrderItemRead],
    manual_discount_rate: Optional[float] = None,
    round_down_to_ten: bool = False,
  ) -> None:
    gross_total = sum(item.subtotal for item in items)
    cost_total = sum(item.cost_subtotal for item in items)

    if manual_discount_rate is not None:
      # User explicitly set a new discount rate — override existing discount
      discount_total = round_currency(gross_total * manual_discount_rate)
      order.manual_discount_rate = manual_discount_rate
    else:
      # Preserve existing discount; cap in case items were removed and gross shrank
      discount_total = min(order.discount_total, gross_total)

    net_total = max(gross_total - discount_total, 0)
    if round_down_to_ten:
      net_total -= net_total % 10

    order.gross_total = round_currency(gross_total)
    order.discount_total = round_currency(discount_total)
    order.discount = round_currency(discount_total)
    order.total_price = round_currency(net_total)
    order.cost_total = round_currency(cost_total)
    order.profit_total = round_currency(net_total - cost_total)
    # member_discount_applied / birthday_discount_applied stay untouched
