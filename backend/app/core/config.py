from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "sqlite:///./nextowner_dev.db"
    SECRET_KEY: str = "dev-only-change-me"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 720
    UPLOAD_DIR: str = "./uploads"
    MAX_UPLOAD_MB: int = 20
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    SEED_DEMO_DATA: bool = True

    # Optional LLM extraction. Leave LLM_API_KEY empty to use the rule-based extractor.
    LLM_PROVIDER: str = "anthropic"
    LLM_API_KEY: str = ""
    LLM_MODEL: str = "claude-sonnet-5-5"
    LLM_BASE_URL: str = "https://api.anthropic.com"

    # Optional: raises the GitHub API rate limit for public repositories.
    GITHUB_TOKEN: str = ""

    @property
    def llm_enabled(self) -> bool:
        return bool(self.LLM_API_KEY) and self.LLM_PROVIDER.lower() == "anthropic"


@lru_cache
def get_settings() -> Settings:
    return Settings()
