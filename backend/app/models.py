from __future__ import annotations

from datetime import date, datetime
from enum import Enum
from typing import Optional

from sqlalchemy import Column, String
from sqlmodel import Field, SQLModel

from .utils.time_utils import utc8_now

class TimestampMixin(SQLModel):
  created_at: datetime = Field(default_factory=utc8_now, nullable=False)
  updated_at: datetime = Field(default_factory=utc8_now, nullable=False)


class Vendor(TimestampMixin, table=True):
  __tablename__ = 'vendors'

  id: Optional[int] = Field(default=None, primary_key=True)
  name: str
  contact: Optional[str] = None
  phone: Optional[str] = None
  email: Optional[str] = None
  address: Optional[str] = None


class Product(TimestampMixin, table=True):
  __tablename__ = 'products'

  id: Optional[int] = Field(default=None, primary_key=True)
  name: str
  sku: str = Field(index=True)
  vendor_id: Optional[int] = Field(default=None, foreign_key='vendors.id')
  barcode: str = Field(index=True)
  color: Optional[str] = None
  size: Optional[str] = None
  cost: float = Field(default=0)
  price: float = Field(default=0)
  stock: int = Field(default=0)
  description: Optional[str] = None
  image_url: Optional[str] = None
  first_stocked_at: Optional[datetime] = Field(default=None, nullable=True)
  data_updated_at: Optional[datetime] = Field(default=None, nullable=True)
  last_stocked_at: Optional[datetime] = Field(default=None, nullable=True)


class UserRole(str, Enum):
  ADMIN = 'admin'
  STAFF = 'staff'


class User(TimestampMixin, table=True):
  __tablename__ = 'users'

  id: Optional[int] = Field(default=None, primary_key=True)
  username: str = Field(index=True, sa_column_kwargs={'unique': True})
  password_hash: str
  role: str = Field(default=UserRole.STAFF, sa_column=Column(String, default=UserRole.STAFF))
  is_active: bool = Field(default=True, nullable=False)
  display_name: Optional[str] = Field(default=None, nullable=True)


class StockEntryMethod(str, Enum):
  SINGLE = 'single'
  IMPORT = 'import'


class PaymentMethod(str, Enum):
  CASH = 'cash'
  TRANSFER = 'transfer'
  MOBILE = 'mobile'


class ReservationType(str, Enum):
  PREORDER = 'preorder'
  HOLD = 'hold'


class ReservationStatus(str, Enum):
  PENDING = 'pending'
  READY = 'ready'
  COMPLETED = 'completed'
  CANCELLED = 'cancelled'


class ReservationPaymentStatus(str, Enum):
  UNPAID = 'unpaid'
  PAID = 'paid'


class StockEntry(TimestampMixin, table=True):
  __tablename__ = 'stock_entries'

  id: Optional[int] = Field(default=None, primary_key=True)
  product_id: Optional[int] = Field(default=None, foreign_key='products.id', nullable=True)
  product_name: str
  sku: str
  barcode: str
  vendor_name: Optional[str] = None
  quantity: int = Field(default=0)
  method: StockEntryMethod = Field(default=StockEntryMethod.SINGLE)
  batch_id: Optional[str] = Field(default=None, nullable=True)


class Member(TimestampMixin, table=True):
  __tablename__ = 'members'

  id: Optional[int] = Field(default=None, primary_key=True)
  member_code: Optional[str] = Field(default=None, index=True, sa_column_kwargs={'unique': True})
  name: str
  birthday: Optional[date] = Field(default=None, nullable=True)
  joined_date: Optional[date] = Field(default=None, nullable=True)
  phone: Optional[str] = Field(default=None, index=True)
  note: Optional[str] = Field(default=None, nullable=True)
  points: int = Field(default=0, nullable=False)


class Order(TimestampMixin, table=True):
  __tablename__ = 'orders'

  id: Optional[int] = Field(default=None, primary_key=True)
  member_id: Optional[int] = Field(default=None, foreign_key='members.id')
  reservation_id: Optional[int] = Field(default=None, foreign_key='reservations.id')
  is_cancelled: bool = Field(default=False, nullable=False)
  total_price: float = 0
  discount: float = 0
  gross_total: float = 0
  discount_total: float = 0
  cost_total: float = 0
  profit_total: float = 0
  payment_method: PaymentMethod = Field(
    default=PaymentMethod.CASH,
    sa_column=Column(String, default=PaymentMethod.CASH)
  )
  member_discount_applied: bool = Field(default=False)
  birthday_discount_applied: bool = Field(default=False)
  manual_discount_rate: float = Field(default=0, nullable=False)
  note: Optional[str] = Field(default=None, nullable=True)


class OrderItem(SQLModel, table=True):
  __tablename__ = 'order_items'

  id: Optional[int] = Field(default=None, primary_key=True)
  order_id: int = Field(foreign_key='orders.id')
  product_id: int = Field(foreign_key='products.id')
  quantity: int
  unit_price: float
  unit_cost: float
  subtotal: float
  cost_subtotal: float
  custom_reason: Optional[str] = Field(default=None, nullable=True)


class Reservation(TimestampMixin, table=True):
  __tablename__ = 'reservations'

  id: Optional[int] = Field(default=None, primary_key=True)
  type: ReservationType
  status: ReservationStatus = Field(default=ReservationStatus.PENDING, nullable=False)
  payment_status: ReservationPaymentStatus = Field(default=ReservationPaymentStatus.UNPAID, nullable=False)
  product_id: int = Field(foreign_key='products.id')
  quantity: int = Field(default=1, ge=1)
  member_id: Optional[int] = Field(default=None, foreign_key='members.id')
  order_id: Optional[int] = Field(default=None, foreign_key='orders.id')
  customer_name: str
  customer_phone: Optional[str] = Field(default=None, index=True)
  note: Optional[str] = Field(default=None, nullable=True)
  expected_date: Optional[date] = Field(default=None, nullable=True)
  hold_until: Optional[date] = Field(default=None, nullable=True)
  paid_amount: float = Field(default=0, nullable=False)


class ReservationItem(SQLModel, table=True):
  __tablename__ = 'reservation_items'

  id: Optional[int] = Field(default=None, primary_key=True)
  reservation_id: int = Field(foreign_key='reservations.id')
  product_id: int = Field(foreign_key='products.id')
  quantity: int = Field(default=1, ge=1)
