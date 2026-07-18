from __future__ import annotations

from datetime import date, datetime
from typing import Generic, List, Literal, Optional, TypeVar

from pydantic import BaseModel, Field, validator

from .models import PaymentMethod, ReservationPaymentStatus, ReservationStatus, ReservationType, UserRole
T = TypeVar('T')


# ── User schemas ──────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
  username: str = Field(min_length=2, max_length=50)
  password: str = Field(min_length=8)
  role: UserRole = UserRole.STAFF
  display_name: Optional[str] = None


class UserRead(BaseModel):
  id: int
  username: str
  role: str
  is_active: bool
  display_name: Optional[str]
  created_at: datetime

  class Config:
    from_attributes = True


class UserUpdate(BaseModel):
  role: Optional[UserRole] = None
  display_name: Optional[str] = None
  is_active: Optional[bool] = None


class PasswordResetRequest(BaseModel):
  new_password: str = Field(min_length=8)

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
  cost: int = 0
  price: int = 0
  stock: int = 0
  description: Optional[str] = None
  image_url: Optional[str] = None

  @validator('price', 'cost', pre=True)
  def number_must_be_non_negative_int(cls, value: float) -> int:
    v = int(round(float(value)))
    if v < 0:
      raise ValueError('Price & cost must be >= 0')
    return v

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
  cost: Optional[int] = None
  price: Optional[int] = None
  stock: Optional[int] = None
  description: Optional[str] = None
  image_url: Optional[str] = None

  @validator('price', 'cost', pre=True)
  def cost_price_must_be_non_negative_int(cls, value: Optional[float]) -> Optional[int]:
    if value is None:
      return None
    v = int(round(float(value)))
    if v < 0:
      raise ValueError('Price & cost must be >= 0')
    return v


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


class ProductSummary(BaseModel):
  total_stock: int = 0
  total_stock_value: float = 0


class StockEntryRead(BaseModel):
  id: int
  product_id: Optional[int] = None
  product_name: str
  sku: str
  barcode: str
  vendor_name: Optional[str] = None
  quantity: int
  method: str
  created_at: datetime
  batch_id: Optional[str] = None


class ImportBatchItem(BaseModel):
  id: int
  product_id: Optional[int] = None
  product_name: str
  sku: str
  barcode: str
  vendor_name: Optional[str] = None
  quantity: int


class ImportBatch(BaseModel):
  batch_id: str
  created_at: datetime
  item_count: int
  total_quantity: int


class ImportBatchDetail(BaseModel):
  batch_id: str
  created_at: datetime
  items: List[ImportBatchItem]


class ImportBatchItemUpdate(BaseModel):
  quantity: int = Field(ge=1)


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
  total_spent: float = 0



class MemberOrderItemRead(BaseModel):
  product_name: str
  color: Optional[str] = None
  size: Optional[str] = None
  quantity: int
  unit_price: float
  subtotal: float


class MemberOrderRecord(BaseModel):
  id: int
  created_at: datetime
  payment_method: str
  total_price: float
  gross_total: float
  discount_total: float
  is_cancelled: bool
  note: Optional[str] = None
  items: List[MemberOrderItemRead]


class MemberPurchaseItem(BaseModel):
  order_id: int
  order_created_at: datetime
  is_cancelled: bool
  product_name: str
  barcode: str
  color: Optional[str] = None
  size: Optional[str] = None
  quantity: int
  unit_price: float
  subtotal: float


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


class ExchangeOriginalItem(BaseModel):
  order_item_id: int
  product_id: int
  product_name: str
  barcode: str
  color: Optional[str] = None
  size: Optional[str] = None
  purchased_quantity: int
  refundable_quantity: int
  sold_unit_price: float
  list_price: float


class ExchangeOriginalLookupResponse(BaseModel):
  order_id: int
  created_at: datetime
  member: Optional[OrderMemberInfo] = None
  items: List[ExchangeOriginalItem]


class ExchangeReturnItemPayload(BaseModel):
  original_order_item_id: Optional[int] = None
  product_id: int
  quantity: int = Field(ge=1)
  refund_unit_price: float = Field(ge=0)


