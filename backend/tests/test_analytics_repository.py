from __future__ import annotations

from datetime import datetime, timedelta

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.models import Order, OrderItem, PaymentMethod, Product
from app.repositories.analytics_repository import (
  fetch_payment_breakdown,
  fetch_sales_buckets,
  fetch_top_products
)


@pytest.fixture()
def session() -> Session:
  engine = create_engine('sqlite://', connect_args={'check_same_thread': False})
  SQLModel.metadata.create_all(engine)
  with Session(engine) as session:
    yield session


def _create_product(session: Session, sku: str, name: str = 'Item', price: int = 100, cost: int = 50) -> Product:
  product = Product(
    name=name,
    sku=sku,
    barcode=f'BC-{sku}',
    price=price,
    cost=cost,
    stock=10,
    first_stocked_at=datetime(2026, 1, 1),
    data_updated_at=datetime(2026, 1, 1),
    last_stocked_at=datetime(2026, 1, 1)
  )
  session.add(product)
  session.commit()
  session.refresh(product)
  return product


def _create_order(
  session: Session,
  created_at: datetime,
  payment_method: PaymentMethod,
  items: list[tuple[Product, int, int, int]],
  discount_total: int = 0,
  is_cancelled: bool = False
) -> Order:
  gross_total = sum(price * qty for _, qty, price, _ in items)
  cost_total = sum(cost * qty for _, qty, _, cost in items)
  net_total = gross_total - discount_total
  order = Order(
    member_id=None,
    payment_method=payment_method,
    gross_total=gross_total,
    discount_total=discount_total,
    discount=discount_total,
    total_price=net_total,
    cost_total=cost_total,
    profit_total=net_total - cost_total,
    created_at=created_at,
    updated_at=created_at,
    is_cancelled=is_cancelled,
  )
  session.add(order)
  session.flush()

  for product, qty, unit_price, unit_cost in items:
    session.add(OrderItem(
      order_id=order.id,
      product_id=product.id,
      quantity=qty,
      unit_price=unit_price,
      unit_cost=unit_cost,
      subtotal=unit_price * qty,
      cost_subtotal=unit_cost * qty,
      custom_reason=None
    ))

  session.commit()
  session.refresh(order)
  return order


def test_fetch_sales_buckets_weekly(session: Session):
  p1 = _create_product(session, 'SKU-1')
  week1 = datetime(2026, 1, 27)
  week2 = datetime(2026, 2, 3)

  _create_order(session, week1, PaymentMethod.CASH, [(p1, 2, 150, 80)], discount_total=10)
  _create_order(session, week2, PaymentMethod.MOBILE, [(p1, 1, 200, 100)], discount_total=0)

  start = week1 - timedelta(days=2)
  end = week2 + timedelta(days=2)

  rows = fetch_sales_buckets(session, start, end, group_by='week')
  keys = {row['period_key'] for row in rows}

  assert '2026-W04' in keys
  assert '2026-W05' in keys
  assert sum(row['orders_count'] for row in rows) == 2
  assert sum(row['discount_total'] for row in rows) == 10


def test_top_products_allocate_discount(session: Session):
  p1 = _create_product(session, 'SKU-1')
  p2 = _create_product(session, 'SKU-2')
  created_at = datetime(2026, 1, 28)

  _create_order(
    session,
    created_at,
    PaymentMethod.CASH,
    items=[
      (p1, 2, 300, 120),  # subtotal 600
      (p2, 1, 400, 160)   # subtotal 400
    ],
    discount_total=100
  )

  rows = fetch_top_products(session, created_at - timedelta(days=1), created_at + timedelta(days=1))
  by_sku = {row['sku']: row for row in rows}

  assert pytest.approx(by_sku['SKU-1']['discount_total'], rel=1e-3) == 60  # 60% of discount
  assert pytest.approx(by_sku['SKU-2']['discount_total'], rel=1e-3) == 40  # 40% of discount
  assert by_sku['SKU-1']['quantity'] == 2


def test_payment_breakdown_net_total(session: Session):
  p1 = _create_product(session, 'SKU-1')
  created_at = datetime(2026, 1, 25)
  _create_order(session, created_at, PaymentMethod.TRANSFER, [(p1, 1, 500, 200)], discount_total=50)

  rows = fetch_payment_breakdown(session, created_at - timedelta(days=1), created_at + timedelta(days=1))
  assert rows == [{'method': 'transfer', 'orders_count': 1, 'net_total': 450.0}]
