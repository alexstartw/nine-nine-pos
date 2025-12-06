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
  ReservationItem,
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
  ReservationItemDetail,
  ReservationItemPayload,
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
  items: list[ReservationItemDetail],
  member: Optional[Member] = None
) -> ReservationRead:
  return ReservationRead(
    id=reservation.id,
    type=reservation.type,
    status=reservation.status,
    payment_status=reservation.payment_status,
    items=items,
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

  total_statement = select(func.count(func.distinct(Reservation.id))).select_from(Reservation)
  if base_filters:
    total_statement = total_statement.where(*base_filters)
  if search_filters is not None:
    total_statement = (
      total_statement
      .join(ReservationItem, ReservationItem.reservation_id == Reservation.id)
      .join(Product, Product.id == ReservationItem.product_id)
      .where(search_filters)
    )

  total = session.exec(total_statement).scalar_one()

  statement = (
    select(Reservation, Member)
    .outerjoin(Member, Member.id == Reservation.member_id)
    .order_by(Reservation.created_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )

  if base_filters:
    statement = statement.where(*base_filters)
  if search_filters is not None:
    statement = (
      statement
      .join(ReservationItem, ReservationItem.reservation_id == Reservation.id)
      .join(Product, Product.id == ReservationItem.product_id)
      .where(search_filters)
      .group_by(Reservation.id, Member.id)
    )

  rows = session.exec(statement).all()

  reservation_ids = [reservation.id for reservation, _ in rows]
  items_map = _build_reservation_items(session, reservation_ids)

  data = [
    _serialize_reservation(reservation, items_map.get(reservation.id, []), member)
    for reservation, member in rows
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


def _build_reservation_items(
  session: Session,
  reservation_ids: list[int]
) -> dict[int, list[ReservationItemDetail]]:
  if not reservation_ids:
    return {}

  statement = (
    select(ReservationItem, Product)
    .join(Product, Product.id == ReservationItem.product_id)
    .where(ReservationItem.reservation_id.in_(reservation_ids))
  )
  result: dict[int, list[ReservationItemDetail]] = {rid: [] for rid in reservation_ids}
  for item, product in session.exec(statement):
    result.setdefault(item.reservation_id, []).append(
      ReservationItemDetail(
        id=item.id,
        product_id=item.product_id,
        quantity=item.quantity,
        product=ReservationProductSummary(
          id=product.id,
          name=product.name,
          sku=product.sku,
          barcode=product.barcode,
          stock=product.stock,
          price=product.price
        )
      )
    )
  return result


def _validate_and_merge_items(
  session: Session,
  items: list[ReservationItemPayload]
) -> list[ReservationItemPayload]:
  if not items:
    raise HTTPException(status_code=400, detail='至少需要一個商品')

  merged: dict[int, int] = {}
  for item in items:
    if item.quantity <= 0:
      raise HTTPException(status_code=400, detail='商品數量需大於 0')
    product = session.get(Product, item.product_id)
    if not product:
      raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')
    merged[item.product_id] = merged.get(item.product_id, 0) + item.quantity

  return [ReservationItemPayload(product_id=pid, quantity=qty) for pid, qty in merged.items()]


def _create_order_from_reservation(
  session: Session,
  reservation: Reservation,
  items: list[ReservationItemDetail],
  member: Optional[Member]
) -> Order:
  if reservation.order_id:
    existing = session.get(Order, reservation.order_id)
    if existing:
      return existing

  if not items:
    raise HTTPException(status_code=400, detail='沒有商品可建立訂單')

  now = utc8_now()
  gross_total = 0.0
  cost_total = 0.0

  for item in items:
    product = session.get(Product, item.product_id)
    if not product:
      raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')
    unit_price = round_currency(product.price)
    unit_cost = round_currency(product.cost)
    gross_total += unit_price * item.quantity
    cost_total += unit_cost * item.quantity
    if reservation.type == ReservationType.PREORDER and product.stock >= item.quantity:
      product.stock -= item.quantity
      product.updated_at = now
      session.add(product)

  gross_total = round_currency(gross_total)
  cost_total = round_currency(cost_total)
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

  for item in items:
    product = session.get(Product, item.product_id)
    if not product:
      continue
    unit_price = round_currency(product.price)
    unit_cost = round_currency(product.cost)
    subtotal = round_currency(unit_price * item.quantity)
    cost_subtotal = round_currency(unit_cost * item.quantity)

    order_item = OrderItem(
      order_id=order.id,
      product_id=product.id,
      quantity=item.quantity,
      unit_price=unit_price,
      unit_cost=unit_cost,
      subtotal=subtotal,
      cost_subtotal=cost_subtotal,
      custom_reason='預定/留貨'
    )
    session.add(order_item)

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
  member = _get_member(session, payload.member_id)

  normalized_phone = normalize_phone(payload.customer_phone)
  note = (payload.note or '').strip() or None
  paid_amount = round_currency(payload.paid_amount or 0)
  items = _validate_and_merge_items(session, payload.items)

  products_map: dict[int, Product] = {}
  for item in items:
    product = _get_product(session, item.product_id)
    products_map[item.product_id] = product
    if payload.type == ReservationType.HOLD:
      _reserve_hold_stock(product, item.quantity)
      session.add(product)

  total_quantity = sum(item.quantity for item in items)
  reservation = Reservation(
    type=payload.type,
    product_id=items[0].product_id,
    quantity=total_quantity,
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
  session.flush()

  for item in items:
    session.add(ReservationItem(
      reservation_id=reservation.id,
      product_id=item.product_id,
      quantity=item.quantity
    ))

  session.commit()
  session.refresh(reservation)

  items_map = _build_reservation_items(session, [reservation.id])
  return _serialize_reservation(reservation, items_map.get(reservation.id, []), member)


@router.put('/{reservation_id}', response_model=ReservationRead)
def update_reservation(
  reservation_id: int,
  payload: ReservationUpdate,
  session: Session = Depends(get_session)
):
  reservation = session.get(Reservation, reservation_id)
  if not reservation:
    raise HTTPException(status_code=404, detail='找不到預定/留貨紀錄')

  member = _get_member(session, reservation.member_id)
  payload_data = payload.dict(exclude_unset=True)
  previous_status = reservation.status
  existing_items = session.exec(
    select(ReservationItem).where(ReservationItem.reservation_id == reservation.id)
  ).scalars().all()
  new_status = payload.status or reservation.status

  if payload.customer_name is not None:
    name = payload.customer_name.strip()
    if not name:
      raise HTTPException(status_code=400, detail='客戶名稱不得為空')
    reservation.customer_name = name

  if payload.customer_phone is not None:
    reservation.customer_phone = normalize_phone(payload.customer_phone)

  current_items = existing_items

  if payload.items is not None:
    new_items = _validate_and_merge_items(session, payload.items)
    new_quantity_total = sum(item.quantity for item in new_items)
    reservation.product_id = new_items[0].product_id

    if reservation.type == ReservationType.HOLD:
      existing_map = {item.product_id: item.quantity for item in existing_items}
      new_map = {item.product_id: item.quantity for item in new_items}

      if previous_status != ReservationStatus.CANCELLED:
        # Adjust based on delta
        for product_id, old_qty in existing_map.items():
          new_qty = new_map.get(product_id, 0)
          delta = new_qty - old_qty
          if delta > 0:
            product = _get_product(session, product_id)
            _reserve_hold_stock(product, delta)
            session.add(product)
          elif delta < 0:
            product = _get_product(session, product_id)
            _release_hold_stock(product, -delta)
            session.add(product)
        for product_id, new_qty in new_map.items():
          if product_id not in existing_map:
            product = _get_product(session, product_id)
            _reserve_hold_stock(product, new_qty)
            session.add(product)
      elif new_status != ReservationStatus.CANCELLED:
        # previously cancelled, now reactivate -> reserve all new items
        for product_id, new_qty in new_map.items():
          product = _get_product(session, product_id)
          _reserve_hold_stock(product, new_qty)
          session.add(product)

    # Replace items
    for item in existing_items:
      session.delete(item)
    session.flush()
    for item in new_items:
      session.add(ReservationItem(
        reservation_id=reservation.id,
        product_id=item.product_id,
        quantity=item.quantity
      ))
    reservation.quantity = new_quantity_total
    current_items = session.exec(
      select(ReservationItem).where(ReservationItem.reservation_id == reservation.id)
    ).scalars().all()

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
    if (
      previous_status != ReservationStatus.CANCELLED and
      new_status == ReservationStatus.CANCELLED and
      not reservation.order_id
    ):
      for item in current_items:
        product = _get_product(session, item.product_id)
        _release_hold_stock(product, item.quantity)
        session.add(product)
    elif previous_status == ReservationStatus.CANCELLED and new_status != ReservationStatus.CANCELLED:
      for item in current_items:
        product = _get_product(session, item.product_id)
        _reserve_hold_stock(product, item.quantity)
        session.add(product)

  order: Optional[Order] = None
  if reservation.status == ReservationStatus.COMPLETED and not reservation.order_id:
    order_items = _build_reservation_items(session, [reservation.id]).get(reservation.id, [])
    order = _create_order_from_reservation(session, reservation, order_items, member)
    reservation.order_id = order.id

  session.add(reservation)
  session.commit()
  session.refresh(reservation)

  items_map = _build_reservation_items(session, [reservation.id])
  return _serialize_reservation(reservation, items_map.get(reservation.id, []), member)
