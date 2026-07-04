"""Serper.dev wrapper — real Google SERPs as JSON.

Uses a persistent connection pool to avoid TCP/TLS handshake per request.
Extracts rich metadata (knowledge graph, answer box) for higher quality synthesis.
Falls back to DuckDuckGo if Serper fails.
"""

from __future__ import annotations

import logging
import re
import urllib.parse

import httpx

from ..config import settings

logger = logging.getLogger(__name__)

# ─── Persistent connection pool ─────────────────────────────────────────────
# Reuse TCP/TLS connections across requests (saves ~200-400ms per call)
_serper_client: httpx.AsyncClient | None = None
_fallback_client: httpx.AsyncClient | None = None


def _get_serper_client() -> httpx.AsyncClient:
    global _serper_client
    if _serper_client is None or _serper_client.is_closed:
        _serper_client = httpx.AsyncClient(
            timeout=8,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            http2=True,
        )
    return _serper_client


def _get_fallback_client() -> httpx.AsyncClient:
    global _fallback_client
    if _fallback_client is None or _fallback_client.is_closed:
        _fallback_client = httpx.AsyncClient(
            timeout=10,
            limits=httpx.Limits(max_connections=10, max_keepalive_connections=5),
            headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"},
        )
    return _fallback_client


async def shutdown_clients() -> None:
    """Close persistent clients on app shutdown."""
    global _serper_client, _fallback_client
    if _serper_client and not _serper_client.is_closed:
        await _serper_client.aclose()
    if _fallback_client and not _fallback_client.is_closed:
        await _fallback_client.aclose()


# ─── Main search function ───────────────────────────────────────────────────


async def google_search(query: str, num: int = 5) -> list[dict]:
    """Search via Serper.dev and return organic results with rich metadata.
    
    Returns list of dicts with keys: title, link, snippet, position.
    Also injects knowledge_graph and answer_box as synthetic results when available.
    """
    if not settings.serper_api_key:
        logger.warning("google_search called but SERPER_API_KEY is not set — returning empty")
        return []

    try:
        client = _get_serper_client()
        r = await client.post(
            "https://google.serper.dev/search",
            headers={"X-API-KEY": settings.serper_api_key, "Content-Type": "application/json"},
            json={"q": query, "num": num},
        )
        r.raise_for_status()
        data = r.json()
    except httpx.HTTPStatusError as e:
        logger.error("Serper API error %d for query '%s': %s", e.response.status_code, query, e.response.text[:200])
        return await _fallback_search(query, num)
    except httpx.TimeoutException:
        logger.error("Serper API timeout for query: '%s'", query)
        return await _fallback_search(query, num)
    except Exception as e:
        logger.error("Serper API unexpected error for query '%s': %s", query, type(e).__name__)
        return await _fallback_search(query, num)

    results: list[dict] = []

    # ─── Extract knowledge graph (high-quality structured data, no scraping needed) ───
    kg = data.get("knowledgeGraph")
    if kg and kg.get("title"):
        kg_snippet_parts = []
        if kg.get("description"):
            kg_snippet_parts.append(kg["description"])
        # Include key attributes from knowledge graph
        for attr_key in ("type", "born", "founded", "headquarters", "genre", "director", "rating"):
            if kg.get(attr_key):
                kg_snippet_parts.append(f"{attr_key.title()}: {kg[attr_key]}")
        # Include attributes dict if present
        if kg.get("attributes"):
            for k, v in list(kg["attributes"].items())[:5]:
                kg_snippet_parts.append(f"{k}: {v}")
        
        results.append({
            "title": f"{kg['title']} — Knowledge Graph",
            "link": kg.get("descriptionUrl") or kg.get("website") or "",
            "snippet": " | ".join(kg_snippet_parts)[:500],
            "position": 0,  # Highest priority
            "source_type": "knowledge_graph",
        })

    # ─── Extract answer box (direct answer from Google) ───
    answer_box = data.get("answerBox")
    if answer_box:
        ab_title = answer_box.get("title") or answer_box.get("snippet") or ""
        ab_answer = answer_box.get("answer") or answer_box.get("snippet") or ""
        if ab_answer:
            results.append({
                "title": f"Answer: {ab_title[:80]}",
                "link": answer_box.get("link") or "",
                "snippet": ab_answer[:400],
                "position": 0,
                "source_type": "answer_box",
            })

    # ─── Extract "People Also Ask" for additional context ───
    paa = data.get("peopleAlsoAsk", [])
    for item in paa[:2]:  # Only top 2 to avoid noise
        if item.get("snippet"):
            results.append({
                "title": item.get("question", "Related"),
                "link": item.get("link") or "",
                "snippet": item["snippet"][:300],
                "position": 99,  # Lower priority than organic
                "source_type": "people_also_ask",
            })

    # ─── Extract organic results with position ───
    organic = data.get("organic", [])
    for i, it in enumerate(organic[:num]):
        results.append({
            "title": it.get("title"),
            "link": it.get("link"),
            "snippet": it.get("snippet"),
            "position": i + 1,
            "source_type": "organic",
        })

    return results


# ─── Fallback search ────────────────────────────────────────────────────────


async def _fallback_search(query: str, num: int = 5) -> list[dict]:
    """Fallback search using DuckDuckGo HTML parsing if Serper fails."""
    logger.info("Attempting fallback search for query: '%s'", query)
    try:
        client = _get_fallback_client()
        r = await client.get(
            "https://html.duckduckgo.com/html/",
            params={"q": query},
        )
        r.raise_for_status()

        results = []
        html = r.text

        # Find result links and snippets
        link_pattern = re.compile(
            r'<a rel="nofollow" class="result__a" href="([^"]+)"[^>]*>(.*?)</a>',
            re.DOTALL | re.IGNORECASE,
        )
        snippet_pattern = re.compile(
            r'<a class="result__snippet"[^>]*>(.*?)</a>',
            re.DOTALL | re.IGNORECASE,
        )

        links = link_pattern.findall(html)
        snippets = snippet_pattern.findall(html)

        for i, (link, raw_title) in enumerate(links[:num]):
            # Clean up DDG redirect URLs
            if "uddg=" in link:
                link = urllib.parse.unquote(link.split("uddg=")[1].split("&")[0])

            title = re.sub(r"<[^>]+>", "", raw_title).strip()
            snippet = re.sub(r"<[^>]+>", "", snippets[i]).strip() if i < len(snippets) else ""

            if link and title:
                results.append({
                    "title": title,
                    "link": link,
                    "snippet": snippet,
                    "position": i + 1,
                    "source_type": "fallback_ddg",
                })

        if results:
            logger.info("Fallback search succeeded with %d results", len(results))
        else:
            logger.warning("Fallback search returned no parseable results")
        return results

    except Exception as e:
        logger.error("Fallback search also failed for query '%s': %s", query, type(e).__name__)
        return []
