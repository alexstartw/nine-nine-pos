"""工讀生權限：商品寫入限管理員、成本 / 毛利欄位對工讀生遮蔽。"""
from __future__ import annotations

import pytest
from sqlmodel import Session

from app.models import Product
from tests.helpers import ADMIN, STAFF

pytestmark = pytest.mark.anyio('asyncio')


def _product(engine, stock: int = 5) -> int:
  with Session(engine) as session:
    product = Product(name='Tee', sku='SKU1', barcode='BC1', price=500, cost=200, stock=stock)
    session.add(product)
    session.commit()
    return product.id


# ── 1. 商品寫入限管理員 ─────────────────────────────────────────────────────────

async def test_staff_cannot_write_products(secure_client):
  client, engine = secure_client
  pid = _product(engine)
  body = {'name': 'X', 'sku': 'S', 'price': 1, 'cost': 1, 'stock': 1}
  files = {'file': ('a.xlsx', b'not-really-excel', 'application/octet-stream')}

  assert (await client.post('/api/products', json=body, headers=STAFF)).status_code == 403
  assert (await client.put(f'/api/products/{pid}', json={'price': 1}, headers=STAFF)).status_code == 403
  assert (await client.delete(f'/api/products/{pid}', headers=STAFF)).status_code == 403
  assert (await client.get(f'/api/products/{pid}/history', headers=STAFF)).status_code == 403
  assert (await client.post('/api/products/import', files=files, headers=STAFF)).status_code == 403
  assert (await client.post('/api/products/import-legacy', files=files, headers=STAFF)).status_code == 403


async def test_admin_can_write_products(secure_client):
  client, engine = secure_client
  pid = _product(engine)
  assert (await client.put(f'/api/products/{pid}', json={'price': 600}, headers=ADMIN)).status_code == 200
  assert (await client.get(f'/api/products/{pid}/history', headers=ADMIN)).status_code == 200


# ── 1. 成本 / 毛利對工讀生遮蔽 ─────────────────────────────────────────────────

async def test_product_cost_hidden_from_staff(secure_client):
  client, engine = secure_client
  pid = _product(engine)

  staff_list = (await client.get('/api/products', headers=STAFF)).json()['data'][0]
  admin_list = (await client.get('/api/products', headers=ADMIN)).json()['data'][0]
  assert staff_list['cost'] is None and staff_list['gross_margin'] is None
  assert staff_list['price'] == 500
  assert admin_list['cost'] == 200

  assert (await client.get(f'/api/products/{pid}', headers=STAFF)).json()['cost'] is None
  assert (await client.get(f'/api/products/{pid}', headers=ADMIN)).json()['cost'] == 200

  staff_summary = (await client.get('/api/products/summary', headers=STAFF)).json()
  assert staff_summary['total_stock_value'] is None and staff_summary['total_stock'] == 5
  assert (await client.get('/api/products/summary', headers=ADMIN)).json()['total_stock_value'] == 1000

  assert (await client.get('/api/pos/products/BC1', headers=STAFF)).json()['cost'] is None
  assert (await client.get('/api/pos/products/BC1', headers=ADMIN)).json()['cost'] == 200


async def test_checkout_and_daily_summary_cost_hidden_from_staff(secure_client):
  client, engine = secure_client
  pid = _product(engine)
  payload = {'items': [{'product_id': pid, 'quantity': 1}]}

  staff_receipt = (await client.post('/api/pos/checkout', json=payload, headers=STAFF)).json()
  admin_receipt = (await client.post('/api/pos/checkout', json=payload, headers=ADMIN)).json()
  assert staff_receipt['cost_total'] is None and staff_receipt['profit_total'] is None
  assert staff_receipt['total_price'] == 500
  assert admin_receipt['cost_total'] == 200 and admin_receipt['profit_total'] == 300

  staff_daily = (await client.get('/api/pos/summary/daily', headers=STAFF)).json()
  admin_daily = (await client.get('/api/pos/summary/daily', headers=ADMIN)).json()
  assert staff_daily['cost_total'] is None and staff_daily['orders_count'] == 2
  assert admin_daily['cost_total'] == 400
