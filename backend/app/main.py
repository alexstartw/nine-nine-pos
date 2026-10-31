from __future__ import annotations

import traceback

from fastapi import FastAPI, Request
from fastapi.exceptions import HTTPException as FastAPIHTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .config import get_settings
from .database import init_db
from .logging_config import get_logger, setup_logging
from .routers import admin, analytics, auth, members, orders, pos, products, reservations, stock_entries, users, vendors

settings = get_settings()
logger = get_logger('nine_nine_pos')

MAX_APP_LOGS = 2000


def _write_app_log(
  *,
  level: str,
  message: str,
  path: str,
  method: str,
  tb: str | None = None,
) -> None:
  """Write one row to AppLog, then trim the table to MAX_APP_LOGS rows."""
  try:
    from sqlalchemy import delete, func
    from sqlmodel import Session, select
    from .database import engine
    from .models import AppLog
    with Session(engine) as db_session:
      db_session.add(AppLog(level=level, message=message, path=path, method=method, traceback=tb))
      db_session.commit()
      total = db_session.exec(select(func.count(AppLog.id))).one()
      if total > MAX_APP_LOGS:
        cutoff = db_session.exec(
          select(AppLog.id).order_by(AppLog.id.desc()).offset(MAX_APP_LOGS).limit(1)
        ).first()
        if cutoff is not None:
          db_session.execute(delete(AppLog).where(AppLog.id <= cutoff))
          db_session.commit()
  except Exception:
    pass  # log write failure must never break the response


def create_app() -> FastAPI:
  setup_logging()

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

  @app.exception_handler(FastAPIHTTPException)
  async def http_exception_handler(request: Request, exc: FastAPIHTTPException) -> JSONResponse:
    level = 'ERROR' if exc.status_code >= 500 else 'WARNING'
    if exc.status_code >= 500:
      logger.error('HTTP %s: %s %s — %s', exc.status_code, request.method, request.url.path, exc.detail)
    else:
      logger.warning('HTTP %s: %s %s — %s', exc.status_code, request.method, request.url.path, exc.detail)
    _write_app_log(level=level, message=str(exc.detail), path=str(request.url.path), method=request.method)
    return JSONResponse(status_code=exc.status_code, content={'detail': exc.detail})

  @app.exception_handler(Exception)
  async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    tb = traceback.format_exc()
    logger.error('Unhandled exception: %s %s\n%s', request.method, request.url, tb)
    _write_app_log(level='ERROR', message=str(exc), path=str(request.url.path), method=request.method, tb=tb)
    return JSONResponse(status_code=500, content={'detail': '伺服器內部錯誤，已記錄至日誌'})

  @app.get('/health')
  def health_check():
    return {'status': 'ok'}

  @app.on_event('startup')
  def on_startup():
    init_db()

  return app


app = create_app()
