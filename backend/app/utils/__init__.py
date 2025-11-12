from __future__ import annotations

import re

from .pos_logic import (
  birthday_discount_available,
  calculate_discounts,
  is_birthday_month,
  normalize_phone,
  round_currency,
)
from .time_utils import utc8_now, utc8_today

__all__ = [
  'generate_barcode',
  'calculate_gross_margin',
  'calculate_discounts',
  'birthday_discount_available',
  'is_birthday_month',
  'normalize_phone',
  'round_currency',
  'utc8_now',
  'utc8_today',
]


def _sanitize_component(value: str | None) -> str:
  if not value:
    return ''
  return re.sub(r'[^A-Za-z0-9]', '', value.upper())


def generate_barcode(
  vendor_id: int | None,
  sku: str,
  cost: float,
  color: str | None,
  size: str | None
) -> str:
  vendor_part = str(vendor_id or 0)
  sku_part = _sanitize_component(sku)
  cost_part = str(int(cost))
  color_part = _sanitize_component(color)
  size_part = _sanitize_component(size)
  if size_part == 'FREE':
    size_part = 'F'
  return ''.join(part for part in [vendor_part, sku_part, cost_part, color_part, size_part] if part)


def calculate_gross_margin(price: float, cost: float) -> tuple[float, float]:
  gross = max(price - cost, 0)
  percent = (gross / price * 100) if price else 0
  return round(gross, 2), round(percent, 2)
