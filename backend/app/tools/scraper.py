"""Web content scraper with persistent connection pool and HTTP/2 support.

Uses a module-level httpx.AsyncClient to reuse TCP/TLS connections,
eliminating handshake overhead on repeated scrapes (~200-400ms saved per call).
"""

from __future__ import annotations

import ipaddress
import logging
from urllib.parse import urlparse

import httpx
import trafilatura

logger = logging.getLogger(__name__)

# Maximum response body size (5 MB)
MAX_RESPONSE_BYTES = 5 * 1024 * 1024

# ─── Persistent connection pool for scraping ─────────────────────────────────
# Reuse connections across scrape calls (saves TCP+TLS handshake per request)
_scrape_client: httpx.AsyncClient | None = None


def _get_scrape_client() -> httpx.AsyncClient:
    global _scrape_client
    if _scrape_client is None or _scrape_client.is_closed:
        _scrape_client = httpx.AsyncClient(
            timeout=5,  # 5s cap — slightly more generous than before for HTTP/2 multiplexing
            follow_redirects=True,
            max_redirects=3,
            limits=httpx.Limits(max_connections=20, max_keepalive_connections=10),
            http2=True,  # HTTP/2 multiplexes multiple requests over one connection
            headers={"User-Agent": "LensrBot/1.0 (research; +https://lensr.studio)"},
        )
    return _scrape_client


async def shutdown_scraper() -> None:
    """Close persistent client on app shutdown."""
    global _scrape_client
    if _scrape_client and not _scrape_client.is_closed:
        await _scrape_client.aclose()


def _is_private_url(url: str) -> bool:
    """Block requests to private/internal network addresses (SSRF protection)."""
    try:
        parsed = urlparse(url)
        hostname = parsed.hostname
        if not hostname:
            return True
        # Block common internal hostnames
        if hostname in ("localhost", "127.0.0.1", "0.0.0.0", "::1", "[::1]"):
            return True
        # Block metadata endpoints
        if hostname == "169.254.169.254":
            return True
        # Try to resolve as IP and check ranges
        try:
            ip = ipaddress.ip_address(hostname)
            return ip.is_private or ip.is_loopback or ip.is_link_local or ip.is_reserved
        except ValueError:
            # It's a hostname, not an IP — allow (DNS resolution happens at request time)
            pass
        # Block cloud metadata hostnames
        return hostname in ("metadata.google.internal", "metadata.internal")
    except Exception:
        return True  # Block on any parsing error


async def fetch_clean(url: str) -> str | None:
    """Fetch and extract main text content from a URL.

    Includes SSRF protection and response size limiting.
    Uses persistent HTTP/2 connection pool for speed.
    """
    if _is_private_url(url):
        logger.warning("Blocked SSRF attempt: %s", url)
        return None

    try:
        client = _get_scrape_client()
        r = await client.get(url)
        r.raise_for_status()
        # Enforce response size limit
        content_length = r.headers.get("content-length")
        if content_length and int(content_length) > MAX_RESPONSE_BYTES:
            logger.warning("Response too large (%s bytes): %s", content_length, url)
            return None
        if len(r.content) > MAX_RESPONSE_BYTES:
            logger.warning("Response body exceeded limit: %s", url)
            return None
        html = r.text
    except httpx.TimeoutException:
        logger.debug("Timeout fetching: %s", url)
        return None
    except httpx.HTTPStatusError as e:
        logger.debug("HTTP %d fetching: %s", e.response.status_code, url)
        return None
    except Exception as e:
        logger.debug("Error fetching %s: %s", url, type(e).__name__)
        return None

    return trafilatura.extract(html, include_comments=False, include_tables=False) or None
