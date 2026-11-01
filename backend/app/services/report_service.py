"""Inventory and member reports for the analytics page.

All amounts follow the same rules as the sales overview:
- cancelled orders are excluded;
- an order's net amount is ``Order.total_price``;
- inventory is valued at the product's current cost.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlmodel import Session

from ..models import Member, Order, OrderItem, Product, Vendor
from ..schemas import (
  InventoryLowStockRow,
  InventoryReportResponse,
  InventoryStaleRow,
  InventorySummary,
  InventoryVendorRow,
  MemberReportResponse,
  MemberReportSummary,
  MemberTopRow,
)
from ..utils.time_utils import normalize_range_to_utc8, utc8_now

UNASSIGNED_VENDOR = '未指定'


def _last_sold_map(session: Session) -> dict[int, datetime]:
  """product_id → time of its most recent sale (non-cancelled, not a return line)."""
  statement = (
    select(OrderItem.product_id, func.max(Order.created_at))
    .join(Order, Order.id == OrderItem.order_id)
    .where(
      Order.is_cancelled == False,  # noqa: E712
      OrderItem.is_return == False,  # noqa: E712
    )
    .group_by(OrderItem.product_id)
  )
  return {int(pid): ts for pid, ts in session.exec(statement).all() if ts is not None}


def _sold_qty_since(session: Session, since: datetime) -> dict[int, int]:
  statement = (
    select(OrderItem.product_id, func.sum(OrderItem.quantity))
    .join(Order, Order.id == OrderItem.order_id)
    .where(
      Order.created_at >= since,
      Order.is_cancelled == False,  # noqa: E712
      OrderItem.is_return == False,  # noqa: E712
    )
    .group_by(OrderItem.product_id)
  )
  return {int(pid): int(qty or 0) for pid, qty in session.exec(statement).all()}


def get_inventory_report(
  session: Session,
  stale_days: int = 90,
  low_stock_max: int = 1,
  recent_days: int = 28,
  min_sold_recent: int = 2,
  limit: int = 200,
) -> InventoryReportResponse:
  now = utc8_now()
  stale_cutoff = now - timedelta(days=stale_days)
  recent_since = now - timedelta(days=recent_days)

  vendor_names = {v.id: v.name for v in session.exec(select(Vendor)).scalars().all()}
  products = session.exec(select(Product)).scalars().all()
  last_sold = _last_sold_map(session)
  recent_qty = _sold_qty_since(session, recent_since)

  in_stock = [p for p in products if (p.stock or 0) > 0]

  stale_rows: list[InventoryStaleRow] = []
  for p in in_stock:
    sold_at = last_sold.get(p.id)
    reference = sold_at or p.first_stocked_at or p.created_at
    if reference is None or reference >= stale_cutoff:
      continue
    stale_rows.append(InventoryStaleRow(
      product_id=p.id,
      sku=p.sku,
      name=p.name,
      color=p.color,
      size=p.size,
      vendor_name=vendor_names.get(p.vendor_id, UNASSIGNED_VENDOR),
      stock=p.stock,
      cost_value=float(p.stock * (p.cost or 0)),
      first_stocked_at=p.first_stocked_at,
      last_sold_at=sold_at,
      idle_days=max(0, (now - reference).days),
    ))
  stale_rows.sort(key=lambda r: (-r.idle_days, -r.cost_value))

  low_rows: list[InventoryLowStockRow] = []
  for p in products:
    qty = recent_qty.get(p.id, 0)
    if (p.stock or 0) <= low_stock_max and qty >= max(1, min_sold_recent):
      low_rows.append(InventoryLowStockRow(
        product_id=p.id,
        sku=p.sku,
        name=p.name,
        color=p.color,
        size=p.size,
        vendor_name=vendor_names.get(p.vendor_id, UNASSIGNED_VENDOR),
        stock=p.stock or 0,
        sold_recent=qty,
        last_sold_at=last_sold.get(p.id),
      ))
  low_rows.sort(key=lambda r: (r.stock, -r.sold_recent))

  by_vendor: dict[str, InventoryVendorRow] = {}
  for p in in_stock:
    name = vendor_names.get(p.vendor_id, UNASSIGNED_VENDOR)
    row = by_vendor.setdefault(
      name, InventoryVendorRow(vendor_name=name, items=0, units=0, cost_value=0)
    )
    row.items += 1
    row.units += p.stock
    row.cost_value += float(p.stock * (p.cost or 0))
  vendor_rows = sorted(by_vendor.values(), key=lambda r: -r.cost_value)

  summary = InventorySummary(
    items_in_stock=len(in_stock),
    units_in_stock=sum(p.stock for p in in_stock),
    cost_value=sum(float(p.stock * (p.cost or 0)) for p in in_stock),
    stale_items=len(stale_rows),
    stale_cost_value=sum(r.cost_value for r in stale_rows),
    low_stock_items=len(low_rows),
  )

  return InventoryReportResponse(
    stale_days=stale_days,
    low_stock_max=low_stock_max,
    recent_days=recent_days,
    min_sold_recent=max(1, min_sold_recent),
    summary=summary,
    stale=stale_rows[:limit],
    low_stock=low_rows[:limit],
    by_vendor=vendor_rows,
  )


def _member_join_date(member: Member) -> date | None:
  if member.joined_date:
    return member.joined_date
  return member.created_at.date() if member.created_at else None


def get_member_report(
  session: Session,
  start_date: date | None = None,
  end_date: date | None = None,
  limit: int = 20,
) -> MemberReportResponse:
  start_dt, end_dt = normalize_range_to_utc8(start_date, end_date, default_days=28)

  order_filters = (
    Order.created_at >= start_dt,
    Order.created_at < end_dt,
    Order.is_cancelled == False,  # noqa: E712
  )

  total_orders, total_net = session.exec(
    select(func.count(Order.id), func.coalesce(func.sum(Order.total_price), 0))
    .where(*order_filters)
  ).one()

  member_rows = session.exec(
    select(
      Order.member_id,
      func.count(Order.id),
      func.coalesce(func.sum(Order.total_price), 0),
      func.max(Order.created_at),
    )
    .where(*order_filters, Order.member_id.is_not(None))
    .group_by(Order.member_id)
  ).all()

  member_orders = sum(int(r[1] or 0) for r in member_rows)
  member_net = sum(float(r[2] or 0) for r in member_rows)

  members = {m.id: m for m in session.exec(select(Member)).scalars().all()}
  range_start, range_end = start_dt.date(), (end_dt - timedelta(days=1)).date()
  new_members = sum(
    1 for m in members.values()
    if (joined := _member_join_date(m)) is not None and range_start <= joined <= range_end
  )

  ranked = sorted(member_rows, key=lambda r: -float(r[2] or 0))[:limit]
  top = []
  for member_id, orders_count, net, last_at in ranked:
    member = members.get(member_id)
    if member is None:
      continue
    top.append(MemberTopRow(
      member_id=member.id,
      member_code=member.member_code,
      name=member.name,
      phone=member.phone,
      orders_count=int(orders_count or 0),
      net_total=float(net or 0),
      last_order_at=last_at,
    ))

  total_net = float(total_net or 0)
  summary = MemberReportSummary(
    total_orders=int(total_orders or 0),
    total_net=total_net,
    member_orders=member_orders,
    member_net=member_net,
    member_share=(member_net / total_net) if total_net else 0.0,
    active_members=len(member_rows),
    new_members=new_members,
  )

  return MemberReportResponse(
    start_date=range_start,
    end_date=range_end,
    summary=summary,
    top_members=top,
  )
