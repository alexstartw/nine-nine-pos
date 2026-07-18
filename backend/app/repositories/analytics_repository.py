from __future__ import annotations

from datetime import datetime
from typing import Literal, TypedDict

from sqlalchemy import case, func, select
from sqlmodel import Session

from ..models import Order, OrderItem, PaymentMethod, Product

GroupBy = Literal['day', 'week']


class SalesBucketRow(TypedDict):
  period_key: str
  orders_count: int
  gross_total: float
  discount_total: float
  net_total: float
  cost_total: float
  profit_total: float
  quantity: int


class PaymentBreakdownRow(TypedDict):
  method: str
  orders_count: int
  net_total: float


class ProductAggregateRow(TypedDict):
  product_id: int
  sku: str
  name: str
  barcode: str
  color: str | None
  size: str | None
  quantity: int
  gross_total: float
  discount_total: float
  cost_total: float


class ProductVariantRow(TypedDict):
  product_id: int
  sku: str
  name: str
  barcode: str
  color: str | None
  size: str | None
  quantity: int
  gross_total: float
  discount_total: float
  cost_total: float


def _period_expr(group_by: GroupBy):
  from ..config import get_settings
  is_sqlite = get_settings().database_url.startswith('sqlite')

  if is_sqlite:
    if group_by == 'week':
      return func.strftime('%Y-W%W', Order.created_at)
    return func.strftime('%Y-%m-%d', Order.created_at)
  else:
    if group_by == 'week':
      return func.to_char(Order.created_at, 'IYYY-"W"IW')
    return func.to_char(Order.created_at, 'YYYY-MM-DD')


def fetch_sales_buckets(
  session: Session,
  start: datetime,
  end: datetime,
  group_by: GroupBy
) -> list[SalesBucketRow]:
  period = _period_expr(group_by)

  # Pre-aggregate item quantities per order to avoid fan-out when joining.
  # Without this, an order with N items would cause order-level totals
  # (gross_total, etc.) to be summed N times each.
  qty_subq = (
    select(
      OrderItem.order_id,
      func.sum(OrderItem.quantity).label('total_qty')
    )
    .group_by(OrderItem.order_id)
  ).subquery()

  statement = (
    select(
      period.label('period_key'),
      func.count(Order.id).label('orders_count'),
      func.coalesce(func.sum(Order.gross_total), 0).label('gross_total'),
      func.coalesce(func.sum(Order.discount_total), 0).label('discount_total'),
      func.coalesce(func.sum(Order.total_price), 0).label('net_total'),
      func.coalesce(func.sum(Order.cost_total), 0).label('cost_total'),
      func.coalesce(func.sum(Order.profit_total), 0).label('profit_total'),
      func.coalesce(func.sum(qty_subq.c.total_qty), 0).label('quantity')
    )
    .select_from(Order)
    .outerjoin(qty_subq, qty_subq.c.order_id == Order.id)
    .where(
      Order.created_at >= start,
      Order.created_at < end,
      Order.is_cancelled == False  # noqa: E712
    )
    .group_by(period)
    .order_by(period)
  )

  rows = session.exec(statement).all()
  return [
    {
      'period_key': period_key,
      'orders_count': int(orders_count or 0),
      'gross_total': float(gross_total or 0),
      'discount_total': float(discount_total or 0),
      'net_total': float(net_total or 0),
      'cost_total': float(cost_total or 0),
      'profit_total': float(profit_total or 0),
      'quantity': int(quantity or 0)
    }
    for (
      period_key,
      orders_count,
      gross_total,
      discount_total,
      net_total,
      cost_total,
      profit_total,
      quantity
    ) in rows
  ]


def fetch_payment_breakdown(
  session: Session,
  start: datetime,
  end: datetime
) -> list[PaymentBreakdownRow]:
  statement = (
    select(
      Order.payment_method,
      func.count(Order.id),
      func.coalesce(func.sum(Order.total_price), 0)
    )
    .where(
      Order.created_at >= start,
      Order.created_at < end,
      Order.is_cancelled == False  # noqa: E712
    )
    .group_by(Order.payment_method)
  )

  rows = session.exec(statement).all()
  results: list[PaymentBreakdownRow] = []
  for method, count, net_total in rows:
    key = method.value if isinstance(method, PaymentMethod) else str(method)
    results.append({
      'method': key,
      'orders_count': int(count or 0),
      'net_total': float(net_total or 0)
    })
  return results


