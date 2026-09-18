"""Top-level router: classify intent, dispatch to the adaptive per-intent pipeline."""

from __future__ import annotations

import asyncio
import contextvars
import json
import logging
from collections.abc import AsyncIterator
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage

from .llm import router_llm
from .tools.cache import cache_lookup, cache_store
from .tools.serper import google_search

# Context variable to hold a background search task across intent boundaries
generic_search_task_var = contextvars.ContextVar("generic_search_task")
fast_mode_var = contextvars.ContextVar("fast_mode", default=False)

logger = logging.getLogger(__name__)
from .agents import (
    automotive,
    books,
    comparison,
    dating,
    diy,
    events,
    fashion,
    finance,
    fitness,
    food,
    gaming,
    general,
    gift,
    health,
    howto,
    insta,
    jobs,
    learning,
    legal,
    local,
    movies,
    music,
    news,
    parenting,
    pets,
    places,
    price_history,
    productivity,
    real_estate,
    recipes,
    shopping,
    sports,
    tech,
    trip,
    weather,
)

Intent = Literal[
    "shopping",
    "price_history",
    "trip",
    "insta",
    "general",
    "movies",
    "recipes",
    "books",
    "places",
    "events",
    "tech",
    "health",
    "finance",
    "news",
    "sports",
    "howto",
    "learning",
    "jobs",
    "local",
    "comparison",
    "gift",
    "legal",
    "gaming",
    "diy",
    "fitness",
    "pets",
    "music",
    "productivity",
    "weather",
    "real_estate",
    "automotive",
    "food",
    "fashion",
    "parenting",
    "dating",
]

CLASSIFY_SYS = """Classify the user's search query into exactly one intent.
Return ONLY JSON: {"intent": "<value>"}

INTENTS:
shopping|price_history|gift|trip|places|food|local|weather|movies|books|music|events
- gaming: video games, game guides, walkthroughs, game recommendations

SOCIAL MEDIA:
- insta: Instagram captions, hashtags, photo spots, social media content

KNOWLEDGE & LEARNING:
- tech: programming, software, technology, coding help, tech products
- learning: educational explanations, "explain X", concepts, how things work
- howto: step-by-step instructions, tutorials, "how do I", guides
- diy: home improvement, crafts, repairs, DIY projects

HEALTH & WELLNESS:
- health: medical info, symptoms, treatments, wellness (NOT emergencies)
- fitness: workouts, exercises, training plans, fitness advice
- recipes: cooking instructions, meal ideas, "how to make", ingredients

PROFESSIONAL & FINANCE:
- finance: investing, stocks, budgeting, financial planning, money management
- jobs: career advice, salary info, job hunting, interview prep
- legal: legal questions, rights, laws, procedures (general info only)
- real_estate: home buying/selling, rentals, housing market, neighborhoods

LIFESTYLE:
- automotive: cars, car buying, vehicle reviews, maintenance, repairs
- pets: pet care, breeds, animal health, training, pet products
- fashion: clothing, style advice, trends, outfit ideas
- parenting: child-rearing, kid activities, family advice
- dating: relationships, dating advice, date ideas
- productivity: time management, organization, tools, workflows

COMPARISON & RESEARCH:
|gaming|insta|tech|learning|howto|diy|health|fitness|recipes|finance|jobs|legal
|real_estate|automotive|pets|fashion|parenting|dating|productivity|comparison|news|sports|general

RULES: "best X"/buying→shopping, "vs"/compare→comparison, "how to"→howto/diy,
explain concept→learning, restaurants→food, workout→fitness, default→general
"""

DISPATCH = {
    "shopping": shopping.run_stream,
    "price_history": price_history.run_stream,
    "trip": trip.run_stream,
    "insta": insta.run_stream,
    "general": general.run_stream,
    "movies": movies.run_stream,
    "recipes": recipes.run_stream,
    "books": books.run_stream,
    "places": places.run_stream,
    "events": events.run_stream,
    "tech": tech.run_stream,
    "health": health.run_stream,
    "finance": finance.run_stream,
    "news": news.run_stream,
    "sports": sports.run_stream,
    "howto": howto.run_stream,
    "learning": learning.run_stream,
    "jobs": jobs.run_stream,
    "local": local.run_stream,
    "comparison": comparison.run_stream,
    "gift": gift.run_stream,
    "legal": legal.run_stream,
    "gaming": gaming.run_stream,
    "diy": diy.run_stream,
    "fitness": fitness.run_stream,
    "pets": pets.run_stream,
    "music": music.run_stream,
    "productivity": productivity.run_stream,
    "weather": weather.run_stream,
    "real_estate": real_estate.run_stream,
    "automotive": automotive.run_stream,
    "food": food.run_stream,
    "fashion": fashion.run_stream,
    "parenting": parenting.run_stream,
    "dating": dating.run_stream,
}


