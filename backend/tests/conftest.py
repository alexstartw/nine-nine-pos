"""共用 fixture：含權限檢查的 API client（每個測試一個全新的 in-memory DB）。"""
from __future__ import annotations

import httpx
import pytest
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from app.database import get_session
from app.main import create_app
from app.utils.rate_limit import login_rate_limiter
from tests.helpers import seed_users


@pytest.fixture
def anyio_backend():
  return 'asyncio'


@pytest.fixture()
async def secure_client():
  """回傳 (client, engine)；DB 已建立 staff_user / admin_user，登入限流狀態已清空。"""
  engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
  SQLModel.metadata.create_all(engine)
  seed_users(engine)
  login_rate_limiter._attempts.clear()
  login_rate_limiter._locked_until.clear()

  app = create_app()

  def override_get_session():
    with Session(engine) as session:
      yield session

  app.dependency_overrides[get_session] = override_get_session
  transport = httpx.ASGITransport(app=app)
  async with httpx.AsyncClient(transport=transport, base_url='http://testserver') as client:
    yield client, engine