def fetch_top_products(
  session: Session,
  start: datetime,
  end: datetime,
  limit: int = 20,
  merge_variants: bool = False
) -> list[ProductAggregateRow]:
  """Top-selling products, ranked by quantity.

  merge_variants=False (預設)：以單一商品記錄 (product_id) 為粒度，回傳 color/size，
    同款不同顏色/尺寸會各自成列。
  merge_variants=True：以 (sku, name) 匯總，合併同款所有變體；color/size 回傳 None。
  """
  discount_share = func.coalesce(
    func.sum(
      case(
        (Order.gross_total != 0,
         OrderItem.subtotal * Order.discount_total / Order.gross_total),
        else_=0
      )
    ),
    0
  ).label('discount_total')

  if merge_variants:
    group_cols = [Product.sku, Product.name]
    selected = [
      func.min(Product.id).label('product_id'),
      Product.sku,
      Product.name,
      func.min(Product.barcode).label('barcode'),
    ]
    has_variant_cols = False
  else:
    group_cols = [Product.id]
    selected = [
      Product.id,
      Product.sku,
      Product.name,
      Product.barcode,
      Product.color,
      Product.size,
    ]
    has_variant_cols = True

  statement = (
    select(
      *selected,
      func.coalesce(func.sum(OrderItem.quantity), 0).label('quantity'),
      func.coalesce(func.sum(OrderItem.subtotal), 0).label('gross_total'),
      discount_share,
      func.coalesce(func.sum(OrderItem.cost_subtotal), 0).label('cost_total')
    )
    .join(OrderItem, OrderItem.product_id == Product.id)
    .join(Order, Order.id == OrderItem.order_id)
    .where(
      Order.created_at >= start,
      Order.created_at < end,
      Order.is_cancelled == False  # noqa: E712
    )
    .group_by(*group_cols)
    .order_by(func.sum(OrderItem.quantity).desc())
    .limit(limit)
  )

  result: list[ProductAggregateRow] = []
  for row in session.exec(statement).all():
    if has_variant_cols:
      (product_id, sku, name, barcode, color, size,
       quantity, gross_total, discount_total, cost_total) = row
    else:
      (product_id, sku, name, barcode,
       quantity, gross_total, discount_total, cost_total) = row
      color = size = None
    result.append({
      'product_id': int(product_id),
      'sku': sku,
      'name': name,
      'barcode': barcode,
      'color': color,
      'size': size,
      'quantity': int(quantity or 0),
      'gross_total': float(gross_total or 0),
      'discount_total': float(discount_total or 0),
      'cost_total': float(cost_total or 0)
    })
  return result


def fetch_product_stats(
  session: Session,
  start: datetime,
  end: datetime,
  q: str | None = None,
  limit: int = 20,
  offset: int = 0
) -> tuple[list[ProductVariantRow], int]:
  """Return per-variant (product × color × size) sales stats with pagination."""

  discount_share = func.coalesce(
    func.sum(
      case(
        (Order.gross_total != 0,
         OrderItem.subtotal * Order.discount_total / Order.gross_total),
        else_=0
      )
    ),
    0
  ).label('discount_total')

  base_filters = [
    Order.created_at >= start,
    Order.created_at < end,
    Order.is_cancelled == False  # noqa: E712
  ]
  if q:
    keyword = f'%{q.strip()}%'
    base_filters.append(
      Product.name.ilike(keyword) | Product.sku.ilike(keyword)
    )

  agg_stmt = (
    select(
      Product.id,
      Product.sku,
      Product.name,
      Product.barcode,
      Product.color,
      Product.size,
      func.coalesce(func.sum(OrderItem.quantity), 0).label('quantity'),
      func.coalesce(func.sum(OrderItem.subtotal), 0).label('gross_total'),
      discount_share,
      func.coalesce(func.sum(OrderItem.cost_subtotal), 0).label('cost_total')
    )
    .join(OrderItem, OrderItem.product_id == Product.id)
    .join(Order, Order.id == OrderItem.order_id)
    .where(*base_filters)
    .group_by(Product.id, Product.color, Product.size)
  )

  # Count total distinct variants
  count_stmt = select(func.count()).select_from(agg_stmt.subquery())
  total = session.exec(count_stmt).scalar_one()

  rows = session.exec(
    agg_stmt.order_by(func.sum(OrderItem.subtotal).desc()).offset(offset).limit(limit)
  ).all()

  return [
    {
      'product_id': int(product_id),
      'sku': sku,
      'name': name,
      'barcode': barcode,
      'color': color,
      'size': size,
      'quantity': int(quantity or 0),
      'gross_total': float(gross_total or 0),
      'discount_total': float(discount_total or 0),
      'cost_total': float(cost_total or 0)
    }
    for (
      product_id,
      sku,
      name,
      barcode,
      color,
      size,
      quantity,
      gross_total,
      discount_total,
      cost_total
    ) in rows
  ], int(total)
