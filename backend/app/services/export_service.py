"""Excel (.xlsx) exports for the analytics page.

Each builder returns the workbook as bytes. Sheets share one look: bold header
row on a light background, frozen header, money / integer number formats and
column widths sized to the content.
"""
from __future__ import annotations

import re
from datetime import date, datetime, timedelta
from io import BytesIO
from typing import Any, Iterable, Sequence

from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter
from sqlalchemy import select
from sqlmodel import Session

from ..models import Member, Order, OrderItem, PaymentMethod, Product
from ..repositories.analytics_repository import fetch_product_stats
from ..utils.time_utils import normalize_range_to_utc8
from .analytics_service import get_sales_analytics
from .report_service import get_inventory_report, get_member_report

MONEY = '#,##0'
INT = '#,##0'
PERCENT = '0.0%'
DATETIME = 'yyyy/mm/dd hh:mm'
DATE = 'yyyy/mm/dd'

PAYMENT_LABELS = {'cash': '現金', 'transfer': '轉帳', 'mobile': '行動支付'}
HEADER_FILL = PatternFill('solid', fgColor='F6F0E4')

Column = tuple[str, str | None]  # (header, number_format)


def payment_label(method: Any) -> str:
  key = method.value if isinstance(method, PaymentMethod) else str(method or '')
  return PAYMENT_LABELS.get(key, key)


def _add_sheet(wb: Workbook, title: str, columns: Sequence[Column], rows: Iterable[Sequence[Any]]):
  ws = wb.create_sheet(title)
  ws.append([header for header, _ in columns])
  for cell in ws[1]:
    cell.font = Font(bold=True)
    cell.fill = HEADER_FILL
    cell.alignment = Alignment(vertical='center')
  widths = [max(8, len(header) * 2 + 2) for header, _ in columns]
  for row in rows:
    ws.append(list(row))
    for idx, value in enumerate(row):
      if value is None:
        continue
      text = value.strftime('%Y/%m/%d %H:%M') if isinstance(value, datetime) else str(value)
      # CJK characters are roughly twice as wide as latin ones.
      length = sum(2 if ord(ch) > 0x2E80 else 1 for ch in text)
      widths[idx] = min(60, max(widths[idx], length + 2))
  for idx, (_, fmt) in enumerate(columns, start=1):
    letter = get_column_letter(idx)
    ws.column_dimensions[letter].width = widths[idx - 1]
    if fmt:
      for cell in ws[letter][1:]:
        cell.number_format = fmt
  ws.freeze_panes = 'A2'
  return ws


def _summary_sheet(wb: Workbook, title: str, pairs: Sequence[tuple[str, Any, str | None]]):
  ws = wb.create_sheet(title)
  for label, value, fmt in pairs:
    ws.append([label, value])
    ws.cell(row=ws.max_row, column=1).font = Font(bold=True)
    if fmt:
      ws.cell(row=ws.max_row, column=2).number_format = fmt
  ws.column_dimensions['A'].width = 22
  ws.column_dimensions['B'].width = 24
  return ws


def _to_bytes(wb: Workbook) -> bytes:
  if 'Sheet' in wb.sheetnames and len(wb.sheetnames) > 1:
    del wb['Sheet']
  buffer = BytesIO()
  wb.save(buffer)
  return buffer.getvalue()


def _sku(value: str | None) -> str:
  """Same display cleanup as the frontend: drop a spurious trailing ".0"."""
  return re.sub(r'\.0+$', '', value or '')


def _variant(color: str | None, size: str | None) -> str:
  return ' / '.join(part for part in (color, size) if part) or ''


# ── Builders ────────────────────────────────────────────────────────────────

