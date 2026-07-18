from __future__ import annotations

from fastapi import HTTPException
from sqlalchemy import update
from sqlmodel import Session

from ..models import Product
from .time_utils import utc8_now


def deduct_stock(session: Session, product: Product, quantity: int) -> None:
  """Atomically deduct stock, guarding against oversell under concurrency.

  Uses a DB-side conditional UPDATE (stock = stock - q WHERE stock >= q).
  The row lock held until commit blocks concurrent deductions on the same
  product, so two simultaneous checkouts can never both pass the guard.
  """
  if quantity <= 0:
    return
  now = utc8_now()
  result = session.execute(
    update(Product)
    .where(Product.id == product.id, Product.stock >= quantity)
    .values(stock=Product.stock - quantity, updated_at=now)
    .execution_options(synchronize_session=False)
  )
  if result.rowcount == 0:
    raise HTTPException(status_code=400, detail=f'{product.name} 庫存不足')
  # Keep the in-memory ORM object consistent with the DB so the ORM's own
  # flush at commit re-writes the same (correct) values, not stale ones.
  product.stock -= quantity
  product.updated_at = now


def apply_stock_delta(session: Session, product: Product, delta: int) -> None:
  """Atomically apply a signed stock change (restore / reversal).

  DB-side increment avoids lost updates when concurrent adjustments run.
  Used when restoring stock on cancel/edit — delta may be negative when
  reversing an exchange-return line (which carries negative quantity).
  """
  if delta == 0:
    return
  now = utc8_now()
  session.execute(
    update(Product)
    .where(Product.id == product.id)
    .values(stock=Product.stock + delta, updated_at=now)
    .execution_options(synchronize_session=False)
  )
  product.stock += delta
  product.updated_at = now
