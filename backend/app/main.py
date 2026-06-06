from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .database import init_db
from .routers import admin, analytics, auth, members, orders, pos, products, reservations, stock_entries, users, vendors

settings = get_settings()


def create_app() -> FastAPI:
  app = FastAPI(title=settings.app_name)

  app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_origin_regex=settings.cors_origin_regex,
    allow_methods=['*'],
    allow_headers=['*'],
    allow_credentials=True,
  )

  app.include_router(admin.router, prefix=settings.api_prefix)
  app.include_router(auth.router, prefix=settings.api_prefix)
  app.include_router(users.router, prefix=settings.api_prefix)
  app.include_router(vendors.router, prefix=settings.api_prefix)
  app.include_router(products.router, prefix=settings.api_prefix)
  app.include_router(stock_entries.router, prefix=settings.api_prefix)
  app.include_router(members.router, prefix=settings.api_prefix)
  app.include_router(orders.router, prefix=settings.api_prefix)
  app.include_router(reservations.router, prefix=settings.api_prefix)
  app.include_router(pos.router, prefix=settings.api_prefix)
  app.include_router(analytics.router, prefix=settings.api_prefix)

  @app.get('/health')
  def health_check():
    return {'status': 'ok'}

  @app.on_event('startup')
  def on_startup():
    init_db()

  return app


app = create_app()
