"""登入與 token 安全性：限流不可用偽造 header 繞過、token 每次回 DB 確認帳號。"""
from __future__ import annotations

import pytest
from sqlmodel import Session, select

from app.models import User, UserRole
from tests.helpers import ADMIN, ADMIN_USERNAME, STAFF, STAFF_USERNAME, TEST_PASSWORD, bearer

pytestmark = pytest.mark.anyio('asyncio')


# ── 3. 登入限流不能用偽造 X-Forwarded-For 繞過 ─────────────────────────────────

async def _bad_login(client, username='admin_user', xff=None):
  headers = {'X-Forwarded-For': xff} if xff else {}
  return await client.post(
    '/api/auth/login', json={'username': username, 'password': 'wrong'}, headers=headers
  )


async def test_login_lockout_ignores_spoofed_forwarded_for(secure_client):
  client, _ = secure_client
  for i in range(5):
    resp = await _bad_login(client, xff=f'10.0.0.{i}')
    assert resp.status_code == 401
  # 第 6 次即使換了 X-Forwarded-For 仍被鎖
  assert (await _bad_login(client, xff='10.9.9.9')).status_code == 429


async def test_login_lockout_is_per_username(secure_client):
  client, _ = secure_client
  for _ in range(5):
    await _bad_login(client, username=ADMIN_USERNAME)
  assert (await _bad_login(client, username=ADMIN_USERNAME)).status_code == 429
  # 同一 IP 的其他帳號不受影響
  ok = await client.post('/api/auth/login', json={'username': STAFF_USERNAME, 'password': TEST_PASSWORD})
  assert ok.status_code == 200


# ── 4. token 每次請求回 DB 確認帳號 ────────────────────────────────────────────

async def test_deactivated_user_token_rejected_immediately(secure_client):
  client, engine = secure_client
  assert (await client.get('/api/members', headers=STAFF)).status_code == 200

  with Session(engine) as session:
    user = session.exec(select(User).where(User.username == STAFF_USERNAME)).one()
    user.is_active = False
    session.add(user)
    session.commit()

  assert (await client.get('/api/members', headers=STAFF)).status_code == 401


async def test_demoted_admin_loses_admin_access(secure_client):
  client, engine = secure_client
  assert (await client.get('/api/orders', headers=ADMIN)).status_code == 200

  with Session(engine) as session:
    user = session.exec(select(User).where(User.username == ADMIN_USERNAME)).one()
    user.role = UserRole.STAFF
    session.add(user)
    session.commit()

  # 舊 token 的 payload 仍寫著 admin，但以 DB 角色為準
  assert (await client.get('/api/orders', headers=ADMIN)).status_code == 403


async def test_token_for_unknown_user_rejected(secure_client):
  client, _ = secure_client
  forged = bearer('ghost', 'admin')  # 簽章正確但帳號不存在
  assert (await client.get('/api/orders', headers=forged)).status_code == 401
