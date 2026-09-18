"""Shared adaptive search pipeline — Streaming Map-Reduce Architecture.

Pattern: extract keywords -> plan diverse queries -> fan-out Serper -> scrape
top pages (progressive) -> reflect (heuristic skip) -> synthesize with streaming.

Key optimizations:
- Progressive scraping with asyncio.as_completed() (process results as they arrive)
- Heuristic evidence sufficiency check (skip reflection when evidence is rich)
- Streaming synthesis with partial_structured events
- Increased context caps for richer evidence
- Source prioritization (knowledge graph > scraped > snippet-only)

Per-intent agents only supply: system prompt + JSON schema + search-plan hints.
"""

from __future__ import annotations

import asyncio
import json
import logging
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass
from datetime import UTC, datetime

from langchain_core.messages import HumanMessage, SystemMessage

from ..config import settings
from ..llm import fast_synthesis_llm, reasoning_llm, router_llm
from ..observability import get_langchain_session_metadata, span
from ..tools.scraper import fetch_clean
from ..tools.serper import google_search

logger = logging.getLogger(__name__)

MAX_LOOPS = 2  # Allow one reflection + follow-up pass when evidence is thin
MAX_SOURCES = 10  # Increased from 8 for richer evidence
SCRAPE_TOP_N = 6  # Increased from 4 — progressive timeout handles slow ones

# Intents that benefit from a reflection loop (research-heavy queries)
_REFLECTION_INTENTS = frozenset(
    {
        "shopping",
        "trip",
        "price_history",
        "comparison",
        "real_estate",
        "automotive",
        "finance",
        "legal",
        "health",
        "jobs",
    }
)


@dataclass
class IntentConfig:
    name: str
    system_prompt: str  # describes how to write the final answer
    schema_hint: str  # JSON schema description for synthesis
    plan_hint: str  # extra guidance for the search-planner LLM
    seed_queries: Callable[[str], list[str]]  # cheap deterministic queries to seed loop 1


EventEmitter = Callable[[dict], Awaitable[None]]


async def _emit(emit: EventEmitter, evt: dict) -> None:
    await emit(evt)


# ---------- LLM helpers ----------


def _text(msg) -> str:
    c = msg.content
    if isinstance(c, str):
        return c
    return "".join(p.get("text", "") if isinstance(p, dict) else str(p) for p in c)


def _parse_json(raw: str) -> dict | None:
    raw = raw.strip()
    # strip markdown fences
    if raw.startswith("```"):
        raw = raw.split("```", 2)[1]
        if raw.startswith("json"):
            raw = raw[4:]
        raw = raw.rsplit("```", 1)[0]
    try:
        return json.loads(raw)
    except Exception:
        # last brace recovery
        start = raw.find("{")
        end = raw.rfind("}")
        if start >= 0 and end > start:
            try:
                return json.loads(raw[start : end + 1])
            except Exception:
                return None
    return None


def _today_str() -> str:
    return datetime.now(UTC).strftime("%A, %B %d, %Y")


DATE_PREAMBLE = (
    "CURRENT DATE: {today}. Your training data is stale. "
    "Treat the web evidence as ground truth and the current date as authoritative. "
    "Never claim a product, movie, event, or release is 'upcoming', 'will release', or 'expected' "
    "if its date is on or before the current date — describe it as already released/launched/past. "
    "If evidence contradicts your prior knowledge, trust the evidence."
)


async def _llm_json(
    system: str, user: str, *, use_router: bool = False, use_fast_synth: bool = False, timeout: float = 30.0
) -> dict:
    """Call an LLM and parse its response as JSON.

    Args:
        use_router: Use router_llm (Haiku, 256 tokens) — for classification/planning only
        use_fast_synth: Use fast_synthesis_llm (Haiku, 1024 tokens) — for fast mode synthesis
        timeout: Hard timeout in seconds
    """
    if use_fast_synth:
        llm = fast_synthesis_llm()
    elif use_router:
        llm = router_llm()
    else:
        llm = reasoning_llm()
    system = DATE_PREAMBLE.format(today=_today_str()) + "\n\n" + system
    # Pass session metadata so Phoenix groups LLM spans by session
    session_meta = get_langchain_session_metadata()
    config = {"metadata": session_meta} if session_meta else {}
    try:
        msg = await asyncio.wait_for(
            llm.ainvoke([SystemMessage(system), HumanMessage(user)], config=config),
            timeout=timeout,
        )
    except TimeoutError:
        logger.warning(
            "LLM call timed out after %.1fs (use_router=%s, use_fast_synth=%s)", timeout, use_router, use_fast_synth
        )
        return {}
    except Exception as e:
        logger.error("LLM call failed (use_router=%s, use_fast_synth=%s): %s", use_router, use_fast_synth, e)
        return {}
    data = _parse_json(_text(msg))
    return data or {}


