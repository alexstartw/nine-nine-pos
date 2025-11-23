from __future__ import annotations

from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, or_, select
from sqlmodel import Session

from ..database import get_session
from ..models import (
  Member,
  Order,
  OrderItem,
  PaymentMethod,
  Product,
  Reservation,
  ReservationPaymentStatus,
  ReservationStatus,
  ReservationType
)
from ..schemas import (
  MemberSuggestion,
  OrderMemberInfo,
  PaginatedResponse,
  PaginationParams,
  ReservationCreate,
  ReservationProductSummary,
  ReservationRead,
  ReservationUpdate
)
from ..utils.pos_logic import calculate_discounts, normalize_phone, round_currency
from ..utils.time_utils import utc8_now

router = APIRouter(prefix='/reservations', tags=['reservations'])


def _build_member_summary(member: Optional[Member]) -> Optional[OrderMemberInfo]:
  if not member:
    return None
  return OrderMemberInfo(
    id=member.id,
    member_code=member.member_code,
    name=member.name,
    phone=member.phone
  )


def _serialize_reservation(
  reservation: Reservation,
  product: Product,
  member: Optional[Member] = None
) -> ReservationRead:
  return ReservationRead(
    id=reservation.id,
    type=reservation.type,
    status=reservation.status,
    payment_status=reservation.payment_status,
    product_id=product.id,
    product=ReservationProductSummary(
      id=product.id,
      name=product.name,
      sku=product.sku,
      barcode=product.barcode,
      stock=product.stock,
      price=product.price
    ),
    quantity=reservation.quantity,
    member_id=reservation.member_id,
    member=_build_member_summary(member),
    order_id=reservation.order_id,
    customer_name=reservation.customer_name,
    customer_phone=reservation.customer_phone,
    note=reservation.note,
    expected_date=reservation.expected_date,
    hold_until=reservation.hold_until,
    paid_amount=reservation.paid_amount,
    created_at=reservation.created_at,
    updated_at=reservation.updated_at
  )


@router.get('', response_model=PaginatedResponse[ReservationRead])
def list_reservations(
  params: PaginationParams = Depends(),
  reservation_type: Optional[ReservationType] = Query(default=None, description='篩選預定或留貨'),
  status_filter: Optional[ReservationStatus] = Query(default=None, alias='status'),
  payment_status: Optional[ReservationPaymentStatus] = Query(default=None),
  q: Optional[str] = Query(
    default=None,
    description='關鍵字：客戶名稱、電話、商品名稱、SKU 或條碼'
  ),
  session: Session = Depends(get_session)
):
  base_filters = []
  if reservation_type:
    base_filters.append(Reservation.type == reservation_type)
  if status_filter:
    base_filters.append(Reservation.status == status_filter)
  if payment_status:
    base_filters.append(Reservation.payment_status == payment_status)

  search_filters = None
  if q:
    keyword = f'%{q.strip()}%'
    search_filters = or_(
      Reservation.customer_name.ilike(keyword),
      Reservation.customer_phone.ilike(keyword),
      Product.name.ilike(keyword),
      Product.sku.ilike(keyword),
      Product.barcode.ilike(keyword)
    )

  total_statement = select(func.count()).select_from(Reservation)
  if base_filters:
    total_statement = total_statement.where(*base_filters)
  if search_filters is not None:
    total_statement = total_statement.join(Product, Product.id == Reservation.product_id).where(search_filters)

  total = session.exec(total_statement).scalar_one()

  statement = (
    select(Reservation, Product, Member)
    .join(Product, Product.id == Reservation.product_id)
    .outerjoin(Member, Member.id == Reservation.member_id)
    .order_by(Reservation.created_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )

  if base_filters:
    statement = statement.where(*base_filters)
  if search_filters is not None:
    statement = statement.where(search_filters)

  rows = session.exec(statement).all()

  data = [
    _serialize_reservation(reservation, product, member)
    for reservation, product, member in rows
  ]

  return PaginatedResponse[ReservationRead](data=data, total=total, page=params.page, size=params.size)


def _get_product(session: Session, product_id: int) -> Product:
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='找不到指定商品')
  return product