def build_sales_workbook(
  session: Session,
  start_date: date | None,
  end_date: date | None,
  group_by: str,
  merge_variants: bool = False,
) -> bytes:
  data = get_sales_analytics(
    session=session,
    start_date=start_date,
    end_date=end_date,
    group_by=group_by,  # type: ignore[arg-type]
    top_limit=50,
    merge_variants=merge_variants,
  )
  s = data.summary
  wb = Workbook()
  _summary_sheet(wb, '摘要', [
    ('期間', f'{data.start_date:%Y/%m/%d} – {data.end_date:%Y/%m/%d}', None),
    ('營收 (NET)', s.net_total, MONEY),
    ('毛額', s.gross_total, MONEY),
    ('折扣', s.discount_total, MONEY),
    ('成本', s.cost_total, MONEY),
    ('毛利', s.profit_total, MONEY),
    ('訂單數', s.orders_count, INT),
    ('件數', s.quantity, INT),
    ('平均客單', (s.net_total / s.orders_count) if s.orders_count else 0, MONEY),
  ])
  _add_sheet(
    wb, '走勢',
    [('期間', None), ('訂單數', INT), ('件數', INT), ('毛額', MONEY), ('折扣', MONEY),
     ('淨額', MONEY), ('成本', MONEY), ('毛利', MONEY)],
    [(b.period_label, b.orders_count, b.quantity, b.gross_total, b.discount_total,
      b.net_total, b.cost_total, b.profit_total) for b in data.timeseries],
  )
  _add_sheet(
    wb, '付款方式',
    [('付款方式', None), ('訂單數', INT), ('淨額', MONEY)],
    [(payment_label(p.method), p.orders_count, p.net_total) for p in data.payment_breakdown],
  )
  _add_sheet(
    wb, '熱銷商品',
    [('SKU', None), ('名稱', None), ('顏色 / 尺寸', None), ('數量', INT), ('營收', MONEY),
     ('折扣', MONEY), ('淨額', MONEY), ('毛利', MONEY)],
    [(_sku(p.sku), p.name, _variant(p.color, p.size), p.quantity, p.gross_total,
      p.discount_total, p.net_total, p.profit_total) for p in data.top_products],
  )
  return _to_bytes(wb)


def build_product_sales_workbook(
  session: Session,
  start_date: date | None,
  end_date: date | None,
  q: str | None,
) -> bytes:
  if start_date is None and end_date is None:
    start_dt, end_dt = datetime(2000, 1, 1), datetime(2100, 1, 1)
  else:
    start_dt, end_dt = normalize_range_to_utc8(start_date, end_date, default_days=28)
  rows, _ = fetch_product_stats(session, start_dt, end_dt, q=q, limit=100_000, offset=0)
  wb = Workbook()
  _add_sheet(
    wb, '單品銷量',
    [('SKU', None), ('名稱', None), ('條碼', None), ('顏色', None), ('尺寸', None),
     ('數量', INT), ('營收', MONEY), ('折扣', MONEY), ('淨額', MONEY), ('成本', MONEY), ('毛利', MONEY)],
    [(_sku(r['sku']), r['name'], r['barcode'], r['color'] or '', r['size'] or '', r['quantity'],
      r['gross_total'], r['discount_total'], r['gross_total'] - r['discount_total'],
      r['cost_total'], r['gross_total'] - r['discount_total'] - r['cost_total']) for r in rows],
  )
  return _to_bytes(wb)


def build_orders_workbook(
  session: Session,
  start_date: date | None,
  end_date: date | None,
) -> bytes:
  start_dt, end_dt = normalize_range_to_utc8(start_date, end_date, default_days=28)
  orders = session.exec(
    select(Order)
    .where(Order.created_at >= start_dt, Order.created_at < end_dt)
    .order_by(Order.created_at)
  ).scalars().all()
  order_ids = [o.id for o in orders]
  members = {m.id: m for m in session.exec(select(Member)).scalars().all()}

  items: list[tuple[OrderItem, Product | None]] = []
  if order_ids:
    items = session.exec(
      select(OrderItem, Product)
      .join(Product, Product.id == OrderItem.product_id, isouter=True)
      .where(OrderItem.order_id.in_(order_ids))
      .order_by(OrderItem.order_id, OrderItem.id)
    ).all()
  order_by_id = {o.id: o for o in orders}

  def status(o: Order) -> str:
    if o.is_cancelled:
      return '已取消'
    return '換貨' if o.is_exchange else '完成'

  def member_name(o: Order) -> str:
    m = members.get(o.member_id) if o.member_id else None
    return m.name if m else ''

  wb = Workbook()
  _add_sheet(
    wb, '訂單',
    [('訂單編號', None), ('時間', DATETIME), ('狀態', None), ('會員', None), ('付款方式', None),
     ('毛額', MONEY), ('折扣', MONEY), ('實收', MONEY), ('成本', MONEY), ('毛利', MONEY), ('備註', None)],
    [(o.id, o.created_at, status(o), member_name(o), payment_label(o.payment_method),
      o.gross_total, o.discount_total, o.total_price, o.cost_total, o.profit_total, o.note or '')
     for o in orders],
  )
  _add_sheet(
    wb, '明細',
    [('訂單編號', None), ('時間', DATETIME), ('狀態', None), ('SKU', None), ('品名', None),
     ('顏色', None), ('尺寸', None), ('數量', INT), ('單價', MONEY), ('小計', MONEY),
     ('成本', MONEY), ('類型', None)],
    [(item.order_id, order_by_id[item.order_id].created_at, status(order_by_id[item.order_id]),
      _sku(product.sku) if product else '', product.name if product else '',
      (product.color or '') if product else '', (product.size or '') if product else '',
      item.quantity, item.unit_price, item.subtotal, item.cost_subtotal,
      '退回' if item.is_return else '銷售')
     for item, product in items],
  )
  return _to_bytes(wb)


