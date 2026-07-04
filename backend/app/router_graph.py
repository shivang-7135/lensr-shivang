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
Return ONLY JSON: {"intent": "<intent>"}

INTENTS (choose the most specific one):

SHOPPING & BUYING:
- shopping: comparing products, 'best X', reviews, buying guidance, product recommendations
- price_history: price tracking, when to buy, sale windows, price drops, deal timing
- gift: gift ideas, presents for someone, gift recommendations

TRAVEL & PLACES:
- trip: travel plans, itineraries, vacation planning, destination ideas, travel tips
- places: restaurants, bars, cafes, attractions, local venues, "where to go"
- food: restaurant recommendations, food delivery, cuisine guides, dining options
- local: local services (plumbers, doctors, lawyers, mechanics, salons)
- weather: weather forecasts, climate info, "what's the weather", best time to visit

ENTERTAINMENT:
- movies: films, TV shows, streaming recommendations, "what to watch", actor info
- books: book recommendations, reading lists, author info, book reviews
- music: songs, artists, albums, playlists, concerts, music recommendations
- events: concerts, festivals, shows, local happenings, ticket info
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
- comparison: X vs Y, comparing options, "which is better"
- news: current events, breaking news, recent happenings
- sports: scores, teams, players, sports news, game results

FALLBACK:
- general: anything that doesn't fit above categories

RULES:
1. Choose the MOST SPECIFIC intent that matches
2. If query mentions "vs" or "compare", use "comparison"
3. If query is about buying/best product, use "shopping"
4. If query asks "how to" do something physical/practical, use "howto" or "diy"
5. If query asks to explain a concept, use "learning"
6. For restaurants/food places, use "food" (not "places")
7. For workout/exercise, use "fitness" (not "health")

OUTPUT FORMAT:
Return JSON with two keys:
- "intent": the chosen intent string
- "confidence": a float between 0.0 and 1.0 indicating how sure you are of this classification
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
    from .observability import span

    with span("classify_intent", span_kind="CHAIN", input_value=query, attributes={"model": "haiku"}):
        try:
            msg = await asyncio.wait_for(
                router_llm().ainvoke([SystemMessage(CLASSIFY_SYS), HumanMessage(query)]),
                timeout=8.0,
            )
        except TimeoutError:
            logger.warning("Intent classification timed out — defaulting to 'general'")
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
            parsed = json.loads(raw)
            intent = parsed.get("intent")
            confidence = parsed.get("confidence", 1.0) # Assume high confidence if not provided
        except Exception:
            intent = "general"
            confidence = 0.0
            
        if intent not in DISPATCH:
            intent = "general"
            
        # Supervisor Logic: If confidence is very low, fallback to general to avoid hallucinated specific schemas
        if confidence < 0.4 and intent != "general":
            logger.info(f"Supervisor override: Intent '{intent}' had low confidence ({confidence}). Falling back to 'general'.")
            intent = "general"
            
        return intent  # type: ignore[return-value]


async def run_stream(query: str, fast_mode: bool = False) -> AsyncIterator[dict]:
    fast_mode_var.set(fast_mode)

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

    # Collect the final result for caching
    final_event = None
    async for evt in DISPATCH[intent](query):
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
