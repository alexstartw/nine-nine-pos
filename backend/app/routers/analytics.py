from __future__ import annotations

from datetime import date, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from sqlmodel import Session

from ..auth import require_admin
from ..database import get_session
from ..repositories.analytics_repository import fetch_product_stats
from ..schemas import (
  InventoryReportResponse,
  MemberReportResponse,
  ProductSalesRow,
  ProductSalesStatsResponse,
  SalesAnalyticsResponse,
)
from ..services import export_service
from ..services.report_service import get_inventory_report, get_member_report
from ..services.analytics_service import get_sales_analytics
from ..utils.time_utils import normalize_range_to_utc8

router = APIRouter(prefix='/analytics', tags=['analytics'], dependencies=[Depends(require_admin)])


@router.get('/sales', response_model=SalesAnalyticsResponse)
def sales_analytics(
  start_date: date | None = Query(default=None, description='起始日期（含）'),
  end_date: date | None = Query(default=None, description='結束日期（含）'),
  group_by: Literal['day', 'week', 'month'] = Query(default='week', description='聚合粒度'),
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


@router.get('/inventory', response_model=InventoryReportResponse)
def inventory_report(
  stale_days: int = Query(default=90, ge=1, le=3650, description='超過幾天未售出視為滯銷'),
  low_stock_max: int = Query(default=1, ge=0, le=100, description='庫存小於等於此數量視為低庫存'),
  recent_days: int = Query(default=28, ge=1, le=365, description='低庫存需在最近幾天內有賣出'),
  min_sold_recent: int = Query(default=2, ge=1, le=100, description='最近幾天內至少賣出幾件才列入低庫存'),
  session: Session = Depends(get_session)
):
  return get_inventory_report(
    session,
    stale_days=stale_days,
    low_stock_max=low_stock_max,
    recent_days=recent_days,
    min_sold_recent=min_sold_recent,
  )


@router.get('/members', response_model=MemberReportResponse)
def member_report(
  start_date: date | None = Query(default=None),
  end_date: date | None = Query(default=None),
  limit: int = Query(default=20, ge=1, le=100),
  session: Session = Depends(get_session)
):
  return get_member_report(session, start_date, end_date, limit=limit)


# ── Excel exports ──────────────────────────────────────────────────────────

XLSX_MEDIA_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'


def _xlsx(content: bytes, filename: str) -> Response:
  return Response(
    content=content,
    media_type=XLSX_MEDIA_TYPE,
    headers={'Content-Disposition': f'attachment; filename="{filename}"'},
  )


@router.get('/export/sales')
def export_sales(
  start_date: date | None = Query(default=None),
  end_date: date | None = Query(default=None),
  group_by: Literal['day', 'week', 'month'] = Query(default='week'),
  merge_variants: bool = Query(default=False),
  session: Session = Depends(get_session)
):
  content = export_service.build_sales_workbook(session, start_date, end_date, group_by, merge_variants)
  return _xlsx(content, export_service.export_filename('sales', start_date, end_date))


@router.get('/export/products')
def export_product_sales(
  start_date: date | None = Query(default=None),
  end_date: date | None = Query(default=None),
  q: str | None = Query(default=None),
  session: Session = Depends(get_session)
):
  content = export_service.build_product_sales_workbook(session, start_date, end_date, q)
  return _xlsx(content, export_service.export_filename('product-sales', start_date, end_date))


@router.get('/export/orders')
def export_orders(
  start_date: date | None = Query(default=None),
  end_date: date | None = Query(default=None),
  session: Session = Depends(get_session)
):
  content = export_service.build_orders_workbook(session, start_date, end_date)
  return _xlsx(content, export_service.export_filename('orders', start_date, end_date))


@router.get('/export/inventory')
def export_inventory(
  stale_days: int = Query(default=90, ge=1, le=3650),
  session: Session = Depends(get_session)
):
  content = export_service.build_inventory_workbook(session, stale_days)
  return _xlsx(content, export_service.export_filename('inventory'))


@router.get('/export/members')
def export_members(
  start_date: date | None = Query(default=None),
  end_date: date | None = Query(default=None),
  session: Session = Depends(get_session)
):
  content = export_service.build_members_workbook(session, start_date, end_date)
  return _xlsx(content, export_service.export_filename('members', start_date, end_date))
