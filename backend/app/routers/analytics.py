from __future__ import annotations

from datetime import date
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlmodel import Session

from ..database import get_session
from ..schemas import SalesAnalyticsResponse
from ..services.analytics_service import get_sales_analytics

router = APIRouter(prefix='/analytics', tags=['analytics'])


@router.get('/sales', response_model=SalesAnalyticsResponse)
def sales_analytics(
  start_date: date | None = Query(default=None, description='起始日期（含）'),
  end_date: date | None = Query(default=None, description='結束日期（含）'),
  group_by: Literal['day', 'week'] = Query(default='week', description='聚合粒度'),
  top_limit: int = Query(default=10, ge=1, le=50, description='Top 商品數'),
  session: Session = Depends(get_session)
):
  try:
    return get_sales_analytics(
      session=session,
      start_date=start_date,
      end_date=end_date,
      group_by=group_by,
      top_limit=top_limit
    )
  except ValueError as exc:
    raise HTTPException(status_code=400, detail=str(exc))
