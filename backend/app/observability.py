"""Arize Phoenix observability with proper OpenInference semantic conventions.

All spans use openinference.semconv attributes so Phoenix can:
  - Group spans into traces (parent-child)
  - Show proper span kinds (CHAIN, RETRIEVER, LLM, TOOL)
  - Display input/output in the trace view

Environment variables (set on Fly.io):
  PHOENIX_API_KEY             — API key from Phoenix dashboard
  PHOENIX_COLLECTOR_ENDPOINT  — e.g. https://app.phoenix.arize.com/s/shivangsinha2
  PHOENIX_PROJECT_NAME        — Project name in Phoenix (default: "lensr")
  TRACING_ENABLED             — "false" to disable
"""

from __future__ import annotations

import contextvars
import logging
import os
from contextlib import contextmanager
from typing import Any

logger = logging.getLogger(__name__)

_tracer = None
_tracing_enabled = False

# Context variable to propagate session ID across async boundaries
session_id_var: contextvars.ContextVar[str | None] = contextvars.ContextVar("session_id", default=None)

# OpenInference semantic convention attribute names
_OPENINFERENCE_SPAN_KIND = "openinference.span.kind"
_SESSION_ID = "session.id"
_INPUT_VALUE = "input.value"
_INPUT_MIME_TYPE = "input.mime_type"
_OUTPUT_VALUE = "output.value"
_OUTPUT_MIME_TYPE = "output.mime_type"


def setup_tracing() -> None:
    """Call once at startup. Idempotent."""
    global _tracer, _tracing_enabled

    if os.getenv("TRACING_ENABLED", "true").lower() == "false":
        logger.info("Tracing disabled via TRACING_ENABLED=false")
        return

    api_key = os.getenv("PHOENIX_API_KEY", "")
    collector_endpoint = os.getenv("PHOENIX_COLLECTOR_ENDPOINT", "https://app.phoenix.arize.com/s/shivangsinha2")
    project_name = os.getenv("PHOENIX_PROJECT_NAME", "lensr")

    if not api_key:
        logger.warning("PHOENIX_API_KEY not set — tracing disabled")
        return

    try:
        from opentelemetry import trace
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.sdk.resources import Resource
        from opentelemetry.sdk.trace import TracerProvider
        from opentelemetry.sdk.trace.export import BatchSpanProcessor

        base = collector_endpoint.rstrip("/")
        if not base.startswith("http"):
            base = f"https://{base}"
        otlp_endpoint = f"{base}/v1/traces"

        exporter = OTLPSpanExporter(
            endpoint=otlp_endpoint,
            headers={
                "api_key": api_key,
                "authorization": f"Bearer {api_key}",
            },
        )

        resource = Resource.create(
            {
                "service.name": "lensr-backend",
                # This tells Phoenix which project to file traces under
                "project.name": project_name,
                "openinference.project.name": project_name,
            }
        )
        provider = TracerProvider(resource=resource)
        provider.add_span_processor(BatchSpanProcessor(exporter))
        trace.set_tracer_provider(provider)
        _tracer = trace.get_tracer("lensr-backend")

        # Auto-instrument LangChain → gives us detailed LLM spans with prompts/responses
        try:
            from openinference.instrumentation.langchain import LangChainInstrumentor

            LangChainInstrumentor().instrument(tracer_provider=provider)
            logger.info("LangChain auto-instrumented for Phoenix")
        except ImportError:
            logger.warning("openinference-instrumentation-langchain not installed")

        _tracing_enabled = True
        logger.info("Phoenix tracing → %s (project=%s)", otlp_endpoint, project_name)

    except Exception as exc:
        logger.warning("Failed to initialise Phoenix tracing: %s", exc)
        _tracing_enabled = False


@contextmanager
def span(
    name: str,
    span_kind: str = "CHAIN",
    attributes: dict[str, Any] | None = None,
    input_value: str | None = None,
    output_value: str | None = None,
):
    """Create a span with proper OpenInference kind for Phoenix grouping.

    span_kind: CHAIN | RETRIEVER | TOOL | LLM | EMBEDDING | AGENT | RERANKER
    """
    if not _tracing_enabled or _tracer is None:
        yield None
        return

    from opentelemetry.trace import StatusCode

    with _tracer.start_as_current_span(name) as s:
        # Set OpenInference span kind so Phoenix shows proper icons/grouping
        s.set_attribute(_OPENINFERENCE_SPAN_KIND, span_kind)

        # Attach session ID from context variable (propagated from request handler)
        sid = session_id_var.get()
        if sid:
            s.set_attribute(_SESSION_ID, sid)

        if input_value:
            s.set_attribute(_INPUT_VALUE, input_value[:2000])
            s.set_attribute(_INPUT_MIME_TYPE, "text/plain")

        if attributes:
            for k, v in attributes.items():
                if isinstance(v, (str, int, float, bool)):
                    s.set_attribute(k, v)

        try:
            yield s
        except Exception as exc:
            s.set_status(StatusCode.ERROR, str(exc))
            s.record_exception(exc)
            raise
        finally:
            if output_value:
                s.set_attribute(_OUTPUT_VALUE, output_value[:2000])
                s.set_attribute(_OUTPUT_MIME_TYPE, "text/plain")


def get_tracer():
    """Return the configured tracer, or None if tracing is disabled."""
    return _tracer if _tracing_enabled else None


def get_langchain_session_metadata() -> dict[str, str]:
    """Return LangChain metadata dict with session_id for auto-instrumented spans.

    Pass this as `metadata` kwarg to LangChain calls so the OpenInference
    LangChain instrumentor propagates session.id to child spans.
    """
    sid = session_id_var.get()
    if sid:
        return {"session_id": sid}
    return {}
