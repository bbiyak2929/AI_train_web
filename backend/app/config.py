"""
AI Training Management Platform — Configuration
"""
from pydantic_settings import BaseSettings
from typing import List
import json


class Settings(BaseSettings):
    # ── Database ──────────────────────────────────
    DATABASE_URL: str = "postgresql://aitrain:changeme@db:5432/aitrain"

    # ── Redis ─────────────────────────────────────
    REDIS_URL: str = "redis://redis:6379/0"
    CELERY_BROKER_URL: str = "redis://redis:6379/1"
    CELERY_RESULT_BACKEND: str = "redis://redis:6379/2"

    # ── MinIO ─────────────────────────────────────
    MINIO_ENDPOINT: str = "minio:9000"
    MINIO_ROOT_USER: str = "minioadmin"
    MINIO_ROOT_PASSWORD: str = "changeme_minio_password"
    MINIO_USE_SSL: bool = False
    MINIO_BUCKET_NAME: str = "aitrain"

    # ── JWT ───────────────────────────────────────
    JWT_SECRET_KEY: str = "changeme_jwt_secret_key_at_least_32_chars"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 60

    # ── API ───────────────────────────────────────
    API_HOST: str = "0.0.0.0"
    API_PORT: int = 8000
    API_CORS_ORIGINS: str = '["http://localhost","http://localhost:3000","http://localhost:5173"]'
    DEBUG: bool = True

    # ── SMTP (Email) ──────────────────────────────
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM: str = "AI Training Platform <noreply@aitrain.local>"

    # ── Runner ────────────────────────────────────
    RUNNER_TOKEN: str = "changeme_runner_registration_token"
    GPU_ENABLED: bool = True  # Enable GPU support via --gpus all

    @property
    def cors_origins(self) -> List[str]:
        return json.loads(self.API_CORS_ORIGINS)

    class Config:
        env_file = ".env"
        case_sensitive = True


settings = Settings()
