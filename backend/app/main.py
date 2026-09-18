"""FastAPI entrypoint with SSE streaming."""

from __future__ import annotations

import asyncio
import hmac
import json
import logging
import uuid
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

logger = logging.getLogger(__name__)

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
from pydantic import BaseModel, Field

from .config import settings
from .observability import setup_tracing
from .router_graph import run_stream


@asynccontextmanager
async def lifespan(_app: FastAPI):
    # Initialise Phoenix tracing once at startup
    setup_tracing()

    # Pre-warm LLM connections in background so the server accepts requests immediately
    from .llm import warmup as llm_warmup

    asyncio.create_task(llm_warmup())

    yield

    # Gracefully close persistent connection pools
    from .tools.scraper import shutdown_scraper
    from .tools.serper import shutdown_clients

    await shutdown_clients()
    await shutdown_scraper()


app = FastAPI(title="Lensr backend", lifespan=lifespan)

# Parse CORS origins — support comma-separated list
_allowed_origins = [o.strip() for o in settings.cors_allow_origin.split(",") if o.strip()]
app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins,
    allow_methods=["POST", "GET", "OPTIONS"],
    allow_headers=["content-type", "authorization", "x-backend-secret"],
)

# --- Constants ---
MAX_QUERY_LENGTH = 2000


class SearchBody(BaseModel):
    query: str = Field(..., max_length=MAX_QUERY_LENGTH)
    intent_hint: str | None = Field(default=None, max_length=100)
    fast_mode: bool | None = Field(default=False)
    session_id: str | None = Field(
        default=None, max_length=64, description="Client session ID for Phoenix trace grouping"
    )
    image_url: str | None = Field(default=None, max_length=2048, description="Signed image URL for vision analysis")


def _check_secret(provided: str | None) -> None:
    """Timing-safe comparison for the backend shared secret."""
    expected = settings.backend_shared_secret
    if not expected:
        # No secret configured — allow (local dev only, startup warns)
        return
    if not provided:
        raise HTTPException(401, "Missing authentication")
    # Use hmac.compare_digest for timing-safe comparison
    if not hmac.compare_digest(provided.encode(), expected.encode()):
        raise HTTPException(401, "Bad shared secret")


@app.get("/healthz")
async def healthz():
    return {"ok": True}


@app.post("/search")
async def search(body: SearchBody, x_backend_secret: str | None = Header(default=None)):
    _check_secret(x_backend_secret)
    request_id = str(uuid.uuid4())[:8]
    # Use client-provided session_id or generate one per request
    session_id = body.session_id or str(uuid.uuid4())

    async def gen() -> AsyncIterator[bytes]:
        try:
            async for evt in run_stream(
                body.query, fast_mode=body.fast_mode or False, session_id=session_id, image_url=body.image_url
            ):
                yield f"data: {json.dumps(evt)}\n\n".encode()
        except Exception as e:  # noqa: BLE001
            logger.exception("Stream error [%s]: %s", request_id, e)
            # Send sanitized error to client — never expose internal details
            yield f"data: {json.dumps({'type': 'error', 'message': 'An error occurred processing your request.', 'request_id': request_id})}\n\n".encode()

    return StreamingResponse(gen(), media_type="text/event-stream")


@app.post("/cache/clear")
async def clear_cache(x_backend_secret: str | None = Header(default=None)):
    """Clear the entire semantic cache. Admin-only (requires shared secret)."""
    _check_secret(x_backend_secret)

    if not settings.database_url or "user:pass@localhost" in settings.database_url:
        return JSONResponse({"cleared": 0, "message": "No database configured"})

    try:
        import psycopg

        async with await psycopg.AsyncConnection.connect(settings.database_url) as conn:
            async with conn.cursor() as cur:
                await cur.execute("DELETE FROM public.search_cache")
                deleted = cur.rowcount
            await conn.commit()
        logger.info("Cache cleared: %d entries removed", deleted)
        return JSONResponse({"cleared": deleted, "message": f"Cleared {deleted} cached entries"})
    except Exception as e:
        logger.exception("Cache clear failed: %s", e)
        raise HTTPException(500, "Failed to clear cache") from e


@app.exception_handler(Exception)
async def all_errors(_req: Request, exc: Exception):
    request_id = str(uuid.uuid4())[:8]
    logger.exception("Unhandled error [%s]: %s", request_id, exc)
    return JSONResponse(
        {"error": "Internal server error", "request_id": request_id},
        status_code=500,
    )
