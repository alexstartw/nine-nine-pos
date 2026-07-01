from __future__ import annotations

import logging
import logging.handlers
from pathlib import Path

from .config import BASE_DIR

LOG_PATH = BASE_DIR / 'data' / 'error.log'

_FORMATTER = logging.Formatter(
  '%(asctime)s [%(levelname)s] %(name)s — %(message)s',
  datefmt='%Y-%m-%d %H:%M:%S',
)


def setup_logging() -> None:
  LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

  file_handler = logging.handlers.RotatingFileHandler(
    LOG_PATH,
    maxBytes=5 * 1024 * 1024,  # 5 MB per file
    backupCount=3,
    encoding='utf-8',
  )
  file_handler.setLevel(logging.ERROR)
  file_handler.setFormatter(_FORMATTER)

  root = logging.getLogger()
  if not any(isinstance(h, logging.handlers.RotatingFileHandler) for h in root.handlers):
    root.addHandler(file_handler)

  # ensure root level allows ERROR through
  if root.level == logging.NOTSET or root.level > logging.ERROR:
    root.setLevel(logging.ERROR)


def get_logger(name: str) -> logging.Logger:
  return logging.getLogger(name)
