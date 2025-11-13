from __future__ import annotations

from datetime import date, datetime, timedelta
import re

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Member, Order, OrderItem, PaymentMethod, Product
from ..schemas import (
  PosCheckoutDiscounts,
  PosCheckoutRequest,
  PosCheckoutResponse,
  PosDailySummary,
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

router = APIRouter(prefix='/pos', tags=['pos'])


def _build_member_summary(
  member: Member,
  current_time: datetime,
  birthday_discount_available: bool
) -> PosMemberSummary:
  return PosMemberSummary(
    id=member.id,
    member_code=member.member_code or '',
    name=member.name,
    phone=member.phone,
    birthday=member.birthday,
    is_birthday_month=is_birthday_month(member, current_time),
    birthday_discount_available=birthday_discount_available
  )


@router.get('/products/{barcode}', response_model=PosProductResponse)
def get_product_by_barcode(barcode: str, session: Session = Depends(get_session)):
  product = session.exec(select(Product).where(Product.barcode == barcode)).scalars().first()
  if not product:
    raise HTTPException(status_code=404, detail='找不到對應商品')
  return PosProductResponse(
    id=product.id,
    name=product.name,
    barcode=product.barcode,
    price=product.price,
    cost=product.cost,
    stock=product.stock
  )


@router.get('/members/by-phone', response_model=PosMemberLookupResponse)
def get_member_by_phone(
  phone: str = Query(..., min_length=4, description='會員電話'),
  session: Session = Depends(get_session)
):
  normalized = normalize_phone(phone)
  member = session.exec(select(Member).where(Member.phone == normalized)).scalars().first()
  if not member:
    raise HTTPException(status_code=404, detail='找不到會員')

  now = utc8_now()
  birthday_available = birthday_discount_available(session, member, now) if is_birthday_month(member, now) else False
  return PosMemberLookupResponse(
    **_build_member_summary(member, now, birthday_available).model_dump(),
    joined_date=member.joined_date,
    note=member.note
  )


@router.get('/members/search', response_model=list[PosMemberLookupResponse])
def search_members(
  query: str = Query(..., min_length=3, max_length=4, description='電話後三碼'),
  session: Session = Depends(get_session)
):
  digits = re.sub(r'\D', '', query).strip()
  if len(digits) != 3:
    raise HTTPException(status_code=400, detail='僅支援輸入電話後三碼')

  statement = (
    select(Member)
    .where(Member.phone.ilike(f'%{digits}'))
    .order_by(Member.updated_at.desc())
    .limit(5)
  )
  members = session.exec(statement).scalars().all()
  if not members:
    raise HTTPException(status_code=404, detail='找不到符合的會員')

  now = utc8_now()
  results: list[PosMemberLookupResponse] = []
  for member in members:
    birthday_available = (
      birthday_discount_available(session, member, now)
      if is_birthday_month(member, now) else False
    )
    summary = _build_member_summary(member, now, birthday_available)
    results.append(PosMemberLookupResponse(
      **summary.model_dump(),
      joined_date=member.joined_date,
      note=member.note
    ))
  return results


@router.get('/summary/daily', response_model=PosDailySummary)
def get_daily_summary(
  target_date: date | None = Query(default=None, description='查詢日期（預設今日）'),
  session: Session = Depends(get_session)
):
  reference_date = target_date or utc8_today()
  day_start = datetime.combine(reference_date, datetime.min.time())
  day_end = day_start + timedelta(days=1)

  totals = session.exec(
    select(
      func.count(Order.id),
      func.coalesce(func.sum(Order.gross_total), 0),
      func.coalesce(func.sum(Order.discount_total), 0),
      func.coalesce(func.sum(Order.total_price), 0),
      func.coalesce(func.sum(Order.cost_total), 0),
      func.coalesce(func.sum(Order.profit_total), 0),
    )
    .where(Order.created_at >= day_start, Order.created_at < day_end)
  ).one()

  payment_rows = session.exec(
    select(Order.payment_method, func.count(Order.id))
    .where(Order.created_at >= day_start, Order.created_at < day_end)
    .group_by(Order.payment_method)
  ).all()
  payment_breakdown = {method.value if isinstance(method, PaymentMethod) else method: count for method, count in payment_rows}

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


@router.post('/checkout', response_model=PosCheckoutResponse, status_code=status.HTTP_201_CREATED)
def checkout(
  payload: PosCheckoutRequest,
  session: Session = Depends(get_session)
):
  if not payload.items:
    raise HTTPException(status_code=400, detail='至少需要一個商品進行結帳')

  member = None
  member_phone = normalize_phone(payload.member_phone)
  if member_phone:
    member = session.exec(select(Member).where(Member.phone == member_phone)).scalars().first()
    if not member:
      raise HTTPException(status_code=404, detail='找不到會員')

  order = Order(
    member_id=member.id if member else None,
    payment_method=payload.payment_method
  )
  session.add(order)
  session.flush()

  gross_total = 0.0
  cost_total = 0.0

  for item in payload.items:
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
  ) = calculate_discounts(member, gross_total, session, now)

  manual_discount_amount = 0.0
  if manual_discount_rate:
    manual_discount_amount = round_currency(gross_total * manual_discount_rate)
    member_discount_applied = False
    birthday_discount_applied = False

  discount_total = round_currency(member_discount_amount + birthday_discount_amount + manual_discount_amount)
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

  session.add(order)
  session.commit()
  session.refresh(order)

  member_summary = (
    _build_member_summary(member, now, birthday_discount_available(session, member, now) if member else False)
    if member else None
  )

  discounts = PosCheckoutDiscounts(
    member_discount=member_discount_amount,
    birthday_discount=birthday_discount_amount,
    manual_discount=manual_discount_amount,
    member_discount_applied=member_discount_applied,
    birthday_discount_applied=birthday_discount_applied
  )

  return PosCheckoutResponse(
    order_id=order.id,
    gross_total=order.gross_total,
    discount_total=order.discount_total,
    total_price=order.total_price,
    cost_total=order.cost_total,
    profit_total=order.profit_total,
    payment_method=order.payment_method,
    discounts=discounts,
    member=member_summary,
    created_at=order.created_at
  )
