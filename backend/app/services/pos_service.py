from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from typing import Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlmodel import Session

from ..models import Member, Order, OrderItem, PaymentMethod, Product
from ..schemas import (
  PosDailySummary,
  PosCheckoutDiscounts,
  PosCheckoutRequest,
  PosCheckoutResponse,
  PosMemberLookupResponse,
  PosMemberSummary,
  PosProductResponse,
)
from ..utils.pos_logic import (
  birthday_discount_available,
  calculate_discounts,
  is_birthday_month,
  normalize_phone,
  round_currency,
)
from ..utils.time_utils import utc8_now, utc8_today


class PosService:
  def __init__(self, session: Session) -> None:
    self.session = session

  # ── Product lookup ─────────────────────────────────────────────────────────

  def get_product_by_barcode(self, barcode: str) -> PosProductResponse:
    product = self.session.exec(select(Product).where(Product.barcode == barcode)).scalars().first()
    if not product:
      raise HTTPException(status_code=404, detail='找不到對應商品')
    return PosProductResponse(
      id=product.id, name=product.name, barcode=product.barcode,
      price=product.price, cost=product.cost, stock=product.stock
    )

  # ── Member lookup ──────────────────────────────────────────────────────────

  def get_member_by_phone(self, phone: str) -> PosMemberLookupResponse:
    member = self._find_member_by_phone(normalize_phone(phone))
    now = utc8_now()
    birthday_available = (
      birthday_discount_available(self.session, member, now) if is_birthday_month(member, now) else False
    )
    summary = self._build_member_summary(member, now, birthday_available)
    return PosMemberLookupResponse(**summary.model_dump(), joined_date=member.joined_date, note=member.note)

  def search_members(self, query: str) -> list[PosMemberLookupResponse]:
    digits = re.sub(r'\D', '', query).strip()
    if len(digits) != 3:
      raise HTTPException(status_code=400, detail='僅支援輸入電話後三碼')

    members = self.session.exec(
      select(Member)
      .where(Member.phone.ilike(f'%{digits}'))
      .order_by(Member.updated_at.desc())
      .limit(5)
    ).scalars().all()
    if not members:
      raise HTTPException(status_code=404, detail='找不到符合的會員')

    now = utc8_now()
    results = []
    for member in members:
      birthday_available = (
        birthday_discount_available(self.session, member, now) if is_birthday_month(member, now) else False
      )
      summary = self._build_member_summary(member, now, birthday_available)
      results.append(PosMemberLookupResponse(**summary.model_dump(), joined_date=member.joined_date, note=member.note))
    return results

  # ── Daily summary ──────────────────────────────────────────────────────────

  def get_daily_summary(self, target_date: Optional[date] = None) -> PosDailySummary:
    reference_date = target_date or utc8_today()
    day_start = datetime.combine(reference_date, datetime.min.time())
    day_end = day_start + timedelta(days=1)

    totals = self.session.exec(
      select(
        func.count(Order.id),
        func.coalesce(func.sum(Order.gross_total), 0),
        func.coalesce(func.sum(Order.discount_total), 0),
        func.coalesce(func.sum(Order.total_price), 0),
        func.coalesce(func.sum(Order.cost_total), 0),
        func.coalesce(func.sum(Order.profit_total), 0),
      ).where(
        Order.created_at >= day_start,
        Order.created_at < day_end,
        Order.is_cancelled == False  # noqa: E712
      )
    ).one()

    payment_rows = self.session.exec(
      select(Order.payment_method, func.count(Order.id))
      .where(
        Order.created_at >= day_start,
        Order.created_at < day_end,
        Order.is_cancelled == False  # noqa: E712
      )
      .group_by(Order.payment_method)
    ).all()

    payment_breakdown = {
      (method.value if isinstance(method, PaymentMethod) else str(method).lower()): count
      for method, count in payment_rows
    }
    return PosDailySummary(
      date=reference_date,
      orders_count=totals[0] or 0,
      gross_total=float(totals[1] or 0),
      discount_total=float(totals[2] or 0),
      net_total=float(totals[3] or 0),
      cost_total=float(totals[4] or 0),
      profit_total=float(totals[5] or 0),
      payment_breakdown=payment_breakdown
    )

  # ── Checkout ───────────────────────────────────────────────────────────────

  def checkout(self, payload: PosCheckoutRequest) -> PosCheckoutResponse:
    if not payload.items:
      raise HTTPException(status_code=400, detail='至少需要一個商品進行結帳')

    member = None
    member_phone = normalize_phone(payload.member_phone)
    if member_phone:
      member = self._find_member_by_phone(member_phone)

    order = Order(member_id=member.id if member else None, payment_method=payload.payment_method)
    self.session.add(order)
    self.session.flush()

    gross_total = 0.0
    cost_total = 0.0
    discountable_total = 0.0

    for item in payload.items:
      product = self.session.get(Product, item.product_id)
      if not product:
        raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')
      if product.stock < item.quantity:
        raise HTTPException(status_code=400, detail=f'{product.name} 庫存不足')

      unit_price = round_currency(product.price)
      custom_reason = None
      if item.custom_price is not None:
        if item.custom_price < 0:
          raise HTTPException(status_code=400, detail='自訂售價必須大於等於 0')
        unit_price = round_currency(item.custom_price)
        custom_reason = item.custom_reason or '大拍賣'

      unit_cost = round_currency(product.cost)
      subtotal = round_currency(unit_price * item.quantity)
      cost_subtotal = round_currency(unit_cost * item.quantity)

      if not custom_reason:
        discountable_total += subtotal

      product.stock -= item.quantity
      product.updated_at = utc8_now()
      self.session.add(product)
      self.session.add(OrderItem(
        order_id=order.id, product_id=product.id, quantity=item.quantity,
        unit_price=unit_price, unit_cost=unit_cost, subtotal=subtotal,
        cost_subtotal=cost_subtotal, custom_reason=custom_reason
      ))
      gross_total += subtotal
      cost_total += cost_subtotal

    now = utc8_now()
    manual_discount_rate = payload.manual_discount_rate
    if manual_discount_rate is not None and not (0 <= manual_discount_rate <= 0.9):
      raise HTTPException(status_code=400, detail='折扣率需介於 0% 與 90% 之間')

    (
      member_discount_amount,
      birthday_discount_amount,
      member_discount_applied,
      birthday_discount_applied
    ) = calculate_discounts(member, gross_total, self.session, now, discountable_total=discountable_total)

    manual_discount_amount = 0.0
    if manual_discount_rate:
      manual_discount_amount = round_currency(discountable_total * manual_discount_rate)
      member_discount_applied = False
      birthday_discount_applied = False

    discount_total = min(
      round_currency(member_discount_amount + birthday_discount_amount + manual_discount_amount),
      discountable_total
    )
    net_total = max(gross_total - discount_total, 0)
    if payload.round_down_to_ten:
      net_total -= net_total % 10
    profit_total = net_total - cost_total

    order.gross_total = round_currency(gross_total)
    order.discount_total = discount_total
    order.discount = discount_total
    order.total_price = round_currency(net_total)
    order.cost_total = round_currency(cost_total)
    order.profit_total = round_currency(profit_total)
    order.member_discount_applied = member_discount_applied
    order.birthday_discount_applied = birthday_discount_applied
    order.manual_discount_rate = manual_discount_rate or 0
    self.session.add(order)
    self.session.commit()
    self.session.refresh(order)

    member_summary = None
    if member:
      birthday_available = birthday_discount_available(self.session, member, now)
      member_summary = self._build_member_summary(member, now, birthday_available)

    return PosCheckoutResponse(
      order_id=order.id,
      gross_total=order.gross_total,
      discount_total=order.discount_total,
      total_price=order.total_price,
      cost_total=order.cost_total,
      profit_total=order.profit_total,
      payment_method=order.payment_method,
      discounts=PosCheckoutDiscounts(
        member_discount=member_discount_amount,
        birthday_discount=birthday_discount_amount,
        manual_discount=manual_discount_amount,
        member_discount_applied=member_discount_applied,
        birthday_discount_applied=birthday_discount_applied
      ),
      member=member_summary,
      created_at=order.created_at
    )

  # ── Private helpers ────────────────────────────────────────────────────────

  def _find_member_by_phone(self, phone: Optional[str]) -> Member:
    if not phone:
      raise HTTPException(status_code=404, detail='找不到會員')
    member = self.session.exec(select(Member).where(Member.phone == phone)).scalars().first()
    if not member:
      raise HTTPException(status_code=404, detail='找不到會員')
    return member

  def _build_member_summary(
    self,
    member: Member,
    current_time: datetime,
    birthday_available: bool
  ) -> PosMemberSummary:
    return PosMemberSummary(
      id=member.id,
      member_code=member.member_code or '',
      name=member.name,
      phone=member.phone,
      birthday=member.birthday,
      is_birthday_month=is_birthday_month(member, current_time),
      birthday_discount_available=birthday_available
    )