async def _classify(query: str) -> Intent:
    from .observability import get_langchain_session_metadata, span

    with span("classify_intent", span_kind="CHAIN", input_value=query, attributes={"model": "haiku"}):
        try:
            # Pass session metadata so LangChain instrumentor propagates session.id
            session_meta = get_langchain_session_metadata()
            config = {"metadata": session_meta} if session_meta else {}
            msg = await asyncio.wait_for(
                router_llm().ainvoke([SystemMessage(CLASSIFY_SYS), HumanMessage(query)], config=config),
                timeout=5.0,  # Reduced from 8s — classification should be fast with compact prompt
            )
        except TimeoutError:
            logger.warning("Intent classification timed out — defaulting to 'general'")
            return "general"  # type: ignore[return-value]
        except Exception as e:
            logger.error("Intent classification failed: %s — defaulting to 'general'", e)
            return "general"  # type: ignore[return-value]
        raw = (
            msg.content
            if isinstance(msg.content, str)
            else "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in msg.content)
        )
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1].lstrip("json").strip().rsplit("```", 1)[0]
        try:
            intent = json.loads(raw).get("intent")
        except Exception:
            intent = "general"

        if intent not in DISPATCH:
            intent = "general"

        return intent  # type: ignore[return-value]


async def run_stream(
    query: str, fast_mode: bool = False, session_id: str | None = None, image_url: str | None = None
) -> AsyncIterator[dict]:
    fast_mode_var.set(fast_mode)

    # Set session ID for Phoenix tracing (groups all traces from one user session)
    from .observability import session_id_var

    if session_id:
        session_id_var.set(session_id)

    # ⚡ Emit a stage event IMMEDIATELY so the UI timeline activates right away.
    # Without this the frontend sits on "Planning research…" for the full LLM
    # classification round-trip (~2-5 s) before the first real event arrives.
    yield {"type": "stage", "stage": "plan"}

    # ⚡ Start search immediately — no LLM wait needed for this
    generic_search_task = asyncio.create_task(google_search(query, num=5 if fast_mode else 3))
    generic_search_task_var.set(generic_search_task)

    # ⚡ Run cache lookup and intent classification CONCURRENTLY
    # Both can run while the search is already fetching results in the background
    classify_task = asyncio.create_task(_classify(query))

    # --- Semantic cache check with timeout (fast mode only) ---
    cached = None
    if fast_mode:
        try:
            cached = await asyncio.wait_for(cache_lookup(query, fast_mode=True), timeout=3.0)
        except (TimeoutError, Exception) as e:
            logger.warning("Cache lookup skipped (timeout/error): %s", e)
            cached = None

    if cached:
        # Cache hit! Cancel the tasks we no longer need.
        classify_task.cancel()
        generic_search_task.cancel()
        intent = cached["intent"]
        yield {"type": "intent_detected", "intent": intent}
        yield {"type": "cache_hit", "cached": True}
        tldr = cached["structured"].get("tldr") or ""
        if tldr:
            yield {"type": "partial_answer", "delta": tldr + "\n\n"}
        yield {
            "type": "final",
            "intent": intent,
            "model": "Instant Cache",
            "structured": cached["structured"],
            "markdown": cached["markdown"] or tldr,
            "sources": cached["sources"],
            "cached": True,
        }
        return

    # --- Cache miss: full pipeline ---
    # Wait for classification (search is already running in background)
    try:
        intent = await classify_task
    except Exception:
        intent = "general"  # type: ignore[assignment]
    yield {"type": "intent_detected", "intent": intent}

    # If image_url is provided, inject it into the query so the insta agent's
    # URL regex can detect and process it for Claude Vision analysis
    dispatch_query = query
    if image_url and intent == "insta":
        dispatch_query = f"{query} {image_url}"

    # Collect the final result for caching
    final_event = None
    async for evt in DISPATCH[intent](dispatch_query):
        if evt.get("type") == "final":
            final_event = evt
        yield evt

    # Store result in cache (fire-and-forget, non-blocking)
    if final_event and final_event.get("structured"):
        asyncio.create_task(
            _store_in_cache(
                query=query,
                intent=intent,
                structured=final_event["structured"],
                markdown=final_event.get("markdown", ""),
                sources=final_event.get("sources", []),
            )
        )


async def _store_in_cache(query: str, intent: str, structured: dict, markdown: str, sources: list) -> None:
    """Background task to store pipeline results in cache."""
    try:
        await cache_store(query, intent, structured, markdown, sources)
    except Exception as e:
        logger.warning("Background cache store failed: %s", e)
