from __future__ import annotations

from datetime import date

import httpx
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import create_app
from app.models import Member, Order

pytestmark = pytest.mark.anyio('asyncio')

from tests.helpers import ADMIN, STAFF, seed_users


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


def _seed(engine) -> int:
  with Session(engine) as session:
    big = Member(name='Big', member_code='M1', birthday=date(1990, 8, 8))
    small = Member(name='Small', member_code='M2', birthday=date(1990, 8, 1))
    other = Member(name='Other', member_code='M3', birthday=date(1990, 9, 1))
    session.add_all([big, small, other])
    session.commit()
    session.add_all([
      Order(member_id=big.id, total_price=1000),
      Order(member_id=small.id, total_price=10),
    ])
    session.commit()
    return small.id


async def test_members_requires_auth(client_and_engine):
  client, _ = client_and_engine
  resp = await client.get('/api/members')
  assert resp.status_code == 401


async def test_pos_and_products_require_auth(client_and_engine):
  client, _ = client_and_engine
  assert (await client.get('/api/products')).status_code == 401
  assert (await client.get('/api/pos/members/search', params={'q': 'x'})).status_code == 401


async def test_list_members_sorted_by_total_spent_with_birthday_month(client_and_engine):
  client, engine = client_and_engine
  _seed(engine)

  resp = await client.get(
    '/api/members',
    params={'sort': 'total_spent', 'sort_dir': 'desc', 'birthday_month': 8},
    headers=STAFF,
  )

  assert resp.status_code == 200
  body = resp.json()
  assert body['total'] == 2
  assert [m['name'] for m in body['data']] == ['Big', 'Small']
  assert body['data'][0]['total_spent'] == 1000


@pytest.mark.parametrize('params', [
  {'birthday_month': 0},
  {'birthday_month': 13},
  {'sort': 'drop table'},
  {'sort_dir': 'sideways'},
])
async def test_invalid_list_params_rejected(client_and_engine, params):
  client, _ = client_and_engine
  resp = await client.get('/api/members', params=params, headers=STAFF)
  assert resp.status_code == 422


async def test_delete_member_is_admin_only(client_and_engine):
  client, engine = client_and_engine
  member_id = _seed(engine)

  assert (await client.delete(f'/api/members/{member_id}', headers=STAFF)).status_code == 403
  assert (await client.delete(f'/api/members/{member_id}', headers=ADMIN)).status_code == 204