def _get_member(session: Session, member_id: Optional[int]) -> Optional[Member]:
  if not member_id:
    return None
  member = session.get(Member, member_id)
  if not member:
    raise HTTPException(status_code=404, detail='找不到會員')
  return member


def _reserve_hold_stock(product: Product, quantity: int) -> None:
  if quantity <= 0:
    return
  if product.stock < quantity:
    raise HTTPException(status_code=400, detail='庫存不足以留貨')
  product.stock -= quantity
  product.updated_at = utc8_now()


def _release_hold_stock(product: Product, quantity: int) -> None:
  if quantity <= 0:
    return
  product.stock += quantity
  product.updated_at = utc8_now()


def _create_order_from_reservation(
  session: Session,
  reservation: Reservation,
  product: Product,
  member: Optional[Member]
) -> Order:
  if reservation.order_id:
    existing = session.get(Order, reservation.order_id)
    if existing:
      return existing

  if reservation.type != ReservationType.HOLD and product.stock < reservation.quantity:
    raise HTTPException(status_code=400, detail='庫存不足以建立訂單')

  now = utc8_now()
  unit_price = round_currency(product.price)
  gross_total = round_currency(unit_price * reservation.quantity)
  unit_cost = round_currency(product.cost)
  cost_total = round_currency(unit_cost * reservation.quantity)
  total_price = round_currency(reservation.paid_amount)
  discount_total = max(gross_total - total_price, 0)
  profit_total = round_currency(total_price - cost_total)

  member_discount_applied = False
  birthday_discount_applied = False
  if member:
    (
      member_discount_amount,
      birthday_discount_amount,
      _,
      _
    ) = calculate_discounts(member, gross_total, session, now)
    if discount_total > 0:
      if birthday_discount_amount > 0:
        birthday_discount_applied = True
      elif member_discount_amount > 0:
        member_discount_applied = True

  order = Order(
    member_id=member.id if member else None,
    reservation_id=reservation.id,
    payment_method=PaymentMethod.CASH,
    gross_total=gross_total,
    discount_total=discount_total,
    discount=discount_total,
    total_price=total_price,
    cost_total=cost_total,
    profit_total=profit_total,
    member_discount_applied=member_discount_applied,
    birthday_discount_applied=birthday_discount_applied,
    note=f'預定/留貨 #{reservation.id}'
  )
  session.add(order)
  session.flush()

  order_item = OrderItem(
    order_id=order.id,
    product_id=product.id,
    quantity=reservation.quantity,
    unit_price=unit_price,
    unit_cost=unit_cost,
    subtotal=gross_total,
    cost_subtotal=cost_total,
    custom_reason='預定/留貨'
  )
  session.add(order_item)

  if reservation.type != ReservationType.HOLD:
    product.stock -= reservation.quantity
    product.updated_at = now
    session.add(product)

  return order


@router.get('/member-suggestions', response_model=List[MemberSuggestion])
def member_suggestions(
  q: str = Query(..., min_length=1, description='搜尋會員姓名、電話或會員代碼'),
  session: Session = Depends(get_session)
):
  keyword = f'%{q.strip()}%'
  statement = (
    select(Member)
    .where(
      or_(
        Member.name.ilike(keyword),
        Member.phone.ilike(keyword),
        Member.member_code.ilike(keyword)
      )
    )
    .order_by(Member.name)
    .limit(10)
  )
  members = session.exec(statement).scalars().all()
  return [
    MemberSuggestion(
      id=member.id,
      member_code=member.member_code,
      name=member.name,
      phone=member.phone
    )
    for member in members
  ]


