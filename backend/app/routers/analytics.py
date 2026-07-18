from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from ..auth import require_admin
from ..database import get_session
from ..repositories.analytics_repository import fetch_product_stats
from ..schemas import ProductSalesRow, ProductSalesStatsResponse, SalesAnalyticsResponse
from ..services.analytics_service import get_sales_analytics
from ..utils.time_utils import normalize_range_to_utc8

router = APIRouter(prefix='/analytics', tags=['analytics'], dependencies=[Depends(require_admin)])


@router.get('/sales', response_model=SalesAnalyticsResponse)
def sales_analytics(
  start_date: date | None = Query(default=None, description='起始日期（含）'),
  end_date: date | None = Query(default=None, description='結束日期（含）'),
  group_by: Literal['day', 'week'] = Query(default='week', description='聚合粒度'),
  top_limit: int = Query(default=10, ge=1, le=50, description='Top 商品數'),
  merge_variants: bool = Query(default=False, description='Top SKU 是否合併同款變體（顏色/尺寸）'),
  session: Session = Depends(get_session)
):
  try:
    return get_sales_analytics(
      session=session,
      start_date=start_date,
      end_date=end_date,
      group_by=group_by,
      top_limit=top_limit,
      merge_variants=merge_variants
    )
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc))


@router.get('/products', response_model=ProductSalesStatsResponse)
def product_sales_stats(
  start_date: date | None = Query(default=None, description='起始日期（含），不填則查全部歷史'),
  end_date: date | None = Query(default=None, description='結束日期（含），不填則查至今'),
  q: str | None = Query(default=None, description='搜尋商品名稱 / SKU'),
  page: int = Query(default=1, ge=1),
  size: int = Query(default=20, ge=1, le=100),
  session: Session = Depends(get_session)
):
  if start_date is None and end_date is None:
    # 無日期限制 → 全部歷史
    start_dt = datetime(2000, 1, 1)
    end_dt = datetime(2100, 1, 1)
  else:
    start_dt, end_dt = normalize_range_to_utc8(start_date, end_date, default_days=28)
  offset = (page - 1) * size
  rows, total = fetch_product_stats(session, start_dt, end_dt, q=q, limit=size, offset=offset)
  data = [
    ProductSalesRow(
      product_id=row['product_id'],
      sku=row['sku'],
      name=row['name'],
      barcode=row['barcode'],
      color=row['color'],
      size=row['size'],
      quantity=row['quantity'],
      gross_total=row['gross_total'],
      discount_total=row['discount_total'],
      net_total=row['gross_total'] - row['discount_total'],
      cost_total=row['cost_total'],
      profit_total=row['gross_total'] - row['discount_total'] - row['cost_total']
    )
    for row in rows
  ]
  return ProductSalesStatsResponse(data=data, total=total, page=page, size=size)