def build_inventory_workbook(session: Session, stale_days: int) -> bytes:
  report = get_inventory_report(session, stale_days=stale_days, limit=100_000)
  s = report.summary
  wb = Workbook()
  _summary_sheet(wb, '摘要', [
    ('有庫存品項', s.items_in_stock, INT),
    ('庫存件數', s.units_in_stock, INT),
    ('庫存成本', s.cost_value, MONEY),
    (f'滯銷品項（{report.stale_days} 天未售）', s.stale_items, INT),
    ('滯銷庫存成本', s.stale_cost_value, MONEY),
    (f'低庫存（≤ {report.low_stock_max} 件，近 {report.recent_days} 天賣出 ≥ {report.min_sold_recent} 件）', s.low_stock_items, INT),
  ])
  _add_sheet(
    wb, '滯銷商品',
    [('SKU', None), ('品名', None), ('顏色 / 尺寸', None), ('廠商', None), ('庫存', INT),
     ('庫存成本', MONEY), ('首次入庫', DATE), ('最後售出', DATE), ('未動天數', INT)],
    [(_sku(r.sku), r.name, _variant(r.color, r.size), r.vendor_name, r.stock, r.cost_value,
      r.first_stocked_at, r.last_sold_at or '從未售出', r.idle_days) for r in report.stale],
  )
  _add_sheet(
    wb, '低庫存',
    [('SKU', None), ('品名', None), ('顏色 / 尺寸', None), ('廠商', None), ('庫存', INT),
     (f'近 {report.recent_days} 天售出', INT), ('最後售出', DATE)],
    [(_sku(r.sku), r.name, _variant(r.color, r.size), r.vendor_name, r.stock, r.sold_recent,
      r.last_sold_at) for r in report.low_stock],
  )
  _add_sheet(
    wb, '依廠商',
    [('廠商', None), ('品項', INT), ('件數', INT), ('庫存成本', MONEY)],
    [(r.vendor_name, r.items, r.units, r.cost_value) for r in report.by_vendor],
  )
  return _to_bytes(wb)


def build_members_workbook(
  session: Session,
  start_date: date | None,
  end_date: date | None,
) -> bytes:
  report = get_member_report(session, start_date, end_date, limit=100_000)
  s = report.summary
  wb = Workbook()
  _summary_sheet(wb, '摘要', [
    ('期間', f'{report.start_date:%Y/%m/%d} – {report.end_date:%Y/%m/%d}', None),
    ('總營收 (NET)', s.total_net, MONEY),
    ('會員營收', s.member_net, MONEY),
    ('會員營收占比', s.member_share, PERCENT),
    ('總訂單數', s.total_orders, INT),
    ('會員訂單數', s.member_orders, INT),
    ('消費會員數', s.active_members, INT),
    ('新會員', s.new_members, INT),
  ])
  _add_sheet(
    wb, '會員消費排行',
    [('會員編號', None), ('姓名', None), ('電話', None), ('訂單數', INT), ('淨額', MONEY), ('最近消費', DATETIME)],
    [(m.member_code or '', m.name, m.phone or '', m.orders_count, m.net_total, m.last_order_at)
     for m in report.top_members],
  )
  return _to_bytes(wb)


def export_filename(kind: str, start: date | None = None, end: date | None = None) -> str:
  if start or end:
    end = end or date.today()
    start = start or (end - timedelta(days=27))
    return f'{kind}_{start:%Y%m%d}-{end:%Y%m%d}.xlsx'
  return f'{kind}_{date.today():%Y%m%d}.xlsx'
