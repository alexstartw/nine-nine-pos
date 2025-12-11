from __future__ import annotations

from datetime import datetime, timedelta
from typing import Optional, Tuple, TYPE_CHECKING

from sqlalchemy import select
from sqlmodel import Session

if TYPE_CHECKING:
  from ..models import Member, Order

MEMBER_DISCOUNT_RATE = 0.05
BIRTHDAY_DISCOUNT_RATE = 0.12


def round_currency(value: float) -> int:
  return int(round(value))


def normalize_phone(phone: Optional[str]) -> Optional[str]:
  if phone is None:
    return None
  cleaned = phone.strip()
  return cleaned or None


def is_birthday_month(member: Member, current_time: datetime) -> bool:
  return bool(member.birthday and member.birthday.month == current_time.month)


def birthday_discount_available(
  session: Session,
  member: Member,
  current_time: datetime,
  exclude_order_id: Optional[int] = None
) -> bool:
  from ..models import Order  # Local import to avoid circular dependency

  if not member.birthday:
    return False

  month_start = datetime(current_time.year, current_time.month, 1)
  next_month = (month_start + timedelta(days=32)).replace(day=1)

  statement = select(Order.id).where(
    Order.member_id == member.id,
    Order.birthday_discount_applied == True,  # noqa: E712
    Order.is_cancelled == False,  # noqa: E712
    Order.created_at >= month_start,
    Order.created_at < next_month
  )

  if exclude_order_id:
    statement = statement.where(Order.id != exclude_order_id)

  existing = session.exec(statement.limit(1)).first()
  return existing is None


def calculate_discounts(
  member: Optional[Member],
  gross_total: float,
  session: Session,
  current_time: datetime,
  exclude_order_id: Optional[int] = None,
  discountable_total: Optional[float] = None
) -> Tuple[float, float, bool, bool]:
  member_discount_amount = 0.0
  birthday_discount_amount = 0.0
  member_discount_applied = False
  birthday_discount_applied = False

  eligible_total = discountable_total if discountable_total is not None else gross_total

  if member and eligible_total > 0:
    if (
      is_birthday_month(member, current_time) and
      birthday_discount_available(session, member, current_time, exclude_order_id=exclude_order_id)
    ):
      birthday_discount_amount = round_currency(eligible_total * BIRTHDAY_DISCOUNT_RATE)
      birthday_discount_applied = birthday_discount_amount > 0
    else:
      member_discount_amount = round_currency(eligible_total * MEMBER_DISCOUNT_RATE)
      member_discount_applied = member_discount_amount > 0

  return (
    member_discount_amount,
    birthday_discount_amount,
    member_discount_applied,
    birthday_discount_applied
  )
