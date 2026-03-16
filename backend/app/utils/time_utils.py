from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

UTC_PLUS_8 = timezone(timedelta(hours=8))
WEEK_START_WEEKDAY = 0  # Monday


def utc8_now(tz_aware: bool = False) -> datetime:
  """Return the current time in UTC+8. Defaults to naive datetime for SQLite compatibility."""
  now = datetime.now(UTC_PLUS_8)
  return now if tz_aware else now.replace(tzinfo=None)


def utc8_today() -> date:
  """Date component for UTC+8."""
  return utc8_now().date()


def utc8_week_start(target_date: date | None = None) -> date:
  """Return Monday (week start) for the given date in UTC+8."""
  base_date = target_date or utc8_today()
  return base_date - timedelta(days=base_date.weekday() - WEEK_START_WEEKDAY)


def normalize_range_to_utc8(
  start_date: date | None,
  end_date: date | None,
  default_days: int = 28
) -> tuple[datetime, datetime]:
  """Convert optional date inputs into UTC+8-aware range [start, end)."""
  today = utc8_today()
  resolved_end = end_date or today
  resolved_start = start_date or (resolved_end - timedelta(days=default_days - 1))
  if resolved_start > resolved_end:
    resolved_start, resolved_end = resolved_end, resolved_start

  start_dt = datetime.combine(resolved_start, datetime.min.time())
  end_dt = datetime.combine(resolved_end + timedelta(days=1), datetime.min.time())
  return start_dt, end_dt
