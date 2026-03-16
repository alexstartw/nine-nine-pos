from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Literal

from sqlmodel import Session

from ..repositories.analytics_repository import (
  GroupBy,
  fetch_payment_breakdown,
  fetch_sales_buckets,
  fetch_top_products
)
from ..schemas import (
  SalesAnalyticsResponse,
  SalesBucket,
  SalesPaymentBreakdownItem,
  SalesProductPerformance,
  SalesSummary
)
from ..utils.time_utils import normalize_range_to_utc8, utc8_week_start

DEFAULT_GROUP_BY: GroupBy = 'week'


def _period_start_from_key(period_key: str, group_by: GroupBy) -> date:
  if group_by == 'day':
    return datetime.strptime(period_key, '%Y-%m-%d').date()

  # period_key example: 2026-W05
  try:
    year, week_str = period_key.split('-W')
    week = max(1, int(week_str))
    base_year = int(year)
    jan1 = date(base_year, 1, 1)
    # First Monday of the year (can be Jan 1 if already Monday)
    first_monday = jan1 + timedelta(days=(7 - jan1.weekday()) % 7)
    if week == 0:
      return first_monday - timedelta(days=7)
    return first_monday + timedelta(weeks=week - 1)
  except Exception:
    # Fallback: derive from current week start to avoid crashing the API.
    return utc8_week_start()


def get_sales_analytics(
  session: Session,
  start_date: date | None = None,
  end_date: date | None = None,
  group_by: Literal['day', 'week'] = DEFAULT_GROUP_BY,
  top_limit: int = 10
) -> SalesAnalyticsResponse:
  if group_by not in ('day', 'week'):
    raise ValueError('group_by must be "day" or "week"')
  safe_limit = max(1, min(top_limit, 50))

  start_dt, end_dt = normalize_range_to_utc8(start_date, end_date, default_days=28)

  buckets = fetch_sales_buckets(session, start_dt, end_dt, group_by)
  payment_rows = fetch_payment_breakdown(session, start_dt, end_dt)
  top_products_rows = fetch_top_products(session, start_dt, end_dt, limit=safe_limit)

  timeseries: list[SalesBucket] = []
  for row in buckets:
    period_start = _period_start_from_key(row['period_key'], group_by)
    label = (
      f"{period_start.isoformat()} (週)" if group_by == 'week'
      else period_start.isoformat()
    )
    timeseries.append(SalesBucket(
      period_start=period_start,
      period_label=label,
      orders_count=row['orders_count'],
      gross_total=row['gross_total'],
      discount_total=row['discount_total'],
      net_total=row['net_total'],
      cost_total=row['cost_total'],
      profit_total=row['profit_total'],
      quantity=row['quantity']
    ))

  summary = SalesSummary(
    orders_count=sum(item.orders_count for item in timeseries),
    gross_total=sum(item.gross_total for item in timeseries),
    discount_total=sum(item.discount_total for item in timeseries),
    net_total=sum(item.net_total for item in timeseries),
    cost_total=sum(item.cost_total for item in timeseries),
    profit_total=sum(item.profit_total for item in timeseries),
    quantity=sum(item.quantity for item in timeseries)
  )

  payment_breakdown = [
    SalesPaymentBreakdownItem(
      method=row['method'],
      orders_count=row['orders_count'],
      net_total=row['net_total']
    )
    for row in payment_rows
  ]

  top_products = [
    SalesProductPerformance(
      product_id=row['product_id'],
      sku=row['sku'],
      name=row['name'],
      barcode=row['barcode'],
      quantity=row['quantity'],
      gross_total=row['gross_total'],
      discount_total=row['discount_total'],
      net_total=row['gross_total'] - row['discount_total'],
      cost_total=row['cost_total'],
      profit_total=row['gross_total'] - row['discount_total'] - row['cost_total']
    )
    for row in top_products_rows
  ]

  return SalesAnalyticsResponse(
    group_by=group_by,
    timezone='UTC+8',
    start_date=start_dt.date(),
    end_date=(end_dt - timedelta(days=1)).date(),
    summary=summary,
    payment_breakdown=payment_breakdown,
    timeseries=timeseries,
    top_products=top_products
  )