class ExchangeCheckoutRequest(BaseModel):
  original_order_id: Optional[int] = None
  member_phone: Optional[str] = None
  payment_method: PaymentMethod = PaymentMethod.CASH
  return_items: List[ExchangeReturnItemPayload]
  purchase_items: List[OrderItemPayload] = Field(default_factory=list)
  manual_discount_rate: Optional[float] = Field(default=None)
  round_down_to_ten: bool = False
  note: Optional[str] = None


class ExchangeCheckoutResponse(BaseModel):
  order_id: int
  is_exchange: bool = True
  original_order_id: Optional[int] = None
  refund_total: float
  purchase_gross: float
  purchase_discount: float
  purchase_net: float
  net_payable: float
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
  color: Optional[str] = None
  size: Optional[str] = None
  quantity: int
  unit_price: float
  unit_cost: float
  subtotal: float
  cost_subtotal: float
  custom_reason: Optional[str] = None
  custom_price_used: bool = False
  is_return: bool = False
  original_order_item_id: Optional[int] = None


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
  is_cancelled: bool
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
  is_exchange: bool = False
  original_order_id: Optional[int] = None
  exchange_refund_total: float = 0


class OrderUpdateRequest(BaseModel):
  payment_method: Optional[PaymentMethod] = None
  member_phone: Optional[str] = None
  note: Optional[str] = None
  items: Optional[List[OrderItemPayload]] = None
  manual_discount_rate: Optional[float] = None
  round_down_to_ten: bool = False


class ReservationProductSummary(BaseModel):
  id: int
  name: str
  sku: str
  barcode: str
  color: Optional[str] = None
  size: Optional[str] = None
  stock: int
  price: float


class ReservationItemPayload(BaseModel):
  product_id: int
  quantity: int = Field(default=1, ge=1)


class ReservationItemDetail(BaseModel):
  id: int
  product_id: int
  quantity: int
  product: ReservationProductSummary


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
  items: List[ReservationItemPayload]
  member_id: Optional[int] = None


class ReservationUpdate(BaseModel):
  customer_name: Optional[str] = None
  customer_phone: Optional[str] = None
  items: Optional[List[ReservationItemPayload]] = None
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
  items: List[ReservationItemDetail]
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


# Analytics

class SalesPaymentBreakdownItem(BaseModel):
  method: str
  orders_count: int
  net_total: float


class SalesBucket(BaseModel):
  period_start: date
  period_label: str
  orders_count: int
  gross_total: float
  discount_total: float
  net_total: float
  cost_total: float
  profit_total: float
  quantity: int


class SalesProductPerformance(BaseModel):
  product_id: int
  sku: str
  name: str
  barcode: str
  quantity: int
  gross_total: float
  discount_total: float
  net_total: float
  cost_total: float
  profit_total: float


class SalesSummary(BaseModel):
  orders_count: int
  gross_total: float
  discount_total: float
  net_total: float
  cost_total: float
  profit_total: float
  quantity: int


class SalesAnalyticsResponse(BaseModel):
  group_by: Literal['day', 'week'] = 'week'
  timezone: str = 'UTC+8'
  start_date: date
  end_date: date
  summary: SalesSummary
  payment_breakdown: List[SalesPaymentBreakdownItem]
  timeseries: List[SalesBucket]
  top_products: List[SalesProductPerformance]


class ProductSalesRow(BaseModel):
  product_id: int
  sku: str
  name: str
  barcode: str
  color: Optional[str] = None
  size: Optional[str] = None
  quantity: int
  gross_total: float
  discount_total: float
  net_total: float
  cost_total: float
  profit_total: float


class ProductSalesStatsResponse(BaseModel):
  data: List[ProductSalesRow]
  total: int
  page: int
  size: int


class ProductStockRecord(BaseModel):
  id: int
  quantity: int
  method: str
  created_at: datetime


class ProductSaleRecord(BaseModel):
  order_id: int
  order_created_at: datetime
  is_cancelled: bool
  quantity: int
  unit_price: float
  subtotal: float


class ProductHistoryResponse(BaseModel):
  product_id: int
  product_name: str
  total_stocked: int
  total_sold: int
  current_stock: int
  stock_entries: List[ProductStockRecord]
  sales: List[ProductSaleRecord]


# ── App Log schemas ───────────────────────────────────────────────────────────

class AppLogRead(BaseModel):
  id: int
  level: str
  message: str
  path: Optional[str]
  method: Optional[str]
  traceback: Optional[str]
  created_at: datetime
