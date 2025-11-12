from __future__ import annotations

from datetime import datetime
from io import BytesIO
from typing import Dict, List

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from openpyxl import load_workbook
from sqlalchemy import func, select
from sqlmodel import Session

from ..database import get_session
from ..models import Product, Vendor
from ..schemas import (
  PaginatedResponse,
  PaginationParams,
  ProductCreate,
  ProductImportRow,
  ProductImportSummary,
  ProductRead,
  ProductUpdate,
  ProductVendor,
)
from ..utils import calculate_gross_margin, generate_barcode

router = APIRouter(prefix='/products', tags=['products'])

IMPORT_HEADER_MAP = {
  '廠商': 'vendor_name',
  '廠商貨號': 'sku',
  '品名': 'name',
  '顏色': 'color',
  '尺寸': 'size',
  '進貨數量': 'quantity',
  '成本': 'cost',
  '售價': 'price'
}

REQUIRED_HEADERS = {'廠商', '廠商貨號', '品名', '成本', '進貨數量'}


def _product_to_read(product: Product, vendor: Vendor | None) -> ProductRead:
  gross, percent = calculate_gross_margin(product.price, product.cost)
  vendor_payload = ProductVendor.model_validate(vendor, from_attributes=True) if vendor else None
  return ProductRead.model_validate(
    product,
    from_attributes=True
  ).model_copy(update={'gross_margin': gross, 'gross_margin_percentage': percent, 'vendor': vendor_payload})


@router.get('', response_model=PaginatedResponse[ProductRead])
def list_products(
  params: PaginationParams = Depends(),
  session: Session = Depends(get_session)
):
  total = session.exec(select(func.count()).select_from(Product)).scalar_one()
  statement = (
    select(Product, Vendor)
    .join(Vendor, Product.vendor_id == Vendor.id, isouter=True)
    .order_by(Product.updated_at.desc())
    .offset(params.offset)
    .limit(params.size)
  )
  rows = session.exec(statement).all()
  data = [_product_to_read(product, vendor) for product, vendor in rows]
  return PaginatedResponse[ProductRead](data=data, total=total, page=params.page, size=params.size)


@router.post('', response_model=ProductRead, status_code=status.HTTP_201_CREATED)
def create_product(
  payload: ProductCreate,
  session: Session = Depends(get_session)
):
  vendor = session.get(Vendor, payload.vendor_id) if payload.vendor_id else None
  barcode = generate_barcode(payload.vendor_id, payload.sku, payload.cost, payload.color, payload.size)
  product = Product(**payload.model_dump(), barcode=barcode)
  session.add(product)
  session.commit()
  session.refresh(product)
  return _product_to_read(product, vendor)


@router.get('/{product_id}', response_model=ProductRead)
def get_product(product_id: int, session: Session = Depends(get_session)):
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=404, detail='Product not found')
  vendor = session.get(Vendor, product.vendor_id) if product.vendor_id else None
  return _product_to_read(product, vendor)


@router.put('/{product_id}', response_model=ProductRead)
def update_product(
  product_id: int,
  payload: ProductUpdate,
  session: Session = Depends(get_session)
):
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=404, detail='Product not found')

  update_data = payload.model_dump(exclude_unset=True)
  for key, value in update_data.items():
    setattr(product, key, value)

  if any(key in update_data for key in {'vendor_id', 'sku', 'cost', 'color', 'size'}):
    product.barcode = generate_barcode(product.vendor_id, product.sku, product.cost, product.color, product.size)
  product.updated_at = datetime.utcnow()

  session.add(product)
  session.commit()
  session.refresh(product)
  vendor = session.get(Vendor, product.vendor_id) if product.vendor_id else None
  return _product_to_read(product, vendor)


@router.delete('/{product_id}', status_code=status.HTTP_204_NO_CONTENT)
def delete_product(product_id: int, session: Session = Depends(get_session)):
  product = session.get(Product, product_id)
  if not product:
    raise HTTPException(status_code=404, detail='Product not found')
  session.delete(product)
  session.commit()
  return None


