/**
 * Streaming search endpoint.
 *
 * Proxies all requests to the Python LangGraph backend at BACKEND_BASE_URL.
 * Returns SSE (text/event-stream) with intent-specific structured JSON.
 */
import { createFileRoute } from "@tanstack/react-router";

// Only allow same-origin requests — no wildcard CORS
const ALLOWED_ORIGINS = (process.env.CORS_ALLOWED_ORIGINS ?? "").split(",").filter(Boolean);

function getCorsHeaders(request: Request) {
  const origin = request.headers.get("origin") ?? "";
  // Allow same-origin (no origin header) or explicitly allowed origins
  const allowed =
    !origin || ALLOWED_ORIGINS.includes(origin) || origin.startsWith("http://localhost");
  return {
    "Access-Control-Allow-Origin": allowed ? origin || "*" : "",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

const MAX_BODY_SIZE = 8 * 1024; // 8 KB
const MAX_QUERY_LENGTH = 2000;

export const Route = createFileRoute("/api/search")({
  server: {
    handlers: {
      OPTIONS: async ({ request }) => new Response(null, { headers: getCorsHeaders(request) }),
      POST: async ({ request }) => {
        const corsHeaders = getCorsHeaders(request);

        // Enforce body size limit
        const contentLength = request.headers.get("content-length");
        if (contentLength && parseInt(contentLength) > MAX_BODY_SIZE) {
          return new Response(JSON.stringify({ error: "Request body too large" }), {
            status: 413,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const body = (await request.json()) as {
          query?: string;
          intent_hint?: string;
          fast_mode?: boolean;
          session_id?: string;
        };
        const query = (body.query ?? "").trim();
        if (!query) {
          return new Response(JSON.stringify({ error: "Missing query" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }
        if (query.length > MAX_QUERY_LENGTH) {
          return new Response(JSON.stringify({ error: "Query too long" }), {
            status: 400,
            headers: { "Content-Type": "application/json", ...corsHeaders },
          });
        }

        const rawBackend = process.env.BACKEND_BASE_URL;
        const backendSecret = process.env.BACKEND_SHARED_SECRET;
        const backendUrl = isValidHttpUrl(rawBackend) ? rawBackend! : null;

        if (!backendUrl) {
          return new Response(
            JSON.stringify({ error: "Search backend is not configured. Set BACKEND_BASE_URL." }),
            { status: 503, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }

        const upstream = await fetch(`${backendUrl.replace(/\/$/, "")}/search`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(backendSecret ? { "X-Backend-Secret": backendSecret } : {}),
          },
          body: JSON.stringify({
            query,
            intent_hint: body.intent_hint,
            fast_mode: body.fast_mode,
            session_id: body.session_id,
          }),
        });
        if (!upstream.ok || !upstream.body) {
          // Don't leak backend error details to the client
          return new Response(
            JSON.stringify({ error: `Search service unavailable (${upstream.status})` }),
            { status: 502, headers: { "Content-Type": "application/json", ...corsHeaders } },
          );
        }
        return new Response(upstream.body, {
          headers: sseHeaders(corsHeaders),
        });
      },
    },
  },
});

function sseHeaders(corsHeaders: Record<string, string>) {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    ...corsHeaders,
  };
}

function isValidHttpUrl(value: string | undefined | null): boolean {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
