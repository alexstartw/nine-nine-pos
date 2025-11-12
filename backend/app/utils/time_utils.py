from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

UTC_PLUS_8 = timezone(timedelta(hours=8))


def utc8_now(tz_aware: bool = False) -> datetime:
  """Return the current time in UTC+8. Defaults to naive datetime for SQLite compatibility."""
  now = datetime.now(UTC_PLUS_8)
  return now if tz_aware else now.replace(tzinfo=None)


def utc8_today() -> date:
  """Date component for UTC+8."""
  return utc8_now().date()
