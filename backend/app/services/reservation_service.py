from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlmodel import Session

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
  ReservationType,
)
from ..schemas import (
  MemberSuggestion,
  OrderMemberInfo,
  PaginatedResponse,
  ReservationCreate,
  ReservationItemDetail,
  ReservationItemPayload,
  ReservationProductSummary,
  ReservationRead,
  ReservationUpdate,
)
from ..utils.pos_logic import calculate_discounts, normalize_phone, round_currency
from ..utils.stock import apply_stock_delta, deduct_stock
from ..utils.time_utils import utc8_now
from .member_service import MemberService


class ReservationService:
  def __init__(self, session: Session) -> None:
    self.session = session
    self._member_service = MemberService(session)

  # ── Serialization ──────────────────────────────────────────────────────────

  def build_items(self, reservation_ids: list[int]) -> dict[int, list[ReservationItemDetail]]:
    if not reservation_ids:
      return {}
    statement = (
      select(ReservationItem, Product)
      .join(Product, Product.id == ReservationItem.product_id)
      .where(ReservationItem.reservation_id.in_(reservation_ids))
    )
    result: dict[int, list[ReservationItemDetail]] = {rid: [] for rid in reservation_ids}
    for item, product in self.session.exec(statement):
      result.setdefault(item.reservation_id, []).append(
        ReservationItemDetail(
          id=item.id,
          product_id=item.product_id,
          quantity=item.quantity,
          product=ReservationProductSummary(
            id=product.id, name=product.name, sku=product.sku,
            barcode=product.barcode, color=product.color, size=product.size,
            stock=product.stock, price=product.price
          )
        )
      )
    return result

  def serialize(
    self,
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
      member=self._member_service.build_order_member_info(member),
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

  # ── Query operations ───────────────────────────────────────────────────────

  def list(
    self,
    page: int,
    size: int,
    offset: int,
    reservation_type: Optional[ReservationType] = None,
    status_filter: Optional[ReservationStatus] = None,
    payment_status: Optional[ReservationPaymentStatus] = None,
    q: Optional[str] = None,
  ) -> PaginatedResponse[ReservationRead]:
    base_filters = []
    if reservation_type:
      base_filters.append(Reservation.type == reservation_type)
    if status_filter:
      base_filters.append(Reservation.status == status_filter)
    if payment_status:
      base_filters.append(Reservation.payment_status == payment_status)

    search_filter = None
    if q:
      keyword = f'%{q.strip()}%'
      search_filter = or_(
        Reservation.customer_name.ilike(keyword),
        Reservation.customer_phone.ilike(keyword),
        Product.name.ilike(keyword),
        Product.sku.ilike(keyword),
        Product.barcode.ilike(keyword)
      )

    total_stmt = select(func.count(func.distinct(Reservation.id))).select_from(Reservation)
    if base_filters:
      total_stmt = total_stmt.where(*base_filters)
    if search_filter is not None:
      total_stmt = (
        total_stmt
        .join(ReservationItem, ReservationItem.reservation_id == Reservation.id)
        .join(Product, Product.id == ReservationItem.product_id)
        .where(search_filter)
      )
    total = self.session.exec(total_stmt).scalar_one()

    stmt = (
      select(Reservation, Member)
      .outerjoin(Member, Member.id == Reservation.member_id)
      .order_by(Reservation.created_at.desc())
      .offset(offset)
      .limit(size)
    )
    if base_filters:
      stmt = stmt.where(*base_filters)
    if search_filter is not None:
      stmt = (
        stmt
        .join(ReservationItem, ReservationItem.reservation_id == Reservation.id)
        .join(Product, Product.id == ReservationItem.product_id)
        .where(search_filter)
        .group_by(Reservation.id, Member.id)
      )

    rows = self.session.exec(stmt).all()
    reservation_ids = [r.id for r, _ in rows]
    items_map = self.build_items(reservation_ids)
    data = [
      self.serialize(reservation, items_map.get(reservation.id, []), member)
      for reservation, member in rows
    ]
    return PaginatedResponse[ReservationRead](data=data, total=total, page=page, size=size)

  def search_members(self, q: str) -> List[MemberSuggestion]:
    keyword = f'%{q.strip()}%'
    members = self.session.exec(
      select(Member)
      .where(or_(Member.name.ilike(keyword), Member.phone.ilike(keyword), Member.member_code.ilike(keyword)))
      .order_by(Member.name)
      .limit(10)
    ).scalars().all()
    return [
      MemberSuggestion(id=m.id, member_code=m.member_code, name=m.name, phone=m.phone)
      for m in members
    ]

  # ── Mutation operations ────────────────────────────────────────────────────

  def create(self, payload: ReservationCreate) -> ReservationRead:
    member = self._get_member(payload.member_id)
    items = self._validate_and_merge_items(payload.items)

    for item in items:
      product = self._get_product(item.product_id)
      if payload.type == ReservationType.HOLD:
        self._reserve_hold_stock(product, item.quantity)
        self.session.add(product)

    reservation = Reservation(
      type=payload.type,
      product_id=items[0].product_id,
      quantity=sum(item.quantity for item in items),
      member_id=member.id if member else None,
      customer_name=payload.customer_name.strip(),
      customer_phone=normalize_phone(payload.customer_phone),
      note=(payload.note or '').strip() or None,
      expected_date=payload.expected_date,
      hold_until=payload.hold_until,
      payment_status=payload.payment_status,
      paid_amount=round_currency(payload.paid_amount or 0)
    )
    self.session.add(reservation)
    self.session.flush()

    for item in items:
      self.session.add(ReservationItem(reservation_id=reservation.id, product_id=item.product_id, quantity=item.quantity))

    self.session.commit()
    self.session.refresh(reservation)
    items_map = self.build_items([reservation.id])
    return self.serialize(reservation, items_map.get(reservation.id, []), member)

  def update(self, reservation_id: int, payload: ReservationUpdate) -> ReservationRead:
    reservation = self.session.get(Reservation, reservation_id)
    if not reservation:
      raise HTTPException(status_code=404, detail='找不到預定/留貨紀錄')

    member = self._get_member(reservation.member_id)
    payload_data = payload.dict(exclude_unset=True)
    previous_status = reservation.status
    existing_items = self.session.exec(
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
      new_items = self._validate_and_merge_items(payload.items)
      reservation.product_id = new_items[0].product_id
      reservation.quantity = sum(item.quantity for item in new_items)

      if reservation.type == ReservationType.HOLD:
        self._adjust_hold_stock(existing_items, new_items, previous_status, new_status)

      for item in existing_items:
        self.session.delete(item)
      self.session.flush()
      for item in new_items:
        self.session.add(ReservationItem(
          reservation_id=reservation.id, product_id=item.product_id, quantity=item.quantity
        ))
      current_items = self.session.exec(
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
        member = self._get_member(payload.member_id)
        reservation.member_id = member.id if member else None

    if reservation.type == ReservationType.HOLD and payload.items is None:
      self._handle_status_change_stock(reservation, current_items, previous_status, new_status)

    if reservation.status == ReservationStatus.COMPLETED and not reservation.order_id:
      order_items = self.build_items([reservation.id]).get(reservation.id, [])
      order = self._create_order_from_reservation(reservation, order_items, member)
      reservation.order_id = order.id

    self.session.add(reservation)
    self.session.commit()
    self.session.refresh(reservation)
    items_map = self.build_items([reservation.id])
    return self.serialize(reservation, items_map.get(reservation.id, []), member)

  # ── Private helpers ────────────────────────────────────────────────────────

  def _get_product(self, product_id: int) -> Product:
    product = self.session.get(Product, product_id)
    if not product:
      raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail='找不到指定商品')
    return product

  def _get_member(self, member_id: Optional[int]) -> Optional[Member]:
    if not member_id:
      return None
    member = self.session.get(Member, member_id)
    if not member:
      raise HTTPException(status_code=404, detail='找不到會員')
    return member

  def _reserve_hold_stock(self, product: Product, quantity: int) -> None:
    if quantity <= 0:
      return
    try:
      deduct_stock(self.session, product, quantity)
    except HTTPException:
      raise HTTPException(status_code=400, detail='庫存不足以留貨')

  def _release_hold_stock(self, product: Product, quantity: int) -> None:
    if quantity <= 0:
      return
    apply_stock_delta(self.session, product, quantity)

  def _validate_and_merge_items(self, items: list[ReservationItemPayload]) -> list[ReservationItemPayload]:
    if not items:
      raise HTTPException(status_code=400, detail='至少需要一個商品')
    merged: dict[int, int] = {}
    for item in items:
      if item.quantity <= 0:
        raise HTTPException(status_code=400, detail='商品數量需大於 0')
      if not self.session.get(Product, item.product_id):
        raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')
      merged[item.product_id] = merged.get(item.product_id, 0) + item.quantity
    return [ReservationItemPayload(product_id=pid, quantity=qty) for pid, qty in merged.items()]

  def _adjust_hold_stock(
    self,
    existing_items: list[ReservationItem],
    new_items: list[ReservationItemPayload],
    previous_status: ReservationStatus,
    new_status: ReservationStatus
  ) -> None:
    existing_map = {item.product_id: item.quantity for item in existing_items}
    new_map = {item.product_id: item.quantity for item in new_items}

    if previous_status != ReservationStatus.CANCELLED:
      for product_id, old_qty in existing_map.items():
        delta = new_map.get(product_id, 0) - old_qty
        product = self._get_product(product_id)
        if delta > 0:
          self._reserve_hold_stock(product, delta)
        elif delta < 0:
          self._release_hold_stock(product, -delta)
        self.session.add(product)
      for product_id, new_qty in new_map.items():
        if product_id not in existing_map:
          product = self._get_product(product_id)
          self._reserve_hold_stock(product, new_qty)
          self.session.add(product)
    elif new_status != ReservationStatus.CANCELLED:
      for product_id, new_qty in new_map.items():
        product = self._get_product(product_id)
        self._reserve_hold_stock(product, new_qty)
        self.session.add(product)

  def _handle_status_change_stock(
    self,
    reservation: Reservation,
    current_items: list[ReservationItem],
    previous_status: ReservationStatus,
    new_status: ReservationStatus
  ) -> None:
    if (
      previous_status != ReservationStatus.CANCELLED and
      new_status == ReservationStatus.CANCELLED and
      not reservation.order_id
    ):
      for item in current_items:
        product = self._get_product(item.product_id)
        self._release_hold_stock(product, item.quantity)
        self.session.add(product)
    elif previous_status == ReservationStatus.CANCELLED and new_status != ReservationStatus.CANCELLED:
      for item in current_items:
        product = self._get_product(item.product_id)
        self._reserve_hold_stock(product, item.quantity)
        self.session.add(product)

  def _create_order_from_reservation(
    self,
    reservation: Reservation,
    items: list[ReservationItemDetail],
    member: Optional[Member]
  ) -> Order:
    if reservation.order_id:
      existing = self.session.get(Order, reservation.order_id)
      if existing:
        return existing

    if not items:
      raise HTTPException(status_code=400, detail='沒有商品可建立訂單')

    now = utc8_now()
    gross_total = 0.0
    cost_total = 0.0

    for item in items:
      product = self.session.get(Product, item.product_id)
      if not product:
        raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')
      gross_total += round_currency(product.price) * item.quantity
      cost_total += round_currency(product.cost) * item.quantity
      if reservation.type == ReservationType.PREORDER:
        # Best-effort: deduct only if enough stock, atomically. Swallow the
        # insufficient-stock error since preorder conversion is conditional.
        try:
          deduct_stock(self.session, product, item.quantity)
        except HTTPException:
          pass

    gross_total = round_currency(gross_total)
    cost_total = round_currency(cost_total)
    total_price = round_currency(reservation.paid_amount)
    discount_total = max(gross_total - total_price, 0)

    member_discount_applied = False
    birthday_discount_applied = False
    if member and discount_total > 0:
      (m_discount, b_discount, _, _) = calculate_discounts(member, gross_total, self.session, now)
      if b_discount > 0:
        birthday_discount_applied = True
      elif m_discount > 0:
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
      profit_total=round_currency(total_price - cost_total),
      member_discount_applied=member_discount_applied,
      birthday_discount_applied=birthday_discount_applied,
      note=f'預定/留貨 #{reservation.id}'
    )
    self.session.add(order)
    self.session.flush()

    for item in items:
      product = self.session.get(Product, item.product_id)
      if not product:
        continue
      unit_price = round_currency(product.price)
      unit_cost = round_currency(product.cost)
      self.session.add(OrderItem(
        order_id=order.id, product_id=product.id, quantity=item.quantity,
        unit_price=unit_price, unit_cost=unit_cost,
        subtotal=round_currency(unit_price * item.quantity),
        cost_subtotal=round_currency(unit_cost * item.quantity),
        custom_reason='預定/留貨'
      ))
    return order
