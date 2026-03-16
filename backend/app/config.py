from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import List

from pydantic import field_validator
from pydantic_settings import BaseSettings

BASE_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DB_PATH = BASE_DIR / 'data' / 'app.db'


DEFAULT_CORS_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
]
DEFAULT_CORS_ORIGIN_REGEX = r'https?://(localhost|127\.0\.0\.1)(:\d+)?'


class Settings(BaseSettings):
  app_name: str = 'about-nine² POS API'
  api_prefix: str = '/api'
  database_url: str = f'sqlite:///{DEFAULT_DB_PATH}'
  cors_origins: List[str] | str = DEFAULT_CORS_ORIGINS
  cors_origin_regex: str | None = DEFAULT_CORS_ORIGIN_REGEX
  next_public_api_base_url: str | None = None

  @field_validator('cors_origins', mode='before')
  @classmethod
  def parse_cors(cls, value: str | List[str]) -> List[str]:
    if isinstance(value, list):
      return value or DEFAULT_CORS_ORIGINS
    if not value:
      return DEFAULT_CORS_ORIGINS
    return [origin.strip() for origin in value.split(',') if origin.strip()] or DEFAULT_CORS_ORIGINS

  @field_validator('database_url', mode='before')
  @classmethod
  def ensure_database_url(cls, value: str | None) -> str:
    if not value:
      return f'sqlite:///{DEFAULT_DB_PATH}'
    return value

  model_config = {
    'env_file': '.env',
    'env_file_encoding': 'utf-8',
    'extra': 'ignore'
  }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
  return Settings()