@router.post('', response_model=ReservationRead, status_code=status.HTTP_201_CREATED)
def create_reservation(payload: ReservationCreate, session: Session = Depends(get_session)):
  product = _get_product(session, payload.product_id)
  member = _get_member(session, payload.member_id)

  if payload.quantity <= 0:
    raise HTTPException(status_code=400, detail='數量需大於 0')

  normalized_phone = normalize_phone(payload.customer_phone)
  note = (payload.note or '').strip() or None
  paid_amount = round_currency(payload.paid_amount or 0)

  if payload.type == ReservationType.HOLD:
    _reserve_hold_stock(product, payload.quantity)
    session.add(product)

  reservation = Reservation(
    type=payload.type,
    product_id=product.id,
    quantity=payload.quantity,
    member_id=member.id if member else None,
    customer_name=payload.customer_name.strip(),
    customer_phone=normalized_phone,
    note=note,
    expected_date=payload.expected_date,
    hold_until=payload.hold_until,
    payment_status=payload.payment_status,
    paid_amount=paid_amount
  )

  session.add(reservation)
  session.commit()
  session.refresh(reservation)

  return _serialize_reservation(reservation, product, member)


@router.put('/{reservation_id}', response_model=ReservationRead)
def update_reservation(
  reservation_id: int,
  payload: ReservationUpdate,
  session: Session = Depends(get_session)
):
  reservation = session.get(Reservation, reservation_id)
  if not reservation:
    raise HTTPException(status_code=404, detail='找不到預定/留貨紀錄')

  product = _get_product(session, reservation.product_id)
  member = _get_member(session, reservation.member_id)
  payload_data = payload.dict(exclude_unset=True)
  previous_status = reservation.status
  previous_quantity = reservation.quantity

  if payload.customer_name is not None:
    name = payload.customer_name.strip()
    if not name:
      raise HTTPException(status_code=400, detail='客戶名稱不得為空')
    reservation.customer_name = name

  if payload.customer_phone is not None:
    reservation.customer_phone = normalize_phone(payload.customer_phone)

  if payload.quantity is not None:
    if payload.quantity <= 0:
      raise HTTPException(status_code=400, detail='數量需大於 0')
    if reservation.type == ReservationType.HOLD and previous_status != ReservationStatus.CANCELLED:
      delta = payload.quantity - previous_quantity
      if delta > 0:
        _reserve_hold_stock(product, delta)
        session.add(product)
      elif delta < 0:
        _release_hold_stock(product, -delta)
        session.add(product)
    reservation.quantity = payload.quantity

  if payload.note is not None:
    reservation.note = payload.note.strip() or None

  if payload.expected_date is not None:
    reservation.expected_date = payload.expected_date

  if payload.hold_until is not None:
    reservation.hold_until = payload.hold_until

  if payload.payment_status is not None:
    reservation.payment_status = payload.payment_status

  if payload.status is not None:
    reservation.status = payload.status

  if payload.paid_amount is not None:
    reservation.paid_amount = round_currency(payload.paid_amount)

  if 'member_id' in payload_data:
    if payload.member_id is None:
      member = None
      reservation.member_id = None
    else:
      member = _get_member(session, payload.member_id)
      reservation.member_id = member.id if member else None

  if reservation.type == ReservationType.HOLD:
    new_status = reservation.status
    if (
      previous_status != ReservationStatus.CANCELLED and
      new_status == ReservationStatus.CANCELLED and
      not reservation.order_id
    ):
      _release_hold_stock(product, reservation.quantity)
      session.add(product)
    elif previous_status == ReservationStatus.CANCELLED and new_status != ReservationStatus.CANCELLED:
      _reserve_hold_stock(product, reservation.quantity)
      session.add(product)

  order: Optional[Order] = None
  if reservation.status == ReservationStatus.COMPLETED and not reservation.order_id:
    order = _create_order_from_reservation(session, reservation, product, member)
    reservation.order_id = order.id

  session.add(reservation)
  session.commit()
  session.refresh(reservation)

  return _serialize_reservation(reservation, product, member)
