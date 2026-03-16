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
  quantity: int
  gross_total: float
  discount_total: float
  cost_total: float


def _period_expr(group_by: GroupBy):
  if group_by == 'week':
    # Week number based on Monday start; formatted as YYYY-WW for readability.
    return func.strftime('%Y-W%W', Order.created_at)
  return func.strftime('%Y-%m-%d', Order.created_at)


def fetch_sales_buckets(
  session: Session,
  start: datetime,
  end: datetime,
  group_by: GroupBy
) -> list[SalesBucketRow]:
  period = _period_expr(group_by)

  statement = (
    select(
      period.label('period_key'),
      func.count(func.distinct(Order.id)).label('orders_count'),
      func.coalesce(func.sum(Order.gross_total), 0).label('gross_total'),
      func.coalesce(func.sum(Order.discount_total), 0).label('discount_total'),
      func.coalesce(func.sum(Order.total_price), 0).label('net_total'),
      func.coalesce(func.sum(Order.cost_total), 0).label('cost_total'),
      func.coalesce(func.sum(Order.profit_total), 0).label('profit_total'),
      func.coalesce(func.sum(OrderItem.quantity), 0).label('quantity')
    )
    .select_from(Order)
    .join(OrderItem, OrderItem.order_id == Order.id, isouter=True)
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
  limit: int = 20
) -> list[ProductAggregateRow]:
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

  statement = (
    select(
      Product.id,
      Product.sku,
      Product.name,
      Product.barcode,
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
    .group_by(Product.id)
    .order_by(func.sum(OrderItem.subtotal).desc())
    .limit(limit)
  )

  rows = session.exec(statement).all()
  return [
    {
      'product_id': int(product_id),
      'sku': sku,
      'name': name,
      'barcode': barcode,
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
      quantity,
      gross_total,
      discount_total,
      cost_total
    ) in rows
  ]
