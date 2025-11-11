from __future__ import annotations

from datetime import datetime
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
