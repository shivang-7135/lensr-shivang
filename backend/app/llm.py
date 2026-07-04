"""LLM client configuration with singleton instances and connection warmup.

Uses cached singleton instances to avoid re-creating Bedrock clients per call.
Provides a warmup() function to pre-establish connections at startup.
"""

from __future__ import annotations

import asyncio
import logging

from botocore.config import Config
from langchain_aws import ChatBedrockConverse
from langchain_core.messages import HumanMessage, SystemMessage

from .config import settings

logger = logging.getLogger(__name__)

# Default timeout for LLM requests (seconds)
_REQUEST_TIMEOUT = 60
# Max retries for transient failures (429, 5xx)
_MAX_RETRIES = 3

# ─── Singleton LLM instances ────────────────────────────────────────────────
# Reuse instances to avoid re-creating boto3 clients (saves ~100-200ms per call)
_reasoning_llm: ChatBedrockConverse | None = None
_router_llm: ChatBedrockConverse | None = None
_vision_llm: ChatBedrockConverse | None = None


def reasoning_llm() -> ChatBedrockConverse:
    global _reasoning_llm
    if _reasoning_llm is None:
        _reasoning_llm = ChatBedrockConverse(
            model=settings.bedrock_model_reasoning,
            region_name=settings.aws_region,
            temperature=0.3,
            max_tokens=2048,
            config=Config(
                read_timeout=_REQUEST_TIMEOUT,
                retries={"max_attempts": _MAX_RETRIES},
                tcp_keepalive=True,
            ),
        )
    return _reasoning_llm


def router_llm() -> ChatBedrockConverse:
    global _router_llm
    if _router_llm is None:
        _router_llm = ChatBedrockConverse(
            model=settings.bedrock_model_router,
            region_name=settings.aws_region,
            temperature=0.0,
            max_tokens=256,
            config=Config(
                read_timeout=30,
                retries={"max_attempts": _MAX_RETRIES},
                tcp_keepalive=True,
            ),
        )
    return _router_llm


# ─── Fast synthesis model ────────────────────────────────────────────────────
# Uses the fast Haiku model but with enough tokens for a full synthesis response
_fast_synth_llm: ChatBedrockConverse | None = None


def fast_synthesis_llm() -> ChatBedrockConverse:
    global _fast_synth_llm
    if _fast_synth_llm is None:
        _fast_synth_llm = ChatBedrockConverse(
            model=settings.bedrock_model_router,  # Haiku — fast
            region_name=settings.aws_region,
            temperature=0.3,
            max_tokens=1024,  # Enough for a concise structured answer
            config=Config(
                read_timeout=_REQUEST_TIMEOUT,
                retries={"max_attempts": _MAX_RETRIES},
                tcp_keepalive=True,
            ),
        )
    return _fast_synth_llm


def vision_llm() -> ChatBedrockConverse:
    global _vision_llm
    if _vision_llm is None:
        _vision_llm = ChatBedrockConverse(
            model=settings.bedrock_model_vision,
            region_name=settings.aws_region,
            temperature=0.4,
            max_tokens=1024,
            config=Config(
                read_timeout=_REQUEST_TIMEOUT,
                retries={"max_attempts": _MAX_RETRIES},
                tcp_keepalive=True,
            ),
        )
    return _vision_llm


async def warmup() -> None:
    """Pre-warm Bedrock connections at startup to eliminate cold-start latency.

    Sends a trivial prompt to each model tier to establish TCP/TLS connections.
    This shaves ~1-2s off the first real user request.
    """
    logger.info("Warming up Bedrock LLM connections...")

    async def _ping(llm_fn, name: str) -> None:
        try:
            llm = llm_fn()
            await asyncio.wait_for(
                llm.ainvoke([SystemMessage("Reply with OK"), HumanMessage("ping")]),
                timeout=15.0,
            )
            logger.info("  ✓ %s warmed up", name)
        except Exception as e:
            logger.warning("  ✗ %s warmup failed (non-fatal): %s", name, e)

    # Warm up router (most critical for first-request latency) and reasoning in parallel
    await asyncio.gather(
        _ping(router_llm, "router (Haiku)"),
        _ping(reasoning_llm, "reasoning (Sonnet)"),
    )
    logger.info("Bedrock warmup complete.")
