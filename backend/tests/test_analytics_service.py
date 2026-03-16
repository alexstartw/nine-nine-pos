from __future__ import annotations

from datetime import date, datetime, timedelta

import pytest
from sqlmodel import Session, SQLModel, create_engine

from app.models import Order, OrderItem, PaymentMethod, Product
from app.services.analytics_service import get_sales_analytics


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
    is_cancelled=False,
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


def test_sales_analytics_weekly_defaults(session: Session):
  p1 = _create_product(session, 'SKU-1')
  monday = date(2026, 1, 26)
  wednesday = monday + timedelta(days=2)

  _create_order(session, datetime.combine(monday, datetime.min.time()), PaymentMethod.CASH, [(p1, 2, 200, 120)], discount_total=20)
  _create_order(session, datetime.combine(wednesday, datetime.min.time()), PaymentMethod.TRANSFER, [(p1, 1, 150, 90)], discount_total=0)

  result = get_sales_analytics(
    session=session,
    start_date=monday,
    end_date=wednesday,
    group_by='week',
    top_limit=5
  )

  assert result.group_by == 'week'
  assert result.timezone == 'UTC+8'
  assert len(result.timeseries) == 1
  bucket = result.timeseries[0]
  assert bucket.period_label.startswith(monday.isoformat())
  assert result.summary.orders_count == 2
  assert result.summary.discount_total == 20


def test_sales_analytics_top_products_profit(session: Session):
  p1 = _create_product(session, 'SKU-1')
  created_at = datetime(2026, 1, 28)
  _create_order(session, created_at, PaymentMethod.CASH, [(p1, 1, 500, 200)], discount_total=50)

  result = get_sales_analytics(
    session=session,
    start_date=created_at.date() - timedelta(days=1),
    end_date=created_at.date(),
    group_by='day',
    top_limit=3
  )

  top = result.top_products[0]
  assert top.net_total == 450
  assert top.profit_total == 250
