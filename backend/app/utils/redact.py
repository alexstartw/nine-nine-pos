"""依角色遮蔽回應中的成本 / 毛利欄位。

前端雖然對工讀生隱藏這些欄位，但 API 仍會回傳；這裡在後端把它們設為 None，
避免工讀生直接呼叫 API 取得成本資訊。
"""
from __future__ import annotations

from typing import Iterable, TypeVar

from pydantic import BaseModel

from ..auth import is_admin

M = TypeVar('M', bound=BaseModel)

# 各回應模型中工讀生不可見的欄位
PRODUCT_COST_FIELDS = ('cost', 'gross_margin', 'gross_margin_percentage')
SUMMARY_COST_FIELDS = ('total_stock_value',)
POS_PRODUCT_COST_FIELDS = ('cost',)
ORDER_COST_FIELDS = ('cost_total', 'profit_total')


def redact(model: M, user: dict, fields: Iterable[str]) -> M:
  """管理員原樣回傳；其他角色把指定欄位設為 None。"""
  if is_admin(user):
    return model
  return model.model_copy(update={f: None for f in fields})


def redact_many(models: list[M], user: dict, fields: Iterable[str]) -> list[M]:
  fields = tuple(fields)
  return [redact(m, user, fields) for m in models]
