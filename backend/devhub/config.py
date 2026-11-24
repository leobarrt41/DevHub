"""Configuração runtime; nenhuma credencial é compilada nas interfaces."""

from decimal import Decimal
from pathlib import Path

from pydantic import Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=None, extra="ignore", validate_assignment=True)

    database_url: SecretStr = SecretStr(
        "postgresql+asyncpg://devhub:devhub_local_only@127.0.0.1:5432/devhub"
    )
    devhub_access_token: SecretStr = SecretStr("")
    openrouter_api_key: SecretStr = SecretStr("")
    devhub_owner_id: str = "personal-owner"
    devhub_owner_name: str = "Proprietário"
    devhub_default_model: str = "openrouter/free"
    devhub_max_output_tokens: int = Field(default=1024, ge=32, le=8192)
    devhub_max_request_cost_usd: Decimal = Field(default=Decimal("0.05"), ge=0)
    devhub_daily_budget_usd: Decimal = Field(default=Decimal("1.00"), ge=0)
    devhub_context_chars: int = Field(default=24000, ge=2000, le=100000)
    devhub_stream_timeout_seconds: int = Field(default=240, ge=10, le=600)
    devhub_stale_task_seconds: int = Field(default=600, ge=30)
    frontend_dist: Path = Path(__file__).resolve().parents[2] / "frontend" / "dist"

    @field_validator("database_url", mode="before")
    @classmethod
    def postgres_only(cls, value):
        text = value.get_secret_value() if isinstance(value, SecretStr) else str(value)
        if text.startswith("postgres://"):
            text = "postgresql+asyncpg://" + text[len("postgres://") :]
        elif text.startswith("postgresql://"):
            text = "postgresql+asyncpg://" + text[len("postgresql://") :]
        if not text.startswith("postgresql+asyncpg://"):
            raise ValueError("DevHub exige PostgreSQL; DATABASE_URL deve ser PostgreSQL.")
        return text
