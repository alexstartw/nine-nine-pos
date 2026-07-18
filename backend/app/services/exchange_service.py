from __future__ import annotations

from typing import List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlmodel import Session

from ..models import Member, Order, OrderItem, Product, StockEntry, StockEntryMethod
from ..schemas import (
  ExchangeCheckoutRequest,
  ExchangeCheckoutResponse,
  ExchangeOriginalItem,
  ExchangeOriginalLookupResponse,
  OrderMemberInfo,
  PosCheckoutDiscounts,
)
from ..utils.pos_logic import (
  birthday_discount_available,
  calculate_discounts,
  is_birthday_month,
  normalize_phone,
  round_currency,
)
from ..utils.stock import apply_stock_delta, deduct_stock
from ..utils.time_utils import utc8_now


class ExchangeService:
  def __init__(self, session: Session) -> None:
    self.session = session

  # ── Original order lookup ──────────────────────────────────────────────────

  def lookup_original_order(self, order_id: int) -> ExchangeOriginalLookupResponse:
    order = self.session.get(Order, order_id)
    if not order:
      raise HTTPException(status_code=404, detail=f'找不到訂單 #{order_id}')
    if order.is_cancelled:
      raise HTTPException(status_code=400, detail='已取消的訂單無法進行換貨')

    items = self.session.exec(
      select(OrderItem, Product)
      .join(Product, Product.id == OrderItem.product_id)
      .where(OrderItem.order_id == order_id, OrderItem.is_return == False)  # noqa: E712
    ).all()

    result: List[ExchangeOriginalItem] = []
    for order_item, product in items:
      already_returned = self.session.exec(
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .where(
          OrderItem.original_order_item_id == order_item.id,
          OrderItem.is_return == True,  # noqa: E712
        )
      ).scalar_one()
      already_returned = abs(int(already_returned))
      refundable = order_item.quantity - already_returned
      if refundable <= 0:
        continue
      result.append(ExchangeOriginalItem(
        order_item_id=order_item.id,
        product_id=product.id,
        product_name=product.name,
        barcode=product.barcode,
        color=product.color,
        size=product.size,
        purchased_quantity=order_item.quantity,
        refundable_quantity=refundable,
        sold_unit_price=order_item.unit_price,
        list_price=product.price,
      ))

    member_info: Optional[OrderMemberInfo] = None
    if order.member_id:
      member = self.session.get(Member, order.member_id)
      if member:
        member_info = OrderMemberInfo(
          id=member.id,
          member_code=member.member_code,
          name=member.name,
          phone=member.phone,
        )

    return ExchangeOriginalLookupResponse(
      order_id=order.id,
      created_at=order.created_at,
      member=member_info,
      items=result,
    )

  # ── Exchange checkout ──────────────────────────────────────────────────────

  def exchange_checkout(self, payload: ExchangeCheckoutRequest) -> ExchangeCheckoutResponse:
    if not payload.return_items:
      raise HTTPException(status_code=400, detail='換貨至少需要一筆退回商品')

    now = utc8_now()

    # Resolve member
    member: Optional[Member] = None
    member_phone = normalize_phone(payload.member_phone)
    if member_phone:
      member = self.session.exec(
        select(Member).where(Member.phone == member_phone)
      ).scalars().first()
      if not member:
        raise HTTPException(status_code=404, detail='找不到會員')

    # Validate discount rate
    manual_discount_rate = payload.manual_discount_rate
    if manual_discount_rate is not None and not (0 <= manual_discount_rate <= 0.9):
      raise HTTPException(status_code=400, detail='折扣率需介於 0% 與 90% 之間')

    # Create exchange order
    order = Order(
      member_id=member.id if member else None,
      payment_method=payload.payment_method,
      is_exchange=True,
      original_order_id=payload.original_order_id,
      note=payload.note,
    )
    self.session.add(order)
    self.session.flush()

    refund_total = 0.0
    return_cost_total = 0.0

    # ── Process return items (A) ────────────────────────────────────────────
    for ret in payload.return_items:
      product = self.session.get(Product, ret.product_id)
      if not product:
        raise HTTPException(status_code=404, detail=f'找不到商品 {ret.product_id}')

      # A return must be linked to a real original order item, and that item
      # must belong to the order being exchanged. This prevents over-refunding
      # or returning products that were never in the original order.
      if ret.original_order_item_id is None:
        raise HTTPException(status_code=400, detail='退回商品必須對應原始訂單品項')

      original_item = self.session.get(OrderItem, ret.original_order_item_id)
      if not original_item:
        raise HTTPException(status_code=404, detail=f'找不到原始訂單品項 {ret.original_order_item_id}')
      if payload.original_order_id is not None and original_item.order_id != payload.original_order_id:
        raise HTTPException(status_code=400, detail='退回品項不屬於指定的原始訂單')
      if original_item.product_id != ret.product_id:
        raise HTTPException(status_code=400, detail='退回商品與原始品項不符')

      already_returned = abs(int(self.session.exec(
        select(func.coalesce(func.sum(OrderItem.quantity), 0))
        .where(
          OrderItem.original_order_item_id == ret.original_order_item_id,
          OrderItem.is_return == True,  # noqa: E712
        )
      ).scalar_one()))
      refundable = original_item.quantity - already_returned
      if ret.quantity > refundable:
        raise HTTPException(
          status_code=400,
          detail=f'{product.name} 可退數量為 {refundable}，不足退 {ret.quantity} 件'
        )

      unit_price = round_currency(ret.refund_unit_price)
      unit_cost = round_currency(product.cost)
      subtotal = round_currency(unit_price * ret.quantity)
      cost_subtotal = round_currency(unit_cost * ret.quantity)

      # Restore stock atomically
      apply_stock_delta(self.session, product, ret.quantity)

      # Return order item (negative quantity for reporting clarity)
      self.session.add(OrderItem(
        order_id=order.id,
        product_id=product.id,
        quantity=-ret.quantity,
        unit_price=unit_price,
        unit_cost=unit_cost,
        subtotal=-subtotal,
        cost_subtotal=-cost_subtotal,
        custom_reason='換貨退回',
        is_return=True,
        original_order_item_id=ret.original_order_item_id,
      ))

      # Exchange-return stock entry (distinguishable from regular stock-in)
      self.session.add(StockEntry(
        product_id=product.id,
        product_name=product.name,
        sku=product.sku,
        barcode=product.barcode,
        vendor_name=None,
        quantity=ret.quantity,
        method=StockEntryMethod.EXCHANGE_RETURN,
      ))

      refund_total += subtotal
      return_cost_total += cost_subtotal

    # ── Process purchase items (B) ──────────────────────────────────────────
    purchase_gross = 0.0
    purchase_cost = 0.0
    discountable_total = 0.0

    for item in payload.purchase_items:
      product = self.session.get(Product, item.product_id)
      if not product:
        raise HTTPException(status_code=404, detail=f'找不到商品 {item.product_id}')

      unit_price = round_currency(product.price)
      custom_reason = None
      if item.custom_price is not None:
        if item.custom_price < 0:
          raise HTTPException(status_code=400, detail='自訂售價必須大於等於 0')
        unit_price = round_currency(item.custom_price)
        custom_reason = item.custom_reason or '調整售價'

      unit_cost = round_currency(product.cost)
      subtotal = round_currency(unit_price * item.quantity)
      cost_subtotal = round_currency(unit_cost * item.quantity)

      if not custom_reason:
        discountable_total += subtotal

      deduct_stock(self.session, product, item.quantity)

      self.session.add(OrderItem(
        order_id=order.id,
        product_id=product.id,
        quantity=item.quantity,
        unit_price=unit_price,
        unit_cost=unit_cost,
        subtotal=subtotal,
        cost_subtotal=cost_subtotal,
        custom_reason=custom_reason,
        is_return=False,
      ))
      purchase_gross += subtotal
      purchase_cost += cost_subtotal

    # ── Discounts on B ─────────────────────────────────────────────────────
    (
      member_discount_amount,
      birthday_discount_amount,
      member_discount_applied,
      birthday_discount_applied,
    ) = calculate_discounts(
      member, purchase_gross, self.session, now, discountable_total=discountable_total
    )

    manual_discount_amount = 0.0
    if manual_discount_rate:
      manual_discount_amount = round_currency(discountable_total * manual_discount_rate)
      member_discount_applied = False
      birthday_discount_applied = False

    purchase_discount = min(
      round_currency(member_discount_amount + birthday_discount_amount + manual_discount_amount),
      discountable_total,
    )
    purchase_net = max(purchase_gross - purchase_discount, 0)
    if payload.round_down_to_ten:
      purchase_net -= purchase_net % 10

    net_payable = round_currency(purchase_net - refund_total)
    cost_total = round_currency(purchase_cost - return_cost_total)
    profit_total = round_currency(net_payable - cost_total)

    # ── Persist order totals ────────────────────────────────────────────────
    order.exchange_refund_total = round_currency(refund_total)
    order.gross_total = round_currency(purchase_gross)
    order.discount_total = purchase_discount
    order.discount = purchase_discount
    order.total_price = net_payable
    order.cost_total = cost_total
    order.profit_total = profit_total
    order.member_discount_applied = member_discount_applied
    order.birthday_discount_applied = birthday_discount_applied
    order.manual_discount_rate = manual_discount_rate or 0
    self.session.add(order)
    self.session.commit()
    self.session.refresh(order)

    member_summary = None
    if member:
      birthday_available = birthday_discount_available(self.session, member, now)
      from ..schemas import PosMemberSummary
      member_summary = PosMemberSummary(
        id=member.id,
        member_code=member.member_code or '',
        name=member.name,
        phone=member.phone,
        birthday=member.birthday,
        is_birthday_month=is_birthday_month(member, now),
        birthday_discount_available=birthday_available,
      )

    return ExchangeCheckoutResponse(
      order_id=order.id,
      is_exchange=True,
      original_order_id=order.original_order_id,
      refund_total=round_currency(refund_total),
      purchase_gross=round_currency(purchase_gross),
      purchase_discount=purchase_discount,
      purchase_net=round_currency(purchase_net),
      net_payable=net_payable,
      cost_total=cost_total,
      profit_total=profit_total,
      payment_method=order.payment_method,
      discounts=PosCheckoutDiscounts(
        member_discount=member_discount_amount,
        birthday_discount=birthday_discount_amount,
        manual_discount=manual_discount_amount,
        member_discount_applied=member_discount_applied,
        birthday_discount_applied=birthday_discount_applied,
      ),
      member=member_summary,
      created_at=order.created_at,
    )
