from __future__ import annotations

import time
from collections import defaultdict
from threading import Lock

from fastapi import HTTPException, status


class LoginRateLimiter:
  """In-memory sliding-window limiter for login attempts.

  Suitable for a single-instance deployment. Keyed by client identity
  (typically IP). Failed attempts accumulate within `window_seconds`;
  exceeding `max_attempts` triggers a `lockout_seconds` cooldown. A
  successful login clears the counter.
  """

  def __init__(
    self,
    max_attempts: int = 5,
    window_seconds: int = 300,
    lockout_seconds: int = 300,
  ) -> None:
    self.max_attempts = max_attempts
    self.window = window_seconds
    self.lockout = lockout_seconds
    self._attempts: dict[str, list[float]] = defaultdict(list)
    self._locked_until: dict[str, float] = {}
    self._lock = Lock()

  def check(self, key: str) -> None:
    now = time.time()
    with self._lock:
      locked_until = self._locked_until.get(key)
      if locked_until is not None:
        if now < locked_until:
          retry = int(locked_until - now) + 1
          raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f'嘗試次數過多，請於 {retry} 秒後再試',
          )
        # lockout expired — reset
        self._locked_until.pop(key, None)
        self._attempts.pop(key, None)

  def record_failure(self, key: str) -> None:
    now = time.time()
    with self._lock:
      recent = [t for t in self._attempts[key] if now - t < self.window]
      recent.append(now)
      self._attempts[key] = recent
      if len(recent) >= self.max_attempts:
        self._locked_until[key] = now + self.lockout

  def record_success(self, key: str) -> None:
    with self._lock:
      self._attempts.pop(key, None)
      self._locked_until.pop(key, None)


login_rate_limiter = LoginRateLimiter()
