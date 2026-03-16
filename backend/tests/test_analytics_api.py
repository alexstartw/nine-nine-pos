from __future__ import annotations

from datetime import datetime, timedelta

import pytest
import httpx
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import create_app
from app.models import Order, OrderItem, PaymentMethod, Product

pytestmark = pytest.mark.anyio('asyncio')

@pytest.fixture
def anyio_backend():
  return 'asyncio'


@pytest.fixture()
async def client_and_engine():
  test_engine = create_engine(
    'sqlite://',
    connect_args={'check_same_thread': False},
    poolclass=StaticPool
  )
  SQLModel.metadata.create_all(test_engine)

  app = create_app()

  def override_get_session():
    with Session(test_engine) as session:
      yield session

  app.dependency_overrides[get_session] = override_get_session
  transport = httpx.ASGITransport(app=app)
  async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as client:
    yield client, test_engine


def _seed_sale(engine, created_at: datetime):
  with Session(engine) as session:
    product = Product(
      name='Test Product',
      sku='SKU-API',
      barcode='BC-API',
      price=300,
      cost=150,
      stock=5,
      first_stocked_at=created_at,
      data_updated_at=created_at,
      last_stocked_at=created_at,
    )
    session.add(product)
    session.commit()
    session.refresh(product)

    gross_total = 300
    discount_total = 30
    cost_total = 150
    order = Order(
      payment_method=PaymentMethod.CASH,
      gross_total=gross_total,
      discount_total=discount_total,
      discount=discount_total,
      total_price=gross_total - discount_total,
      cost_total=cost_total,
      profit_total=gross_total - discount_total - cost_total,
      created_at=created_at,
      updated_at=created_at,
      is_cancelled=False
    )
    session.add(order)
    session.flush()

    session.add(OrderItem(
      order_id=order.id,
      product_id=product.id,
      quantity=1,
      unit_price=300,
      unit_cost=150,
      subtotal=300,
      cost_subtotal=150,
      custom_reason=None
    ))
    session.commit()


async def test_sales_analytics_endpoint_returns_weekly(client_and_engine):
  client, engine = client_and_engine
  target_date = datetime(2026, 1, 27)
  _seed_sale(engine, target_date)

  response = await client.get('/api/analytics/sales', params={'group_by': 'week'})
  assert response.status_code == 200
  payload = response.json()

  assert payload['group_by'] == 'week'
  assert payload['summary']['orders_count'] == 1
  assert payload['summary']['net_total'] == 270
  assert payload['timeseries'][0]['gross_total'] == 300
  assert payload['top_products'][0]['sku'] == 'SKU-API'
