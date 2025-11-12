#!/usr/bin/env python3
"""Recalculate product barcodes based on the updated generation logic."""
from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from sqlmodel import Session, select  # noqa: E402

from backend.app.database import engine  # noqa: E402
from backend.app.models import Product  # noqa: E402
from backend.app.utils import generate_barcode  # noqa: E402


def main() -> None:
  updated = 0
  with Session(engine) as session:
    products = session.exec(select(Product)).all()
    for product in products:
      new_barcode = generate_barcode(
        product.vendor_id,
        product.sku,
        product.cost,
        product.color,
        product.size,
      )
      if product.barcode != new_barcode:
        product.barcode = new_barcode
        session.add(product)
        updated += 1
    session.commit()
  print(f'Recalculated barcodes for {updated} products')


if __name__ == '__main__':
  main()