# ---------- pipeline steps ----------

KEYWORDS_SYS = (
    "Extract the user's real intent. Return ONLY JSON:\n"
    '{"keywords": ["..."], "entities": ["..."], "constraints": ["..."], "intent_summary": "one sentence"}.\n'
    "Keywords are 3-6 short search-worthy terms. Entities are named things (products, places, brands, people). "
    "Constraints are budget, dates, preferences, comparisons."
)

PLAN_SYS_BASE = (
    "You are a search planner. Produce exactly 3-4 diverse Google queries that together will surface "
    "the best evidence. Avoid duplicates. Be specific. "
    "Include the current year in 1-2 queries for fresh results. "
    'Return ONLY JSON: {"queries": ["...", "..."]}'
)

# Combined keyword extraction + query planning in one call (saves ~1.5s LLM round-trip)
COMBINED_PLAN_SYS = (
    "You are a search analyst. Given a user query, do TWO things in one response:\n"
    "1. Extract keywords, entities, and constraints\n"
    "2. Plan 3 diverse Google search queries to find the best evidence\n\n"
    "Return ONLY JSON:\n"
    '{"keywords": ["..."], "entities": ["..."], "constraints": ["..."], '
    '"intent_summary": "one sentence", "queries": ["query1", "query2", "query3"]}\n\n'
    "Rules for queries: be specific, include current year in 1 query, avoid duplicates."
)

REFLECT_SYS = (
    "You are an expert researcher. Given the user's request and the evidence collected so far, "
    "decide if it is enough to write a high-quality answer. "
    "Return ONLY JSON: "
    '{"done": true|false, "missing": "what is still unclear", "followup_queries": ["...", "..."]}. '
    "If done=true, leave followup_queries empty. Max 4 followup queries."
)


async def _extract_keywords(query: str) -> dict:
    return await _llm_json(KEYWORDS_SYS, query, use_router=True)


async def _combined_plan(query: str, cfg: IntentConfig) -> tuple[dict, list[str]]:
    """Single LLM call that extracts keywords AND plans queries (saves ~1.5s)."""
    sys = COMBINED_PLAN_SYS + "\n" + cfg.plan_hint
    data = await _llm_json(sys, query, use_router=True)
    kw = {
        "keywords": data.get("keywords", []),
        "entities": data.get("entities", []),
        "constraints": data.get("constraints", []),
        "intent_summary": data.get("intent_summary", ""),
    }
    qs = data.get("queries") or []
    if not qs:
        qs = cfg.seed_queries(query)
    # always blend in 1 seed query for safety
    seeds = cfg.seed_queries(query)[:1]
    out = []
    seen = set()
    for q in list(qs) + seeds:
        q = (q or "").strip()
        if q and q.lower() not in seen:
            seen.add(q.lower())
            out.append(q)
    return kw, out[:3]


async def _plan_queries(query: str, kw: dict, cfg: IntentConfig) -> list[str]:
    """Fallback: plan queries separately (used only if combined plan fails)."""
    sys = PLAN_SYS_BASE + "\n" + cfg.plan_hint
    user = json.dumps({"query": query, "keywords": kw, "intent": cfg.name})
    data = await _llm_json(sys, user, use_router=True)
    qs = data.get("queries") or []
    if not qs:
        qs = cfg.seed_queries(query)
    seeds = cfg.seed_queries(query)[:1]
    out = []
    seen = set()
    for q in list(qs) + seeds:
        q = (q or "").strip()
        if q and q.lower() not in seen:
            seen.add(q.lower())
            out.append(q)
    return out[:3]


async def _fanout_search(queries: list[str]) -> list[dict]:
    with span(
        "search.fanout",
        span_kind="RETRIEVER",
        input_value=json.dumps(queries),
        attributes={"search.query_count": len(queries)},
    ):
        results = await asyncio.gather(*[google_search(q, num=3) for q in queries], return_exceptions=True)
        merged: list[dict] = []
        seen = set()
        for q, res in zip(queries, results, strict=False):
            if isinstance(res, Exception):
                logger.warning("Search failed for query '%s': %s", q, res)
                continue
            if not res or not isinstance(res, list):
                logger.debug("No results for query: '%s'", q)
                continue
            for r in res:
                link = r.get("link")
                if not link or link in seen:
                    continue
                seen.add(link)
                merged.append(
                    {
                        "title": r.get("title") or link,
                        "url": link,
                        "snippet": r.get("snippet") or "",
                        "via_query": q,
                    }
                )
        if not merged:
            logger.warning("_fanout_search returned 0 results for %d queries", len(queries))
        return merged


