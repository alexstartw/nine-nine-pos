from __future__ import annotations

from datetime import date, datetime
from typing import Generic, List, Optional, TypeVar

from pydantic import BaseModel, Field, validator

from .models import PaymentMethod, ReservationPaymentStatus, ReservationStatus, ReservationType
T = TypeVar('T')

class PaginationParams(BaseModel):
  page: int = Field(default=1, ge=1)
  size: int = Field(default=10, ge=1, le=500)

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


class LegacyProductImportRow(ProductImportRow):
  barcode: str


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


class MemberSuggestion(BaseModel):
  id: int
  member_code: str
  name: str
  phone: Optional[str] = None


class OrderItemPayload(BaseModel):
  product_id: int
  quantity: int = Field(ge=1)
  custom_price: Optional[float] = Field(default=None, ge=0)
  custom_reason: Optional[str] = None


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
  manual_discount: float = 0
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
  manual_discount_rate: Optional[float] = Field(
    default=None,
    description='0-1 之間的折扣率，0.05 代表 5% 折扣'
  )
  round_down_to_ten: bool = False


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
  custom_reason: Optional[str] = None
  custom_price_used: bool = False


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
  reservation_id: Optional[int] = None
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


class ReservationProductSummary(BaseModel):
  id: int
  name: str
  sku: str
  barcode: str
  stock: int
  price: float


class ReservationBase(BaseModel):
  customer_name: str
  customer_phone: Optional[str] = None
  quantity: int = Field(default=1, ge=1)
  note: Optional[str] = None
  expected_date: Optional[date] = None
  hold_until: Optional[date] = None
  payment_status: ReservationPaymentStatus = ReservationPaymentStatus.UNPAID
  paid_amount: float = Field(default=0, ge=0)

  @validator('customer_name')
  def name_cannot_be_blank(cls, value: str) -> str:
    value = value.strip()
    if not value:
      raise ValueError('客戶名稱不得為空')
    return value


class ReservationCreate(ReservationBase):
  type: ReservationType
  product_id: int
  member_id: Optional[int] = None


class ReservationUpdate(BaseModel):
  customer_name: Optional[str] = None
  customer_phone: Optional[str] = None
  quantity: Optional[int] = Field(default=None, ge=1)
  note: Optional[str] = None
  expected_date: Optional[date] = None
  hold_until: Optional[date] = None
  payment_status: Optional[ReservationPaymentStatus] = None
  status: Optional[ReservationStatus] = None
  paid_amount: Optional[float] = Field(default=None, ge=0)
  member_id: Optional[int] = Field(default=None, ge=1)


class ReservationRead(BaseModel):
  id: int
  type: ReservationType
  status: ReservationStatus
  payment_status: ReservationPaymentStatus
  product_id: int
  product: ReservationProductSummary
  quantity: int
  member: Optional[OrderMemberInfo] = None
  member_id: Optional[int] = None
  order_id: Optional[int] = None
  customer_name: str
  customer_phone: Optional[str] = None
  note: Optional[str] = None
  expected_date: Optional[date] = None
  hold_until: Optional[date] = None
  paid_amount: float
  created_at: datetime
  updated_at: datetime
