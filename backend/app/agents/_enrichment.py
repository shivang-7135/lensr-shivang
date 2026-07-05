"""Post-answer visual enrichment generator.

After the main answer has been synthesized and streamed, this module generates
a data visualization artifact (chart, table, comparison, timeline, stat_cards)
that enhances the answer with visual context.

This runs AFTER the final event — it does NOT block the main answer.
If it fails, the user already has their complete text answer.
"""

from __future__ import annotations

import json
import logging
from datetime import UTC, datetime

from langchain_core.messages import HumanMessage, SystemMessage

from ..llm import fast_synthesis_llm

logger = logging.getLogger(__name__)

ENRICHMENT_SYSTEM = """You are a data visualization expert. Given a search answer, generate ONE visual artifact that makes the information more engaging and easier to understand.

Choose the BEST artifact type from:

1. "chart" — for trends, comparisons with numbers, rankings, scores
   Schema: {"type": "chart", "chart_type": "bar"|"line"|"pie"|"radar", "title": "...", "labels": ["..."], "datasets": [{"label": "...", "data": [numbers], "color": "#hex"}]}

2. "table" — for structured comparisons, specs, feature matrices
   Schema: {"type": "table", "title": "...", "headers": ["..."], "rows": [["..."]]}

3. "timeline" — for historical events, release dates, milestones
   Schema: {"type": "timeline", "title": "...", "events": [{"date": "...", "event": "...", "detail": "..."}]}

4. "comparison" — for side-by-side product/option comparison with radar/scores
   Schema: {"type": "comparison", "title": "...", "dimensions": ["..."], "items": [{"name": "...", "scores": {"dimension": number_0_to_100}}]}

5. "stat_cards" — for key metrics/stats at a glance
   Schema: {"type": "stat_cards", "title": "...", "stats": [{"label": "...", "value": "...", "detail": "...", "trend": "up"|"down"|"neutral"}]}

RULES:
- Return ONLY valid JSON with the exact schema above
- Use REAL data from the answer — never invent numbers
- Keep it concise: max 6 data points for charts, max 5 rows for tables, max 6 events for timelines
- Pick the type that adds the MOST visual value to the specific answer
- If the answer is too generic or text-only with no quantifiable data, return {"type": "none"}
- Colors should be hex codes. Use a professional palette like: #D97706, #059669, #7C3AED, #0EA5E9, #F43F5E, #8B5CF6

Return ONLY the JSON object, nothing else."""


async def generate_enrichment(
    query: str,
    intent: str,
    structured: dict,
) -> dict | None:
    """Generate a visual enrichment artifact for the answer.

    Returns the enrichment dict or None if generation fails/skipped.
    """
    tldr = structured.get("tldr", "")
    key_facts = structured.get("key_facts") or structured.get("key_points") or []
    detail = structured.get("detail_markdown", "")[:1500]

    if not tldr and not key_facts:
        return None

    answer_summary = f"Query: {query}\nIntent: {intent}\n\nTLDR: {tldr}\n"
    if key_facts:
        answer_summary += "Key facts:\n" + "\n".join(f"- {f}" for f in key_facts[:8]) + "\n"
    if detail:
        answer_summary += f"\nDetail:\n{detail}\n"

    # Include structured data hints for better visualization choices
    picks = structured.get("picks", [])
    if picks:
        answer_summary += f"\nItems/picks ({len(picks)}):\n"
        for p in picks[:5]:
            if isinstance(p, dict):
                answer_summary += f"  - {p.get('name', p.get('title', 'item'))}"
                if p.get("price_range") or p.get("price"):
                    answer_summary += f" | price: {p.get('price_range') or p.get('price')}"
                if p.get("rating"):
                    answer_summary += f" | rating: {p.get('rating')}"
                answer_summary += "\n"

    price_points = structured.get("price_points", [])
    if price_points:
        answer_summary += f"\nPrice history ({len(price_points)} points):\n"
        for pp in price_points[:6]:
            if isinstance(pp, dict):
                answer_summary += f"  - {pp.get('date', '?')}: ${pp.get('price', '?')}\n"

    days = structured.get("days", [])
    if days:
        answer_summary += f"\nTrip days ({len(days)}):\n"
        for d in days[:5]:
            if isinstance(d, dict):
                answer_summary += f"  - Day {d.get('day', '?')}: {d.get('theme', '')}\n"

    try:
        llm = fast_synthesis_llm()
        today = datetime.now(UTC).strftime("%B %d, %Y")
        system = f"Today is {today}.\n\n{ENRICHMENT_SYSTEM}"

        msg = await llm.ainvoke(
            [SystemMessage(system), HumanMessage(answer_summary)],
            config={},
        )

        raw = msg.content if isinstance(msg.content, str) else str(msg.content)
        raw = raw.strip()

        # Strip markdown fences if present
        if raw.startswith("```"):
            raw = raw.split("```", 2)[1]
            if raw.startswith("json"):
                raw = raw[4:]
            raw = raw.rsplit("```", 1)[0]

        data = json.loads(raw)

        artifact_type = data.get("type")
        if artifact_type == "none" or artifact_type not in (
            "chart",
            "table",
            "timeline",
            "comparison",
            "stat_cards",
        ):
            return None

        return data

    except Exception as e:
        logger.warning("Enrichment generation failed: %s", e)
        return None
