from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Optional

from sqlmodel import Field, SQLModel


class TimestampMixin(SQLModel):
  created_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)
  updated_at: datetime = Field(default_factory=datetime.utcnow, nullable=False)


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


class StockEntryMethod(str, Enum):
  SINGLE = 'single'
  IMPORT = 'import'


class StockEntry(TimestampMixin, table=True):
  __tablename__ = 'stock_entries'

  id: Optional[int] = Field(default=None, primary_key=True)
  product_id: int = Field(foreign_key='products.id')
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
  name: str
  phone: Optional[str] = Field(default=None, index=True)
  email: Optional[str] = Field(default=None, index=True)
  points: int = Field(default=0)


class Order(TimestampMixin, table=True):
  __tablename__ = 'orders'

  id: Optional[int] = Field(default=None, primary_key=True)
  member_id: Optional[int] = Field(default=None, foreign_key='members.id')
  total_price: float = 0
  discount: float = 0


class OrderItem(SQLModel, table=True):
  __tablename__ = 'order_items'

  id: Optional[int] = Field(default=None, primary_key=True)
  order_id: int = Field(foreign_key='orders.id')
  product_id: int = Field(foreign_key='products.id')
  quantity: int
  subtotal: float