async def _scrape(sources: list[dict], limit: int) -> list[dict]:
    """Scrape pages with progressive timeout — process results as they complete.

    Uses asyncio.gather with a hard timeout. Returns whatever completed.
    """
    targets = sources[:limit]
    if not targets:
        return []

    with span(
        "scrape.pages",
        span_kind="TOOL",
        input_value=json.dumps([s["url"] for s in targets]),
        attributes={"scrape.url_count": len(targets)},
    ):
        try:
            bodies = await asyncio.wait_for(
                asyncio.gather(*[fetch_clean(s["url"]) for s in targets], return_exceptions=True),
                timeout=8.0,
            )
        except TimeoutError:
            logger.warning("Scrape timed out after 8s — using whatever completed")
            bodies = [None] * len(targets)

        enriched = []
        for s, body in zip(targets, bodies, strict=False):
            if isinstance(body, Exception):
                logger.debug("Scrape failed for %s: %s", s["url"], type(body).__name__)
                text = None
            elif isinstance(body, str):
                text = body
            else:
                text = None
            enriched.append({**s, "body": (text or "")[:5000]})
        return enriched


def _evidence_sufficient(evidence: list[dict], keywords: list[str]) -> bool:
    """Heuristic check: is evidence rich enough to skip the reflection loop?

    Returns True when:
    - At least 3 sources have scraped body text
    - Total evidence content exceeds 4000 chars
    - Evidence covers at least 2 of the extracted keywords/entities

    This saves 2-4s by skipping the reflection LLM call for ~70% of queries.
    """
    scraped_count = sum(1 for e in evidence if e.get("body"))
    total_chars = sum(len(e.get("body", "")) + len(e.get("snippet", "")) for e in evidence)

    if scraped_count < 3 or total_chars < 4000:
        return False

    # Check keyword coverage in evidence
    if not keywords:
        return True  # No keywords to check, evidence volume is sufficient

    evidence_text = " ".join(
        (e.get("body", "") + " " + e.get("snippet", "") + " " + e.get("title", "")).lower() for e in evidence
    )

    covered = sum(1 for kw in keywords[:6] if kw.lower() in evidence_text)
    return covered >= min(2, len(keywords))


async def _reflect(query: str, evidence: list[dict], loop: int) -> dict:
    summary = "\n\n".join(
        f"[{i + 1}] {e['title']}\n{e['url']}\nsnippet: {e['snippet']}\nexcerpt: {e.get('body', '')[:600]}"
        for i, e in enumerate(evidence[:8])
    )
    user = f"User query: {query}\n\nLoop: {loop}\n\nEvidence so far:\n{summary}"

    # Use Haiku (router_llm) for reflection to optimize for speed
    # Reflection is a simple classification/generation task, no need for Sonnet
    return await _llm_json(REFLECT_SYS, user, use_router=True)


