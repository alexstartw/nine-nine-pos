"""Reports: month grouping, inventory / member reports and Excel exports."""
from __future__ import annotations

from datetime import date, datetime, timedelta
from io import BytesIO

import httpx
import pytest
from openpyxl import load_workbook
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import create_app
from app.models import Member, Order, OrderItem, PaymentMethod, Product, Vendor
from app.utils.time_utils import utc8_now
from tests.helpers import ADMIN, STAFF, seed_users

pytestmark = pytest.mark.anyio('asyncio')


@pytest.fixture
def anyio_backend():
  return 'asyncio'


@pytest.fixture()
async def client_and_engine():
  engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
  SQLModel.metadata.create_all(engine)
  seed_users(engine)
  app = create_app()

  def override_get_session():
    with Session(engine) as session:
      yield session

  app.dependency_overrides[get_session] = override_get_session
  transport = httpx.ASGITransport(app=app)
  async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as client:
    yield client, engine


def _product(session: Session, name: str, stock: int, cost: float, stocked_at: datetime, vendor_id=None) -> Product:
  product = Product(
    name=name, sku=f'{name}.0', barcode=f'BC-{name}', price=cost * 2, cost=cost, stock=stock,
    vendor_id=vendor_id, first_stocked_at=stocked_at, created_at=stocked_at,
  )
  session.add(product)
  session.flush()
  return product


def _sale(session: Session, product: Product, qty: int, at: datetime, member_id=None, cancelled=False) -> Order:
  gross = product.price * qty
  order = Order(
    payment_method=PaymentMethod.CASH, gross_total=gross, discount_total=0, total_price=gross,
    cost_total=product.cost * qty, profit_total=gross - product.cost * qty,
    created_at=at, is_cancelled=cancelled, member_id=member_id,
  )
  session.add(order)
  session.flush()
  session.add(OrderItem(
    order_id=order.id, product_id=product.id, quantity=qty, unit_price=product.price,
    unit_cost=product.cost, subtotal=gross, cost_subtotal=product.cost * qty,
  ))
  return order


def _seed(engine):
  now = utc8_now()
  with Session(engine) as session:
    vendor = Vendor(name='Alpha')
    session.add(vendor)
    session.flush()
    # Never sold, stocked 200 days ago → stale for 90 / 180 days.
    _product(session, 'old', stock=2, cost=100, stocked_at=now - timedelta(days=200), vendor_id=vendor.id)
    # Last sold 100 days ago → stale for 90 but not for 180.
    mid = _product(session, 'mid', stock=1, cost=50, stocked_at=now - timedelta(days=150))
    _sale(session, mid, 1, now - timedelta(days=100))
    # Selling well, almost sold out → low stock.
    hot = _product(session, 'hot', stock=1, cost=200, stocked_at=now - timedelta(days=20), vendor_id=vendor.id)
    member = Member(name='Amy', phone='0912345678', member_code='MEM1', joined_date=now.date())
    session.add(member)
    session.flush()
    _sale(session, hot, 2, now - timedelta(days=2), member_id=member.id)
    _sale(session, hot, 1, now - timedelta(days=1))
    # Cancelled orders never count.
    _sale(session, hot, 5, now - timedelta(days=1), member_id=member.id, cancelled=True)
    session.commit()


async def test_month_grouping(client_and_engine):
  client, engine = client_and_engine
  _seed(engine)
  today = utc8_now().date()
  res = await client.get('/api/analytics/sales', headers=ADMIN, params={
    'start_date': (today - timedelta(days=120)).isoformat(), 'end_date': today.isoformat(), 'group_by': 'month',
  })
  assert res.status_code == 200
  body = res.json()
  assert body['group_by'] == 'month'
  assert all(b['period_label'].endswith('(月)') for b in body['timeseries'])
  assert all(b['period_start'].endswith('-01') for b in body['timeseries'])


async def test_inventory_report(client_and_engine):
  client, engine = client_and_engine
  _seed(engine)

  res = await client.get('/api/analytics/inventory', headers=ADMIN, params={'stale_days': 90})
  assert res.status_code == 200
  body = res.json()
  assert [r['name'] for r in body['stale']] == ['old', 'mid']  # longest idle first
  assert body['stale'][0]['last_sold_at'] is None
  assert body['summary']['stale_cost_value'] == 2 * 100 + 1 * 50
  assert [r['name'] for r in body['low_stock']] == ['hot']
  assert body['low_stock'][0]['sold_recent'] == 3  # cancelled order excluded
  vendors = {r['vendor_name']: r for r in body['by_vendor']}
  assert vendors['Alpha']['units'] == 3 and vendors['未指定']['units'] == 1

  res = await client.get('/api/analytics/inventory', headers=ADMIN, params={'stale_days': 180})
  assert [r['name'] for r in res.json()['stale']] == ['old']


async def test_member_report(client_and_engine):
  client, engine = client_and_engine
  _seed(engine)
  today = utc8_now().date()
  res = await client.get('/api/analytics/members', headers=ADMIN, params={
    'start_date': (today - timedelta(days=27)).isoformat(), 'end_date': today.isoformat(),
  })
  assert res.status_code == 200
  s = res.json()['summary']
  assert s['total_orders'] == 2 and s['member_orders'] == 1
  assert s['member_share'] == pytest.approx(800 / 1200)
  assert s['new_members'] == 1 and s['active_members'] == 1
  top = res.json()['top_members']
  assert top[0]['name'] == 'Amy' and top[0]['orders_count'] == 1


@pytest.mark.parametrize('path,sheets', [
  ('/api/analytics/export/sales', ['摘要', '走勢', '付款方式', '熱銷商品']),
  ('/api/analytics/export/products', ['單品銷量']),
  ('/api/analytics/export/orders', ['訂單', '明細']),
  ('/api/analytics/export/inventory', ['摘要', '滯銷商品', '低庫存', '依廠商']),
  ('/api/analytics/export/members', ['摘要', '會員消費排行']),
])
async def test_exports_are_valid_xlsx(client_and_engine, path, sheets):
  client, engine = client_and_engine
  _seed(engine)
  res = await client.get(path, headers=ADMIN)
  assert res.status_code == 200
  assert res.headers['content-type'].startswith('application/vnd.openxmlformats')
  assert 'attachment' in res.headers['content-disposition']
  wb = load_workbook(BytesIO(res.content))
  assert wb.sheetnames == sheets


async def test_order_export_lists_cancelled_with_status(client_and_engine):
  client, engine = client_and_engine
  _seed(engine)
  res = await client.get('/api/analytics/export/orders', headers=ADMIN)
  ws = load_workbook(BytesIO(res.content))['訂單']
  statuses = [row[2] for row in ws.iter_rows(min_row=2, values_only=True)]
  assert statuses.count('已取消') == 1 and statuses.count('完成') == 2


async def test_inventory_export_cleans_sku(client_and_engine):
  client, engine = client_and_engine
  _seed(engine)
  res = await client.get('/api/analytics/export/inventory', headers=ADMIN)
  ws = load_workbook(BytesIO(res.content))['滯銷商品']
  assert ws['A2'].value == 'old'  # "old.0" → "old"


@pytest.mark.parametrize('path', [
  '/api/analytics/inventory', '/api/analytics/members', '/api/analytics/export/orders',
])
async def test_reports_are_admin_only(client_and_engine, path):
  client, _ = client_and_engine
  assert (await client.get(path, headers=STAFF)).status_code == 403
  assert (await client.get(path)).status_code == 401
