from __future__ import annotations

from datetime import date, datetime
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field, validator

from .models import PaymentMethod
T = TypeVar('T')

class PaginationParams(BaseModel):
  page: int = Field(default=1, ge=1)
  size: int = Field(default=20, ge=1, le=500)

  @property
  def offset(self) -> int:
    return (self.page - 1) * self.size


class PaginatedResponse(BaseModel, Generic[T]):
  data: List[T]
  total: int
  page: int
  size: int


class ProductImportSummary(BaseModel):
  created: int = 0
  restocked: int = 0
  errors: List[str] = Field(default_factory=list)


class VendorBase(BaseModel):
  name: str
  contact: Optional[str] = None
  phone: Optional[str] = None
  email: Optional[str] = None
  address: Optional[str] = None


class VendorCreate(VendorBase):
  name: str = Field(min_length=1)


class VendorUpdate(BaseModel):
  name: Optional[str] = None
  contact: Optional[str] = None
  phone: Optional[str] = None
  email: Optional[str] = None
  address: Optional[str] = None


class VendorRead(VendorBase):
  id: int
  created_at: datetime
  updated_at: datetime
  product_count: int = 0


class ProductBase(BaseModel):
  name: str
  sku: str
  vendor_id: Optional[int] = None
  color: Optional[str] = None
  size: Optional[str] = None
  cost: float = 0
  price: float = 0
  stock: int = 0
  description: Optional[str] = None
  image_url: Optional[str] = None

  @validator('price', 'cost')
  def number_cannot_be_negative(cls, value: float) -> float:
    if value < 0:
      raise ValueError('Price & cost must be >= 0')
    return round(value, 2)

  @validator('stock')
  def stock_must_be_positive(cls, value: int) -> int:
    if value < 0:
      raise ValueError('Stock must be >= 0')
    return value


class ProductCreate(ProductBase):
  pass


class ProductUpdate(BaseModel):
  name: Optional[str] = None
  sku: Optional[str] = None
  vendor_id: Optional[int] = None
  color: Optional[str] = None
  size: Optional[str] = None
  cost: Optional[float] = None
  price: Optional[float] = None
  stock: Optional[int] = None
  description: Optional[str] = None
  image_url: Optional[str] = None


class ProductVendor(BaseModel):
  id: int
  name: str


class ProductRead(ProductBase):
  id: int
  barcode: str
  created_at: datetime
  updated_at: datetime
  gross_margin: float = 0
  gross_margin_percentage: float = 0
  vendor: Optional[ProductVendor] = None
  first_stocked_at: Optional[datetime] = None
  data_updated_at: Optional[datetime] = None
  last_stocked_at: Optional[datetime] = None


class StockEntryRead(BaseModel):
  id: int
  product_id: int
  product_name: str
  sku: str
  barcode: str
  vendor_name: Optional[str] = None
  quantity: int
  method: str
  created_at: datetime
  batch_id: Optional[str] = None


class ProductImportRow(BaseModel):
  vendor_name: str
  sku: str
  name: str
  color: str
  size: str
  cost: int
  price: int
  quantity: int = Field(ge=1)


class MemberBase(BaseModel):
  name: str
  birthday: Optional[date] = None
  joined_date: Optional[date] = None
  phone: Optional[str] = None
  note: Optional[str] = None


class MemberCreate(MemberBase):
  pass


class MemberUpdate(BaseModel):
  name: Optional[str] = None
  birthday: Optional[date] = None
  joined_date: Optional[date] = None
  phone: Optional[str] = None
  note: Optional[str] = None


class MemberRead(MemberBase):
  id: int
  member_code: str
  created_at: datetime
  updated_at: datetime


class OrderItemPayload(BaseModel):
  product_id: int
  quantity: int = Field(ge=1)


class PosCheckoutItemSummary(BaseModel):
  product_id: int
  quantity: int
  unit_price: float
  unit_cost: float
  subtotal: float
  cost_subtotal: float


class PosCheckoutDiscounts(BaseModel):
  member_discount: float = 0
  birthday_discount: float = 0
  member_discount_applied: bool = False
  birthday_discount_applied: bool = False


class PosMemberSummary(BaseModel):
  id: int
  member_code: str
  name: str
  phone: Optional[str] = None
  birthday: Optional[date] = None
  is_birthday_month: bool = False
  birthday_discount_available: bool = False


class PosMemberLookupResponse(PosMemberSummary):
  joined_date: Optional[date] = None
  note: Optional[str] = None


class PosProductResponse(BaseModel):
  id: int
  name: str
  barcode: str
  price: float
  cost: float
  stock: int


class PosCheckoutRequest(BaseModel):
  member_phone: Optional[str] = None
  payment_method: PaymentMethod = PaymentMethod.CASH
  items: List[OrderItemPayload]


class PosCheckoutResponse(BaseModel):
  order_id: int
  gross_total: float
  discount_total: float
  total_price: float
  cost_total: float
  profit_total: float
  payment_method: PaymentMethod
  discounts: PosCheckoutDiscounts
  member: Optional[PosMemberSummary] = None
  created_at: datetime


class PosDailySummary(BaseModel):
  date: date
  orders_count: int
  gross_total: float
  discount_total: float
  net_total: float
  cost_total: float
  profit_total: float
  payment_breakdown: dict[str, int] = Field(default_factory=dict)


class OrderItemRead(BaseModel):
  id: int
  product_id: int
  product_name: str
  barcode: str
  quantity: int
  unit_price: float
  unit_cost: float
  subtotal: float
  cost_subtotal: float


class OrderMemberInfo(BaseModel):
  id: Optional[int] = None
  member_code: Optional[str] = None
  name: Optional[str] = None
  phone: Optional[str] = None


class OrderRead(BaseModel):
  id: int
  created_at: datetime
  updated_at: datetime
  payment_method: PaymentMethod
  gross_total: float
  discount_total: float
  total_price: float
  cost_total: float
  profit_total: float
  note: Optional[str] = None
  member_discount_applied: bool
  birthday_discount_applied: bool
  member: Optional[OrderMemberInfo] = None
  items: List[OrderItemRead]


class OrderUpdateRequest(BaseModel):
  payment_method: Optional[PaymentMethod] = None
  member_phone: Optional[str] = None
  note: Optional[str] = None
  items: Optional[List[OrderItemPayload]] = None