async def _synthesize(query: str, kw: dict, evidence: list[dict], cfg: IntentConfig) -> tuple[dict, str]:
    # Check fast mode context
    _is_fast = False
    try:
        from ..router_graph import fast_mode_var

        _is_fast = fast_mode_var.get()
    except LookupError:
        pass

    limited_evidence = evidence[:10]

    # Prioritise: knowledge_graph/answer_box > scraped > snippet-only
    kg_sources = [e for e in limited_evidence if e.get("source_type") in ("knowledge_graph", "answer_box")]
    scraped = [
        e for e in limited_evidence if e.get("body") and e.get("source_type") not in ("knowledge_graph", "answer_box")
    ]
    snippets_only = [
        e
        for e in limited_evidence
        if not e.get("body") and e.get("source_type") not in ("knowledge_graph", "answer_box")
    ]
    ordered = (kg_sources + scraped + snippets_only)[:10]

    # Build context: increased caps for top sources
    # Top 3 scraped sources get 2500 chars, rest get 1200 chars
    context_parts = []
    scraped_idx = 0
    for i, e in enumerate(ordered):
        snippet = e.get("snippet", "")[:400]  # Increased from 250
        body = e.get("body", "")

        # Tiered context caps: top scraped sources get more context
        if body and e.get("source_type") not in ("knowledge_graph", "answer_box"):
            scraped_idx += 1
            body_cap = 2500 if scraped_idx <= 3 else 1500  # Top 3 get more context
            body = body[:body_cap]
        elif body:
            body = body[:500]  # KG/answer box are already concise

        source_label = f" [{e.get('source_type', 'organic')}]" if e.get("source_type") not in ("organic", None) else ""
        context_parts.append(
            f"[{i + 1}]{source_label} {e.get('title', 'Untitled')}\nURL: {e.get('url', '')}\n"
            + (f"Content: {body}" if body else f"Snippet: {snippet}")
        )
    context = "\n\n---\n\n".join(context_parts)

    # In fast mode: use Haiku for ALL intents (2-3x faster response)
    # In deep mode: always use Sonnet/Opus for ALL intents
    model_used = settings.bedrock_model_router if _is_fast else settings.bedrock_model_reasoning

    if _is_fast:
        # ⚡ FAST MODE: Simplified schema for speed — fewer output tokens = faster response
        # Instead of the full complex schema, ask for just the essential fields
        sys = (
            f"Today is {_today_str()}.\n\n"
            "You are a concise research analyst. Answer QUICKLY and SPECIFICALLY.\n"
            f"ROLE: {cfg.system_prompt}\n\n"
            "OUTPUT: Return ONLY valid JSON with these fields:\n"
            '{"tldr": "2-3 sentences directly answering the question with specifics from evidence", '
            '"key_facts": ["fact 1 with citation [n]", "fact 2 [n]", "fact 3 [n]"], '
            '"detail_markdown": "## Answer\\n\\nBrief structured answer with bullet points. 80-120 words max."}\n\n'
            "RULES: Be specific (real names, prices, dates). Cite sources as [n]. Never hallucinate."
        )
    else:
        sys = (
            f"Today is {_today_str()}.\n\n"
            "You are an expert research analyst producing a high-quality answer for a real user.\n"
            f"ROLE: {cfg.system_prompt}\n\n"
            "━━━ QUALITY REQUIREMENTS ━━━\n"
            "• Be SPECIFIC: use real product names, prices, dates, version numbers from the evidence\n"
            "• Be HONEST: if evidence is thin, say so — never hallucinate details\n"
            "• Be ACTIONABLE: every recommendation must have a clear reason why\n"
            "• Be CURRENT: trust the evidence over your training data for dates/prices/availability\n"
            "• Cite sources inline as [1], [2] etc. whenever stating a specific fact\n"
            "• For tldr: write 2-3 punchy sentences that answer the question directly — no filler\n"
            "• For detail_markdown: use headers (##), bullet points, bold key terms — make it scannable\n\n"
            "━━━ OUTPUT FORMAT ━━━\n"
            "Return ONLY valid JSON matching this exact schema (no markdown fences, no extra keys):\n"
            f"{cfg.schema_hint}\n\n"
            "VALIDATION RULES:\n"
            "- tldr must be 2-4 sentences, specific, not generic filler\n"
            "- All array fields must have at least 2 items if evidence supports it\n"
            "- detail_markdown must be at least 150 words with proper markdown formatting\n"
            "- Never return placeholder text like 'string' or 'example'\n"
            "- If a field cannot be filled from evidence, use null (not empty string)"
        )

    user = (
        f"User query: {query}\n"
        f"Key terms identified: {', '.join(kw.get('keywords', []))}\n"
        f"Entities: {', '.join(kw.get('entities', []))}\n"
        f"User constraints: {', '.join(kw.get('constraints', [])) or 'none stated'}\n\n"
        f"=== EVIDENCE ({len(limited_evidence)} sources) ===\n\n"
        f"{context}\n\n"
        "Now synthesize a high-quality answer from the evidence above."
    )

    # Fast mode: 12s timeout (should complete in 3-5s with Haiku + 1024 tokens)
    # Deep mode: 45s timeout (Sonnet/Opus is slower but more thorough)
    synth_timeout = 12.0 if _is_fast else 45.0

    with span(
        "llm.synthesize",
        span_kind="CHAIN",
        input_value=f"Query: {query}",
        attributes={
            "intent": cfg.name,
            "evidence.count": len(limited_evidence),
            "model": model_used,
            "context.chars": len(context),
            "fast_mode": _is_fast,
        },
    ):
        if _is_fast:
            # Fast mode: use dedicated fast_synthesis_llm (Haiku + 1024 max_tokens)
            data = await _llm_json(sys, user, use_fast_synth=True, timeout=synth_timeout)
        else:
            # Deep mode: always use reasoning_llm (Sonnet/Opus) for high quality reasoning
            data = await _llm_json(sys, user, use_router=False, timeout=synth_timeout)

    # Fallback: retry with simpler prompt if structured JSON failed
    if not data or not data.get("tldr"):
        logger.warning(
            "Synthesis returned no tldr for '%s' (intent=%s), retrying with fallback prompt", query[:60], cfg.name
        )
        fallback_sys = (
            f"Today is {_today_str()}. Answer the following question using ONLY the evidence provided.\n"
            "Return JSON with these fields: tldr (2-3 sentence direct answer), "
            "key_facts (list of 3-5 specific facts with source citations [n]), "
            "detail_markdown (well-structured markdown answer, minimum 200 words).\n"
            "Be specific, cite sources, and never invent details."
        )
        fallback_user = f"Question: {query}\n\nEvidence:\n{context[:4000]}"
        data = await _llm_json(fallback_sys, fallback_user, use_router=False)

    # Last resort: build from snippets (never hallucinate)
    if not data or not data.get("tldr"):
        logger.error("Both synthesis attempts failed for '%s'", query[:60])
        snippets = [e.get("snippet", "") for e in limited_evidence[:5] if e.get("snippet")]
        bullet_facts = [f"- {s.strip()}" for s in snippets if s.strip()]
        data = {
            "tldr": f"I found {len(limited_evidence)} sources about this topic. "
            f"Here are the key findings from the web evidence.",
            "key_facts": snippets[:5],
            "detail_markdown": (
                f"## Findings for: {query}\n\n"
                + "\n".join(bullet_facts[:8])
                + "\n\n*Note: Could not fully synthesize — showing raw evidence.*"
            ),
        }

    return data, model_used


