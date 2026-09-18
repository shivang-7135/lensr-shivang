import contextlib
import logging
import sys

from pydantic_settings import BaseSettings, SettingsConfigDict

logger = logging.getLogger(__name__)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    aws_region: str
    bedrock_model_reasoning: str
    bedrock_model_router: str
    bedrock_model_vision: str

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

if settings.azure_keyvault_url:
    try:
        from azure.identity import DefaultAzureCredential
        from azure.keyvault.secrets import SecretClient

        credential = DefaultAzureCredential()
        client = SecretClient(vault_url=settings.azure_keyvault_url, credential=credential)

        import os

        with contextlib.suppress(Exception):
            settings.serper_api_key = client.get_secret("SERPER-API-KEY").value

        with contextlib.suppress(Exception):
            settings.backend_shared_secret = client.get_secret("BACKEND-SHARED-SECRET").value

        with contextlib.suppress(Exception):
            settings.database_url = client.get_secret("DATABASE-URL").value

        # Boto3 expects these in os.environ
        try:
            os.environ["AWS_ACCESS_KEY_ID"] = client.get_secret("AWS-ACCESS-KEY-ID").value
            os.environ["AWS_SECRET_ACCESS_KEY"] = client.get_secret("AWS-SECRET-ACCESS-KEY").value
            aws_region = client.get_secret("AWS-REGION").value
            os.environ["AWS_REGION"] = aws_region
            settings.aws_region = aws_region
        except Exception:
            pass

        try:
            settings.bedrock_model_reasoning = client.get_secret("BEDROCK-MODEL-REASONING").value
            settings.bedrock_model_router = client.get_secret("BEDROCK-MODEL-ROUTER").value
        except Exception:
            pass

        with contextlib.suppress(Exception):
            os.environ["APPLICATIONINSIGHTS_CONNECTION_STRING"] = client.get_secret(
                "APPLICATIONINSIGHTS-CONNECTION-STRING"
            ).value

        logger.info("Successfully loaded secrets from Azure Key Vault")
    except Exception as e:
        logger.warning(f"Failed to load secrets from Azure Key Vault: {e}")

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
