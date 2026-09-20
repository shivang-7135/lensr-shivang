import contextlib
import logging
import sys

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    aws_region: str = ""
    bedrock_model_reasoning: str = ""
    bedrock_model_router: str = ""
    bedrock_model_vision: str = ""

    serper_api_key: str | None = None
    tavily_api_key: str | None = None
    database_url: str | None = None

    backend_shared_secret: str = ""
    cors_allow_origin: str = "http://localhost:3000"
    azure_keyvault_url: str | None = None

    # Semantic cache settings
    cache_enabled: bool = True
    cache_similarity_threshold: float = 0.88
    cache_ttl_hours: int = 24

    # Observability — Arize Phoenix
    phoenix_collector_endpoint: str = "http://localhost:6006/v1/traces"
    phoenix_api_key: str = ""
    otel_service_name: str = "lensr-backend"
    tracing_enabled: bool = True


settings = Settings()

# --- Startup validation ---
_INSECURE_SECRETS = {"", "change-me", "secret", "password"}

if settings.backend_shared_secret in _INSECURE_SECRETS:
    logger.critical(
        "BACKEND_SHARED_SECRET is not set or uses an insecure default. "
        "Set a strong random value via environment variable before running in production."
    )
    # Only allow insecure secret in local dev (CORS points to localhost)
    _is_local = settings.cors_allow_origin.startswith("http://localhost")
    if not _is_local:
        # In non-local environments, refuse to start without a proper secret
        sys.exit(1)

if not settings.serper_api_key:
    logger.warning(
        "SERPER_API_KEY is not set. All web searches will return empty results. "
        "The pipeline will produce low-quality or hallucinated answers."
    )

if settings.cors_allow_origin == "*":
    logger.warning(
        "CORS_ALLOW_ORIGIN is set to '*'. This is insecure for production. "
        "Set it to your frontend domain (e.g. https://lensr.app)."
    )
