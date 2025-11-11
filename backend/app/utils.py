from __future__ import annotations

import re


def _sanitize_component(value: str | None, length: int, fill: str = 'X') -> str:
  if not value:
    return fill * length
  alnum = re.sub(r'[^A-Za-z0-9]', '', value.upper())
  padded = (alnum + (fill * length))[:length]
  return padded


def generate_barcode(vendor_id: int | None, sku: str, cost: float, color: str | None, size: str | None) -> str:
  vendor_part = str(vendor_id or 0).zfill(4)
  sku_part = _sanitize_component(sku, 6, '0')
  cost_part = str(int(cost * 100)).zfill(6)
  color_part = _sanitize_component(color, 3, 'C')
  size_part = _sanitize_component(size, 3, 'S')
  return f'{vendor_part}{sku_part}{cost_part}{color_part}{size_part}'


def calculate_gross_margin(price: float, cost: float) -> tuple[float, float]:
  gross = max(price - cost, 0)
  percent = (gross / price * 100) if price else 0
  return round(gross, 2), round(percent, 2)
