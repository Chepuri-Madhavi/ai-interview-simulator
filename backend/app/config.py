"""Application settings, read from environment variables (and a .env file)."""
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_env: str = "development"  # development | production | test
    secret_key: str = "change-me-in-production"
    access_token_minutes: int = 60 * 12

    database_url: str = "sqlite:///./data/app.db"
    storage_dir: Path = Path("./data/storage")
    cors_origins: str = "http://localhost:5173"

    # AI
    llm_provider: str = "anthropic"  # anthropic | fake (fake is for automated tests only)
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-opus-5-5"
    anthropic_effort: str = "medium"
    anthropic_fast_model: str = "claude-haiku-5-5"  # used only for quick follow-up decisions

    # Speech-to-text on the server: "browser" means the browser transcribes live (Web Speech API)
    # and the server only stores audio. "faster_whisper" transcribes uploaded audio locally.
    stt_provider: str = "browser"
    whisper_model: str = "base"

    max_upload_mb: int = 8
    max_recording_mb: int = 500

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
