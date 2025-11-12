#!/usr/bin/env python3
"""
移除所有商品資料與其相關入庫紀錄的輔助腳本。

使用方式：
  python scripts/clear_products.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from sqlalchemy import delete, func, select
from sqlmodel import Session

ROOT_DIR = Path(__file__).resolve().parents[1]
BACKEND_DIR = ROOT_DIR / 'backend'
sys.path.append(str(BACKEND_DIR))

from app.database import engine  # type: ignore  # noqa: E402
from app.models import Product, StockEntry  # type: ignore  # noqa: E402


def main() -> None:
  with Session(engine) as session:
    product_total = session.exec(select(func.count()).select_from(Product)).scalar_one()
    entry_total = session.exec(select(func.count()).select_from(StockEntry)).scalar_one()

    if product_total == 0:
      print('沒有商品資料需要清理。')
      return

    prompt = f'將刪除 {product_total} 筆商品與 {entry_total} 筆入庫紀錄，確定要繼續嗎？ [y/N]: '
    if input(prompt).strip().lower() != 'y':
      print('已取消。')
      return

    session.exec(delete(StockEntry))
    session.exec(delete(Product))
    session.commit()
    print(f'刪除完成：{product_total} 筆商品、{entry_total} 筆入庫紀錄。')


if __name__ == '__main__':
  main()