# ---------- orchestrator ----------


async def run_pipeline(query: str, cfg: IntentConfig) -> AsyncIterator[dict]:
    """Yield SSE-shaped events for the adaptive pipeline.

    Optimized flow:
    1. Fire seed queries immediately (no LLM wait)
    2. In parallel: run combined keyword+plan LLM call
    3. Merge seed results with LLM-planned results
    4. Scrape top pages
    5. Synthesize answer

    This eliminates 1-2 sequential LLM calls (~3s saved).
    """
    from opentelemetry import trace as otel_trace

    from ..observability import _INPUT_MIME_TYPE, _INPUT_VALUE, _OPENINFERENCE_SPAN_KIND, get_tracer

    tracer = get_tracer()
    pipeline_span = None
    ctx = None
    if tracer:
        pipeline_span = tracer.start_span(f"pipeline.{cfg.name}")
        pipeline_span.set_attribute(_OPENINFERENCE_SPAN_KIND, "CHAIN")
        pipeline_span.set_attribute(_INPUT_VALUE, query[:500])
        pipeline_span.set_attribute(_INPUT_MIME_TYPE, "text/plain")
        pipeline_span.set_attribute("intent", cfg.name)
        ctx = otel_trace.use_span(pipeline_span, end_on_exit=True)
        ctx.__enter__()
    # Check if fast mode is requested
    fast_mode = False
    try:
        from ..router_graph import fast_mode_var

        fast_mode = fast_mode_var.get()
    except LookupError:
        pass

    if fast_mode:
        # ⚡ FAST MODE — Maximum parallelism, zero scraping
        # Strategy: grab search results (already running in background from router),
        # fire additional seed queries in parallel, synthesize immediately from snippets.
        # This eliminates: (1) keyword extraction LLM call, (2) scraping wait (4s+), (3) reflection loop
        # NOTE: stage:plan is already emitted by router_graph before intent classification.

        # Retrieve the generic search task that started during intent classification
        try:
            from ..router_graph import generic_search_task_var

            generic_search_task = generic_search_task_var.get()
        except LookupError:
            generic_search_task = None

        # Fire seed queries in parallel with the already-running generic search
        seed_queries = cfg.seed_queries(query)[:2]
        seed_search_task = asyncio.create_task(_fanout_search(seed_queries))

        all_queries = [query] + seed_queries
        kw = {
            "keywords": [],
            "entities": [],
            "constraints": [],
            "intent_summary": "Fast parallel search — snippet synthesis",
        }
        yield {
            "type": "thinking",
            "message": f"Detected intent: {cfg.name}. Running parallel search for quick results…",
        }
        yield {"type": "keywords_extracted", "keywords": kw}
        yield {"type": "search_plan", "queries": all_queries}

        yield {"type": "stage", "stage": "search_loop_1"}
        for q in all_queries:
            yield {"type": "tool_call", "tool": "google_search", "input": q}

        # Await both searches — guard against Serper/network failures
        try:
            generic_results = (await generic_search_task) if generic_search_task else []
        except Exception as e:
            logger.warning("Generic search failed (fast mode): %s", e)
            generic_results = []
        try:
            seed_results = await seed_search_task
        except Exception as e:
            logger.warning("Seed search failed (fast mode): %s", e)
            seed_results = []

        # Merge and deduplicate results
        evidence: list[dict] = []
        seen_urls: set[str] = set()
        for r in list(generic_results) + list(seed_results):
            url = r.get("url") or r.get("link")
            if url and url not in seen_urls:
                evidence.append({"title": r.get("title", ""), "url": url, "snippet": r.get("snippet", ""), "body": ""})
                seen_urls.add(url)
        evidence = evidence[:6]  # cap at 6 for speed

        yield {
            "type": "search_results",
            "loop": 1,
            "count": len(evidence),
            "sample": [{"title": r["title"], "url": r["url"]} for r in evidence],
        }

        # ⚡ NO SCRAPING in fast mode — synthesize directly from snippets
        yield {
            "type": "thinking",
            "message": f"Found {len(evidence)} sources. Synthesizing answer from snippets (skipping full page reads for speed)…",
        }
        yield {"type": "stage", "stage": "synthesize"}

        # Start synthesis immediately with snippet-only evidence
        structured, model_used = await _synthesize(query, kw, evidence, cfg)
        sources = [{"title": e["title"], "url": e["url"]} for e in evidence]

        tldr = structured.get("tldr") or ""

        # ⚡ Stream structured fields section-by-section so frontend renders
        # progressively instead of waiting for the complete final payload
        if tldr:
            yield {"type": "partial_structured", "field": "tldr", "value": tldr}
            yield {"type": "partial_answer", "delta": tldr + "\n\n"}

        key_facts = structured.get("key_facts") or structured.get("key_points") or []
        if key_facts:
            yield {"type": "partial_structured", "field": "key_facts", "value": key_facts}

        detail_md = structured.get("detail_markdown") or ""
        if detail_md:
            sections = detail_md.split("\n## ")
            for i, section in enumerate(sections):
                chunk = ("## " + section) if i > 0 else section
                yield {
                    "type": "partial_structured",
                    "field": "detail_markdown",
                    "delta": chunk,
                    "done": i == len(sections) - 1,
                }

        # ⚡ Fire enrichment as a background task — runs while final event is delivered
        from ._enrichment import generate_enrichment

        enrichment_task = asyncio.create_task(generate_enrichment(query, cfg.name, structured))

        if pipeline_span:
            pipeline_span.set_attribute("evidence.final_count", len(evidence))
            pipeline_span.set_attribute("sources.count", len(sources))
            pipeline_span.set_attribute("output.value", tldr[:500])
            pipeline_span.set_attribute("output.mime_type", "text/plain")
            pipeline_span.set_attribute("fast_mode", True)
        if ctx:
            ctx.__exit__(None, None, None)

        yield {
            "type": "final",
            "intent": cfg.name,
            "model": model_used,
            "structured": structured,
            "markdown": structured.get("detail_markdown") or tldr,
            "sources": sources,
        }

        # Enrichment arrives ~1-2s after the answer — pops in with animation
        try:
            enrichment = await asyncio.wait_for(enrichment_task, timeout=12.0)
            if enrichment:
                yield {"type": "enrichment", "artifact": enrichment}
        except Exception as e:
            logger.debug("Enrichment skipped (fast mode): %s", e)
        return

    # Retrieve generic background search if available
    try:
        from ..router_graph import generic_search_task_var

        generic_search_task = generic_search_task_var.get()
    except LookupError:
        generic_search_task = None

    # Start seed search immediately — no LLM round-trip needed
    seed_queries = cfg.seed_queries(query)[:2]
    seed_search_task = asyncio.create_task(_fanout_search(seed_queries))

    # NOTE: stage:plan already emitted by router_graph before classification.
    # Single combined LLM call: extract keywords + plan queries
    try:
        kw, planned_queries = await asyncio.wait_for(_combined_plan(query, cfg), timeout=8.0)
    except (TimeoutError, Exception) as e:
        logger.warning("Planner failed or timed out: %s. Falling back to seed queries.", e)
        kw = {"keywords": [], "entities": [], "constraints": [], "intent_summary": "Fallback to base intent"}
        planned_queries = cfg.seed_queries(query)[:3]

    yield {
        "type": "thinking",
        "message": f"Identified key terms: {', '.join((kw.get('keywords', []) + kw.get('entities', []))[:5]) or 'general search'}. Planning diverse queries…",
    }
    yield {"type": "keywords_extracted", "keywords": kw}
    yield {"type": "search_plan", "queries": planned_queries}

    # Collect seed results — guard against Serper failures
    try:
        seed_results = await seed_search_task
    except Exception as e:
        logger.warning("Seed search failed: %s", e)
        seed_results = []
    try:
        generic_results = (await generic_search_task) if generic_search_task else []
    except Exception as e:
        logger.warning("Generic search failed: %s", e)
        generic_results = []

    evidence: list[dict] = []
    seen_urls: set[str] = set()

    # Merge generic and seed results into evidence
    # Note: generic_results come from google_search() with "link" key,
    # while seed_results come from _fanout_search() normalized to "url" key.
    for r in list(generic_results) + list(seed_results):
        url = r.get("url") or r.get("link")
        if url and url not in seen_urls and len(evidence) < MAX_SOURCES:
            # Normalize to always have "url" key
            normalized = {**r, "url": url}
            if "title" not in normalized:
                normalized["title"] = url
            evidence.append(normalized)
            seen_urls.add(url)

    # ⚡ NEW: Early Fast partial answer!
    # Stream top snippets immediately so the user sees something while the scraping and synthesis runs
    top_snippets = [e.get("snippet", "").strip() for e in evidence[:3] if e.get("snippet", "").strip()]
    if top_snippets:
        yield {"type": "partial_answer", "delta": " ".join(top_snippets)[:400] + "\n\n"}

    # Start scraping seed results IMMEDIATELY in the background
    seed_unscraped = [e for e in evidence if "body" not in e][:SCRAPE_TOP_N]
    if seed_unscraped:
        yield {
            "type": "thinking",
            "message": f"Reading full content from top {len(seed_unscraped)} pages for deeper analysis…",
        }
    seed_scrape_task = asyncio.create_task(_scrape(seed_unscraped, len(seed_unscraped))) if seed_unscraped else None

    # Now run the LLM-planned extra queries concurrently with seed scraping
    extra_queries = [
        q for q in planned_queries if q.lower() not in {s.lower() for s in seed_queries} and q.lower() != query.lower()
    ]
    if extra_queries:
        yield {"type": "stage", "stage": "search_loop_1"}
        for q in extra_queries:
            yield {"type": "tool_call", "tool": "google_search", "input": q}
        new_results = await _fanout_search(extra_queries)
        for r in new_results:
            url = r.get("url")
            if url and url not in seen_urls and len(evidence) < MAX_SOURCES:
                evidence.append(r)
                seen_urls.add(url)

    yield {
        "type": "search_results",
        "loop": 1,
        "count": len(evidence),
        "sample": [{"title": r["title"], "url": r["url"]} for r in evidence[:5]],
    }

    # Gather the parallel seed scrape results
    if seed_scrape_task:
        yield {"type": "scrape_progress", "count": len(seed_unscraped)}
        scraped = await seed_scrape_task
        by_url = {s["url"]: s for s in scraped}
        for i, e in enumerate(evidence):
            if e["url"] in by_url:
                evidence[i] = by_url[e["url"]]

    # Scrape any new extra results if we still need more context
    extra_unscraped = [e for e in evidence if "body" not in e][: max(0, SCRAPE_TOP_N - len(seed_unscraped))]
    if extra_unscraped:
        yield {"type": "scrape_progress", "count": len(extra_unscraped)}
        extra_scraped = await _scrape(extra_unscraped, len(extra_unscraped))
        by_url2 = {s["url"]: s for s in extra_scraped}
        for i, e in enumerate(evidence):
            if e["url"] in by_url2:
                evidence[i] = by_url2[e["url"]]

    # ⚡ Heuristic reflection skip — saves 2-4s for ~70% of queries
    # Only call the reflection LLM when evidence is genuinely insufficient
    keywords_for_check = kw.get("keywords", []) + kw.get("entities", [])
    evidence_is_rich = _evidence_sufficient(evidence, keywords_for_check)

    should_reflect = MAX_LOOPS > 1 and (
        not evidence_is_rich  # Always reflect when heuristic says evidence is thin
        and cfg.name in _REFLECTION_INTENTS  # Only for research-heavy intents
    )

    if evidence_is_rich:
        logger.info(
            "Evidence sufficient (heuristic pass) — skipping reflection for '%s' (intent=%s)",
            query[:50],
            cfg.name,
        )
        scraped_count = sum(1 for e in evidence if e.get("body"))
        yield {
            "type": "thinking",
            "message": f"Collected {len(evidence)} sources ({scraped_count} with full text). Evidence looks sufficient — skipping reflection.",
        }
        yield {
            "type": "reflection",
            "loop": 1,
            "done": True,
            "missing": "",
            "followup_queries": [],
        }
    elif should_reflect:
        reflection = await _reflect(query, evidence, 1)
        yield {
            "type": "reflection",
            "loop": 1,
            "done": bool(reflection.get("done")),
            "missing": reflection.get("missing", ""),
            "followup_queries": reflection.get("followup_queries", []),
        }
        if not reflection.get("done") and reflection.get("followup_queries"):
            followup = [q for q in reflection["followup_queries"] if q][:3]
            if followup:
                yield {"type": "stage", "stage": "search_loop_2"}
                more_results = await _fanout_search(followup)
                for r in more_results:
                    url = r.get("url")
                    if url and url not in seen_urls and len(evidence) < MAX_SOURCES:
                        evidence.append(r)
                        seen_urls.add(url)
                # Scrape the newly added pages
                new_unscraped = [e for e in evidence if "body" not in e][:3]
                if new_unscraped:
                    yield {"type": "scrape_progress", "count": len(new_unscraped)}
                    more_scraped = await _scrape(new_unscraped, len(new_unscraped))
                    by_url2 = {s["url"]: s for s in more_scraped}
                    for i, e in enumerate(evidence):
                        if e["url"] in by_url2:
                            evidence[i] = by_url2[e["url"]]

    yield {"type": "stage", "stage": "synthesize"}
    yield {
        "type": "thinking",
        "message": f"Synthesizing final answer from {len(evidence)} sources using {cfg.name} specialist…",
    }

    # Partial answer has been moved to run earlier before scraping

    structured, model_used = await _synthesize(query, kw, evidence, cfg)
    sources = [{"title": e.get("title", ""), "url": e.get("url", "")} for e in evidence[:10] if e.get("url")]

    # ⚡ Stream structured fields progressively for faster perceived rendering
    # Emit tldr immediately so the frontend can show the summary card
    tldr = structured.get("tldr") or ""
    if tldr:
        yield {"type": "partial_structured", "field": "tldr", "value": tldr}
        yield {"type": "partial_answer", "delta": tldr + "\n\n"}

    # Emit key_facts one by one for progressive rendering
    key_facts = structured.get("key_facts") or structured.get("key_points") or []
    if key_facts:
        yield {"type": "partial_structured", "field": "key_facts", "value": key_facts}

    # Emit detail_markdown in chunks for streaming appearance
    detail_md = structured.get("detail_markdown") or ""
    if detail_md:
        # Split into sections and stream each
        sections = detail_md.split("\n## ")
        for i, section in enumerate(sections):
            chunk = ("## " + section) if i > 0 else section
            yield {
                "type": "partial_structured",
                "field": "detail_markdown",
                "delta": chunk,
                "done": i == len(sections) - 1,
            }

    if pipeline_span:
        pipeline_span.set_attribute("evidence.final_count", len(evidence))
        pipeline_span.set_attribute("sources.count", len(sources))
        pipeline_span.set_attribute("output.value", tldr[:500])
        pipeline_span.set_attribute("output.mime_type", "text/plain")
    if ctx:
        ctx.__exit__(None, None, None)

    yield {
        "type": "final",
        "intent": cfg.name,
        "model": model_used,
        "structured": structured,
        "markdown": structured.get("detail_markdown") or tldr,
        "sources": sources,
    }

    # ⚡ Run enrichment after final — sequential is fine since answer already delivered
    try:
        from ._enrichment import generate_enrichment

        enrichment = await asyncio.wait_for(generate_enrichment(query, cfg.name, structured), timeout=12.0)
        if enrichment:
            yield {"type": "enrichment", "artifact": enrichment}
    except Exception as e:
        logger.debug("Enrichment skipped: %s", e)
