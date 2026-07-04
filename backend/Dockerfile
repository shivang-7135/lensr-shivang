# --- Build stage ---
FROM python:3.12-slim AS builder
WORKDIR /build
COPY pyproject.toml ./
# Create a temporary setup.cfg to enable non-editable install without source
RUN pip install --no-cache-dir --prefix=/install . || pip install --no-cache-dir --prefix=/install \
    fastapi 'uvicorn[standard]' pydantic pydantic-settings \
    langchain langchain-core langchain-community langchain-aws langgraph \
    boto3 'httpx[http2]' trafilatura sqlalchemy 'psycopg[binary]' python-dotenv \
    arize-phoenix-otel openinference-instrumentation-langchain \
    opentelemetry-sdk opentelemetry-exporter-otlp-proto-http

# --- Runtime stage ---
FROM python:3.12-slim
WORKDIR /app

# Install runtime dependencies from builder
COPY --from=builder /install /usr/local

# Copy application code
COPY app ./app

# Create non-root user
RUN addgroup --system --gid 1001 appuser && \
    adduser --system --uid 1001 --ingroup appuser appuser && \
    chown -R appuser:appuser /app
USER appuser

EXPOSE 8000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://localhost:8000/healthz')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