def _parse_import_rows(file_bytes: bytes) -> List[ProductImportRow]:
  try:
    workbook = load_workbook(BytesIO(file_bytes), data_only=True)
  except Exception as exc:  # pragma: no cover - openpyxl specific error
    raise HTTPException(status_code=400, detail=f'無法讀取 Excel 檔案: {exc}')

  sheet = workbook.active
  headers: List[str] = []
  for cell in sheet[1]:
    headers.append(str(cell.value).strip() if cell.value is not None else '')

  missing = [header for header in REQUIRED_HEADERS if header not in headers]
  if missing:
    raise HTTPException(status_code=400, detail=f'欄位缺少: {", ".join(missing)}')

  header_index: Dict[str, int] = {name: headers.index(name) for name in IMPORT_HEADER_MAP if name in headers}

  def require_str(value, field: str, row_idx: int) -> str:
    if value is None:
      raise HTTPException(status_code=400, detail=f'列 {row_idx} 「{field}」 必須為文字')
    text = str(value).strip()
    if not text:
      raise HTTPException(status_code=400, detail=f'列 {row_idx} 「{field}」 不可為空')
    return text

  def require_int(value, field: str, row_idx: int, positive: bool = False) -> int:
    if value is None or str(value).strip() == '':
      raise HTTPException(status_code=400, detail=f'列 {row_idx} 「{field}」 必須為整數')
    try:
      number = int(float(value))
    except (TypeError, ValueError) as exc:
      raise HTTPException(status_code=400, detail=f'列 {row_idx} 「{field}」 必須為整數') from exc
    if positive and number <= 0:
      raise HTTPException(status_code=400, detail=f'列 {row_idx} 「{field}」 必須大於 0')
    return number

  rows: List[ProductImportRow] = []
  for idx, row in enumerate(sheet.iter_rows(min_row=2, values_only=True), start=2):
    if all(cell is None or str(cell).strip() == '' for cell in row):
      continue

    data: Dict[str, str] = {}
    for header, key in IMPORT_HEADER_MAP.items():
      if header not in header_index:
        continue
      col_idx = header_index[header]
      value = row[col_idx] if col_idx < len(row) else None
      data[key] = value

    try:
      payload = ProductImportRow(
        vendor_name=require_str(data.get('vendor_name'), '廠商', idx),
        sku=require_str(data.get('sku'), '廠商貨號', idx),
        name=require_str(data.get('name'), '品名', idx),
        color=require_str(data.get('color'), '顏色', idx),
        size=require_str(data.get('size'), '尺寸', idx),
        cost=require_int(data.get('cost'), '成本', idx, positive=True),
        price=require_int(data.get('price'), '售價', idx, positive=True),
        quantity=require_int(data.get('quantity'), '進貨數量', idx, positive=True)
      )
    except Exception as exc:
      raise HTTPException(status_code=400, detail=f'列 {idx} 解析失敗: {exc}')

    rows.append(payload)

  if not rows:
    raise HTTPException(status_code=400, detail='檔案內沒有可處理的資料')

  return rows


@router.post('/import', response_model=ProductImportSummary, status_code=status.HTTP_201_CREATED)
async def import_products(
  file: UploadFile = File(...),
  session: Session = Depends(get_session)
):
  if not file.filename.lower().endswith(('.xlsx', '.xlsm')):
    raise HTTPException(status_code=400, detail='僅支援 .xlsx 或 .xlsm 檔案')

  file_bytes = await file.read()
  rows = _parse_import_rows(file_bytes)

  summary = ProductImportSummary()

  for row in rows:
    if not row.vendor_name:
      summary.errors.append('缺少廠商名稱')
      continue

    vendor_row = session.exec(select(Vendor).where(Vendor.name == row.vendor_name)).first()
    vendor = None
    if vendor_row is not None:
      vendor = vendor_row[0] if not isinstance(vendor_row, Vendor) else vendor_row

    if not vendor:
      summary.errors.append(f"找不到廠商: {row.vendor_name}")
      continue

    if not row.sku:
      summary.errors.append('缺少廠商貨號')
      continue

    barcode = generate_barcode(vendor.id, row.sku, row.cost, row.color, row.size)
    product_row = session.exec(select(Product).where(Product.barcode == barcode)).first()
    product = None
    if product_row is not None:
      product = product_row[0] if not isinstance(product_row, Product) else product_row

    if product:
      product.stock += row.quantity
      product.cost = row.cost
      product.price = row.price
      product.updated_at = datetime.utcnow()
      session.add(product)
      summary.restocked += 1
    else:
      product = Product(
        name=row.name or row.sku,
        sku=row.sku,
        vendor_id=vendor.id,
        barcode=barcode,
        color=row.color,
        size=row.size,
        cost=row.cost,
        price=row.price,
        stock=row.quantity,
        description=None,
        image_url=None
      )
      session.add(product)
      summary.created += 1

  session.commit()

  return summary
