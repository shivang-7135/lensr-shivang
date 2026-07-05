import { useEffect, useRef, useState } from "react";
import { Clock, Zap, BarChart3 } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type {
  StreamEvent,
  SearchIntent,
  StructuredResult,
  EnrichmentArtifact,
} from "@/lib/search/types";
import { ResearchPanel, CacheHitBanner } from "@/components/results/ResearchPanel";
import { ResearchAnimation } from "@/components/results/ResearchAnimation";
import { SourcesGrid } from "@/components/results/SourcesGrid";
import { EnrichmentRenderer } from "@/components/results/EnrichmentRenderer";
import { GeneralResult } from "@/components/results/GeneralResult";
import { ShoppingResult } from "@/components/results/ShoppingResult";
import { TripResult } from "@/components/results/TripResult";
import { PriceHistoryResult } from "@/components/results/PriceHistoryResult";
import { InstaResult } from "@/components/results/InstaResult";
import { MoviesResult } from "@/components/results/MoviesResult";
import { RecipesResult } from "@/components/results/RecipesResult";
import { BooksResult } from "@/components/results/BooksResult";
import { PlacesResult } from "@/components/results/PlacesResult";
import { EventsResult } from "@/components/results/EventsResult";

const INTENT_LABEL: Record<SearchIntent, string> = {
  shopping: "Shopping",
  price_history: "Price History",
  trip: "Trip Planner",
  insta: "Instagram",
  movies: "Movies & TV",
  recipes: "Recipes",
  books: "Books",
  places: "Places",
  events: "Events",
  tech: "Tech",
  health: "Health",
  finance: "Finance",
  news: "News",
  sports: "Sports",
  howto: "How-To",
  learning: "Learning",
  jobs: "Jobs & Careers",
  local: "Local Services",
  comparison: "Comparison",
  gift: "Gift Ideas",
  legal: "Legal Info",
  gaming: "Gaming",
  diy: "DIY",
  fitness: "Fitness",
  pets: "Pets",
  music: "Music",
  productivity: "Productivity",
  weather: "Weather",
  real_estate: "Real Estate",
  automotive: "Automotive",
  food: "Food & Dining",
  fashion: "Fashion",
  parenting: "Parenting",
  dating: "Dating",
  general: "General",
};

type Sources = { title: string; url: string }[];

function hasArr(d: Record<string, unknown> | null, key: string): boolean {
  return !!d && Array.isArray(d[key]) && (d[key] as unknown[]).length > 0;
}

function isUsable(intent: SearchIntent, d: Record<string, unknown> | null): boolean {
  if (!d) return false;
  switch (intent) {
    case "shopping":
      return hasArr(d, "picks");
    case "trip":
      return hasArr(d, "days");
    case "insta":
      return hasArr(d, "captions");
    case "movies":
      return hasArr(d, "picks");
    case "recipes":
      return hasArr(d, "picks");
    case "books":
      return hasArr(d, "picks");
    case "places":
      return hasArr(d, "picks");
    case "events":
      return hasArr(d, "picks");
    case "price_history":
      return d.typical_price_range != null || d.buy_now_score != null;
    // New intents - they use GeneralResult with tldr/key_facts/detail_markdown
    case "tech":
    case "health":
    case "finance":
    case "news":
    case "sports":
    case "howto":
    case "learning":
    case "jobs":
    case "local":
    case "comparison":
    case "gift":
    case "legal":
    case "gaming":
    case "diy":
    case "fitness":
    case "pets":
    case "music":
    case "productivity":
    case "weather":
    case "real_estate":
    case "automotive":
    case "food":
    case "fashion":
    case "parenting":
    case "dating":
    case "general":
      return !!(
        d.tldr ||
        d.detail_markdown ||
        hasArr(d, "key_facts") ||
        hasArr(d, "key_points") ||
        hasArr(d, "tips") ||
        hasArr(d, "picks")
      );
    default:
      return false;
  }
}

function firstParagraph(s: string): string {
  const p = s?.split(/\n\s*\n/)[0]?.trim() ?? "";
  return p.length > 280 ? p.slice(0, 277) + "…" : p;
}

function renderStructured(
  intent: SearchIntent,
  data: Record<string, unknown> | null,
  fallbackMarkdown: string,
  sources: Sources,
) {
  // Degrade to General whenever the intent-specific card can't be filled
  if (!isUsable(intent, data)) {
    const general = {
      intent: "general" as const,
      tldr: (data?.tldr as string) || firstParagraph(fallbackMarkdown) || "Here's what I found.",
      key_facts: Array.isArray(data?.key_facts) ? (data!.key_facts as string[]) : [],
      detail_markdown:
        fallbackMarkdown ||
        (typeof data?.detail_markdown === "string" ? (data!.detail_markdown as string) : ""),
    };
    return <GeneralResult data={general} sources={sources} />;
  }

  const withIntent = { intent, ...data } as unknown as StructuredResult;
  switch (intent) {
    case "shopping":
      return (
        <ShoppingResult data={withIntent as Extract<StructuredResult, { intent: "shopping" }>} />
      );
    case "trip":
      return <TripResult data={withIntent as Extract<StructuredResult, { intent: "trip" }>} />;
    case "price_history":
      return (
        <PriceHistoryResult
          data={withIntent as Extract<StructuredResult, { intent: "price_history" }>}
        />
      );
    case "insta":
      return <InstaResult data={withIntent as Extract<StructuredResult, { intent: "insta" }>} />;
    case "movies":
      return <MoviesResult data={withIntent as Extract<StructuredResult, { intent: "movies" }>} />;
    case "recipes":
      return (
        <RecipesResult data={withIntent as Extract<StructuredResult, { intent: "recipes" }>} />
      );
    case "books":
      return <BooksResult data={withIntent as Extract<StructuredResult, { intent: "books" }>} />;
    case "places":
      return <PlacesResult data={withIntent as Extract<StructuredResult, { intent: "places" }>} />;
    case "events":
      return <EventsResult data={withIntent as Extract<StructuredResult, { intent: "events" }>} />;
    default:
      return (
        <GeneralResult
          data={withIntent as Extract<StructuredResult, { intent: "general" }>}
          sources={sources}
        />
      );
  }
}

// ─── Mobile Activity Feed ───────────────────────────────────────────────────
// A lightweight, engaging live-feed shown during generation on mobile.
// Shows the most recent agent action + a rolling count of sources found.
const STAGE_COPY: Record<string, string> = {
  plan: "Planning queries…",
  search_loop_1: "Searching the web…",
  search_loop_2: "Digging deeper…",
  synthesize: "Writing your answer…",
  vision: "Analysing image…",
};

function MobileActivityFeed({ events, elapsed }: { events: StreamEvent[]; elapsed: number }) {
  // Derive the most useful status line from the stream events so far
  const sourcesFound = events
    .filter((e) => e.type === "search_results")
    .reduce((sum, e) => sum + (e.type === "search_results" ? e.count : 0), 0);

  const lastStage = [...events].reverse().find((e) => e.type === "stage");
  const stageCopy =
    lastStage?.type === "stage" ? (STAGE_COPY[lastStage.stage] ?? "Working…") : "Connecting…";

  const intentEvent = events.find((e) => e.type === "intent_detected");
  const intentLabel =
    intentEvent?.type === "intent_detected"
      ? (INTENT_LABEL[intentEvent.intent] ?? intentEvent.intent)
      : null;

  // Last search query being run
  const lastToolCall = [...events].reverse().find((e) => e.type === "tool_call");
  const lastQuery = lastToolCall?.type === "tool_call" ? lastToolCall.input : null;

  return (
    <div className="mb-4 rounded-xl border border-border/40 dark:border-white/8 bg-card/40 dark:bg-[#111] overflow-hidden">
      {/* Top bar — status + timer */}
      <div className="flex items-center justify-between px-3 py-2.5 border-b border-border/30 dark:border-white/6">
        <div className="flex items-center gap-2 min-w-0">
          {/* Breathing dot */}
          <span className="relative flex h-2 w-2 shrink-0">
            <span className="absolute inset-0 rounded-full bg-accent opacity-60 mobile-breathe" />
            <span className="relative rounded-full h-2 w-2 bg-accent" />
          </span>
          <span className="text-xs font-medium text-foreground truncate">{stageCopy}</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground font-mono shrink-0 ml-2">
          {(elapsed / 1000).toFixed(1)}s
        </span>
      </div>

      {/* Activity rows */}
      <div className="px-3 py-2 space-y-1.5">
        {intentLabel && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-accent/60 shrink-0" />
            <span>
              Intent: <span className="text-foreground font-medium">{intentLabel}</span>
            </span>
          </div>
        )}
        {sourcesFound > 0 && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 shrink-0" />
            <span>
              <span className="text-foreground font-medium tabular-nums">{sourcesFound}</span>{" "}
              sources found
            </span>
          </div>
        )}
        {lastQuery && (
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-violet-400/60 shrink-0 mt-[3px]" />
            <span className="truncate italic">"{lastQuery}"</span>
          </div>
        )}
        {!intentLabel && !sourcesFound && !lastQuery && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/40 shrink-0" />
            <span>Starting up…</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Intent-Specific Skeleton ───────────────────────────────────────────────
// Shows a purpose-built loading skeleton matched to the expected result card.
// This makes the UI feel faster since the user sees the correct layout immediately.
function IntentSkeleton({ intent }: { intent: SearchIntent | null }) {
  if (intent === "shopping" || intent === "comparison") {
    return (
      <div className="hidden sm:flex flex-col mt-2 space-y-4 animate-pulse">
        {/* TL;DR skeleton */}
        <div className="p-4 rounded-xl border border-border/30 space-y-2">
          <div className="h-3 w-20 bg-muted dark:bg-[#222] rounded" />
          <div className="h-4 w-full bg-muted dark:bg-[#222] rounded" />
          <div className="h-4 w-[85%] bg-muted dark:bg-[#222] rounded" />
        </div>
        {/* Product picks skeleton */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="p-3 rounded-lg border border-border/20 space-y-2">
              <div className="h-4 w-[60%] bg-muted dark:bg-[#222] rounded" />
              <div className="h-3 w-[40%] bg-muted dark:bg-[#222] rounded" />
              <div className="h-3 w-full bg-muted dark:bg-[#222] rounded" />
              <div className="h-3 w-[75%] bg-muted dark:bg-[#222] rounded" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (intent === "trip") {
    return (
      <div className="hidden sm:flex flex-col mt-2 space-y-4 animate-pulse">
        <div className="p-4 rounded-xl border border-border/30 space-y-2">
          <div className="h-3 w-24 bg-muted dark:bg-[#222] rounded" />
          <div className="h-4 w-full bg-muted dark:bg-[#222] rounded" />
        </div>
        {/* Days skeleton */}
        {[1, 2, 3].map((i) => (
          <div key={i} className="p-3 rounded-lg border border-border/20 space-y-2">
            <div className="h-4 w-20 bg-muted dark:bg-[#222] rounded" />
            <div className="h-3 w-full bg-muted dark:bg-[#222] rounded" />
            <div className="h-3 w-[80%] bg-muted dark:bg-[#222] rounded" />
          </div>
        ))}
      </div>
    );
  }

  if (intent === "recipes") {
    return (
      <div className="hidden sm:flex flex-col mt-2 space-y-4 animate-pulse">
        <div className="p-4 rounded-xl border border-border/30 space-y-2">
          <div className="h-3 w-16 bg-muted dark:bg-[#222] rounded" />
          <div className="h-4 w-full bg-muted dark:bg-[#222] rounded" />
        </div>
        <div className="p-4 rounded-lg border border-border/20 space-y-3">
          <div className="h-5 w-[50%] bg-muted dark:bg-[#222] rounded" />
          <div className="flex gap-4">
            <div className="h-3 w-16 bg-muted dark:bg-[#222] rounded" />
            <div className="h-3 w-16 bg-muted dark:bg-[#222] rounded" />
            <div className="h-3 w-16 bg-muted dark:bg-[#222] rounded" />
          </div>
          <div className="space-y-1.5">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-3 w-full bg-muted dark:bg-[#222] rounded" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Default: general knowledge skeleton (tldr + key facts + markdown)
  return (
    <div className="hidden sm:flex flex-col mt-2 space-y-4 animate-pulse">
      {/* TL;DR card skeleton */}
      <div className="p-4 rounded-xl border border-border/30 space-y-2">
        <div className="h-3 w-20 bg-muted dark:bg-[#222] rounded" />
        <div className="h-4 w-full bg-muted dark:bg-[#222] rounded" />
        <div className="h-4 w-[70%] bg-muted dark:bg-[#222] rounded" />
      </div>
      {/* Key facts skeleton */}
      <div className="p-4 rounded-xl border border-border/20 space-y-2.5">
        <div className="h-3 w-24 bg-muted dark:bg-[#222] rounded" />
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="h-4 w-4 rounded-full bg-muted dark:bg-[#222] shrink-0" />
            <div className="h-3 w-full bg-muted dark:bg-[#222] rounded" />
          </div>
        ))}
      </div>
    </div>
  );
}

// Client-side timeout for the stream (90 seconds)
const STREAM_TIMEOUT_MS = 90_000;

// Stable session ID per browser tab — persists across searches within one session
const SESSION_ID =
  typeof crypto !== "undefined" ? crypto.randomUUID() : Math.random().toString(36).slice(2);

export function ResultsStream({
  query,
  fastMode = false,
  imageUrl,
}: {
  query: string;
  fastMode?: boolean;
  imageUrl?: string;
}) {
  const [events, setEvents] = useState<StreamEvent[]>([]);
  const [partial, setPartial] = useState("");
  const [intent, setIntent] = useState<SearchIntent | null>(null);
  const [final, setFinal] = useState<{
    structured: Record<string, unknown> | null;
    markdown: string;
    sources: { title: string; url: string }[];
  } | null>(null);
  const [done, setDone] = useState(false);
  const [cached, setCached] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [enrichment, setEnrichment] = useState<EnrichmentArtifact | null>(null);
  // true = answer done but enrichment not yet received; false = enrichment arrived or stream closed
  const [enrichmentPending, setEnrichmentPending] = useState(false);

  // Elapsed time tracking
  const startTimeRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);
  const [finalElapsed, setFinalElapsed] = useState<number | null>(null);

  // Generation counter: incremented on every new search so stale async
  // closures (from React Strict Mode double-invocation or rapid re-renders)
  // never overwrite state that belongs to a newer search.
  const genRef = useRef(0);

  useEffect(() => {
    if (done || error) {
      setFinalElapsed(Date.now() - startTimeRef.current);
      return;
    }
    const id = setInterval(() => setElapsed(Date.now() - startTimeRef.current), 100);
    return () => clearInterval(id);
  }, [done, error]);

  useEffect(() => {
    // Bump generation so any in-flight callbacks from the previous search
    // know they are stale and must not call setState.
    const gen = ++genRef.current;

    // Reset all state for the new search
    setEvents([]);
    setPartial("");
    setIntent(null);
    setFinal(null);
    setDone(false);
    setCached(false);
    setError(null);
    setEnrichment(null);
    setEnrichmentPending(false);
    startTimeRef.current = Date.now();
    setElapsed(0);
    setFinalElapsed(null);

    const ctl = new AbortController();

    // Timeout: abort if stream takes too long
    const timeout = setTimeout(() => {
      if (genRef.current !== gen) return;
      ctl.abort();
      setError("Search timed out. Please try a simpler query.");
      setDone(true);
    }, STREAM_TIMEOUT_MS);

    function processLine(line: string) {
      if (genRef.current !== gen) return; // stale — discard
      if (!line.startsWith("data: ")) return;
      try {
        const ev = JSON.parse(line.slice(6)) as StreamEvent;
        // Heartbeat is an invisible keep-alive ping — skip adding to events array
        if (ev.type === "heartbeat") return;
        setEvents((prev) => [...prev, ev]);
        if (ev.type === "intent_detected") setIntent(ev.intent);
        if (ev.type === "cache_hit") setCached(true);
        if (ev.type === "partial_answer") {
          // Each partial_answer replaces the previous one (fast preview → real tldr)
          setPartial(ev.delta);
        }
        // ⚡ Progressive structured rendering — build up the final result incrementally
        if (ev.type === "partial_structured") {
          setFinal((prev) => {
            const structured = { ...(prev?.structured ?? {}) };
            if (ev.field === "tldr") {
              structured.tldr = ev.value;
            } else if (ev.field === "key_facts") {
              structured.key_facts = ev.value;
            } else if (ev.field === "detail_markdown") {
              // Append delta chunks for streaming markdown
              structured.detail_markdown =
                ((structured.detail_markdown as string) ?? "") + (ev.delta ?? "");
            }
            return {
              structured,
              markdown: (structured.detail_markdown as string) ?? prev?.markdown ?? "",
              sources: prev?.sources ?? [],
            };
          });
        }
        if (ev.type === "final") {
          setIntent(ev.intent);
          setFinal({
            structured: (ev.structured as Record<string, unknown>) ?? null,
            markdown: ev.markdown ?? "",
            sources: ev.sources ?? [],
          });
          setDone(true);
          // Show enrichment skeleton until the enrichment event (or stream close) arrives
          setEnrichmentPending(true);
        }
        if (ev.type === "enrichment") {
          setEnrichment(ev.artifact);
          setEnrichmentPending(false);
        }
        if (ev.type === "error") {
          setEnrichmentPending(false);
          setError(ev.message ?? "An error occurred");
        }
      } catch {
        // Malformed JSON event — skip silently
      }
    }

    (async () => {
      try {
        const resp = await fetch("/api/search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query,
            fast_mode: fastMode,
            session_id: SESSION_ID,
            ...(imageUrl ? { image_url: imageUrl } : {}),
          }),
          signal: ctl.signal,
        });
        if (genRef.current !== gen) return; // stale
        if (!resp.ok || !resp.body) {
          setError(`Request failed (${resp.status})`);
          setDone(true);
          return;
        }
        const reader = resp.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        while (true) {
          const { done: rd, value } = await reader.read();
          if (rd) break;
          if (genRef.current !== gen) {
            // A newer search started — release the reader and bail out
            await reader.cancel();
            return;
          }
          buf += dec.decode(value, { stream: true });
          let nl: number;
          while ((nl = buf.indexOf("\n\n")) !== -1) {
            const chunk = buf.slice(0, nl);
            buf = buf.slice(nl + 2);
            for (const line of chunk.split("\n")) {
              processLine(line);
            }
          }
        }
        // Flush remaining buffer after stream ends
        if (genRef.current !== gen) return;
        if (buf.trim()) {
          for (const line of buf.split("\n")) {
            processLine(line);
          }
        }
        if (genRef.current === gen) setDone(true);
      } catch (e) {
        if (genRef.current !== gen) return;
        if ((e as Error).name !== "AbortError") {
          setError((e as Error).message ?? "Connection lost");
        }
      } finally {
        clearTimeout(timeout);
        // Stream fully closed — if enrichment never arrived, clear the pending state
        if (genRef.current === gen) setEnrichmentPending(false);
      }
    })();

    return () => {
      clearTimeout(timeout);
      ctl.abort();
    };
  }, [query, fastMode, imageUrl]);

  return (
    <>
      <ResearchAnimation active={!done && !error && !cached} />

      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto w-full relative z-10">
        {/* Left Column: Live Research Sidebar — hidden on mobile during loading to prevent layout shifts */}
        <div className="hidden lg:block w-full lg:w-[280px] shrink-0 order-last lg:order-first">
          <div className="sticky top-20">
            {cached ? (
              <CacheHitBanner query={query} />
            ) : (
              <ResearchPanel events={events} done={done} />
            )}
          </div>
        </div>

        {/* Mobile: Live activity feed */}
        <div className="lg:hidden w-full order-first">
          {cached ? (
            <CacheHitBanner query={query} />
          ) : !done && !error ? (
            <MobileActivityFeed events={events} elapsed={elapsed} />
          ) : done && finalElapsed && !cached ? (
            <div className="flex items-center justify-between px-3 py-1.5 rounded-md bg-emerald-500/5 border border-emerald-500/15 mb-3">
              <span className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Done
              </span>
              <span className="text-xs tabular-nums text-emerald-600 dark:text-emerald-400 font-mono">
                {(finalElapsed / 1000).toFixed(1)}s
              </span>
            </div>
          ) : null}
        </div>

        {/* Right Column: Main Content */}
        <div className="flex-1 min-w-0 flex flex-col pt-1 overflow-hidden">
          {/* Intent + timer inline with heading */}
          <div className="mb-4 sm:mb-6">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              {intent && (
                <span className="inline-flex items-center text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-md bg-secondary text-muted-foreground font-medium">
                  {INTENT_LABEL[intent]}
                </span>
              )}
              {!done && !error && !cached && (
                <span className="hidden sm:inline-flex items-center gap-1 text-[10px] text-muted-foreground font-mono tabular-nums">
                  <Clock className="h-3 w-3" />
                  {(elapsed / 1000).toFixed(1)}s
                </span>
              )}
              {done && finalElapsed && !cached && (
                <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-mono tabular-nums">
                  {(finalElapsed / 1000).toFixed(1)}s
                </span>
              )}
            </div>
            <h1 className="font-display text-lg sm:text-2xl tracking-tight font-semibold text-foreground break-words leading-snug">
              {query}
            </h1>
          </div>

          {error && (
            <div className="p-4 glass border border-destructive/50 text-sm text-destructive">
              {error}
            </div>
          )}

          {done && final && intent ? (
            <div className="space-y-6 sm:space-y-8">
              {renderStructured(intent, final.structured, final.markdown, final.sources)}

              {/* ⚡ Enrichment area: skeleton while generating, real chart when ready */}
              {enrichmentPending && !enrichment && (
                <div className="rounded-xl border border-border overflow-hidden animate-pulse">
                  <div className="px-4 py-3 bg-secondary/40 border-b border-border flex items-center gap-2">
                    <BarChart3 className="h-4 w-4 text-muted-foreground/40" />
                    <span className="text-sm font-medium text-muted-foreground/50">
                      Generating visual…
                    </span>
                    <div className="ml-auto flex gap-1">
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                      <span className="thinking-dot" />
                    </div>
                  </div>
                  <div className="p-4 space-y-3">
                    <div className="h-3 w-1/3 bg-muted rounded" />
                    <div className="h-32 w-full bg-muted/60 rounded-lg" />
                    <div className="flex gap-2">
                      <div className="h-2 w-16 bg-muted rounded" />
                      <div className="h-2 w-20 bg-muted rounded" />
                      <div className="h-2 w-12 bg-muted rounded" />
                    </div>
                  </div>
                </div>
              )}

              {enrichment && (
                <div className="pt-2">
                  <EnrichmentRenderer data={enrichment} />
                </div>
              )}

              <div className="pt-6 sm:pt-8 border-t border-border dark:border-[#27272a]">
                <SourcesGrid sources={final.sources} />
              </div>
            </div>
          ) : !done && final && intent ? (
            /* ⚡ Progressive rendering: show structured content as it streams in */
            <div className="space-y-6 sm:space-y-8 animate-in fade-in-0 duration-300">
              {renderStructured(intent, final.structured, final.markdown, final.sources)}
              {/* Loading indicator at bottom while still streaming */}
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="absolute inset-0 rounded-full bg-accent opacity-60 animate-ping" />
                  <span className="relative rounded-full h-2 w-2 bg-accent" />
                </span>
                <span>Building answer…</span>
              </div>
            </div>
          ) : partial ? (
            <div className="flex flex-col">
              <div className="relative max-h-52 sm:max-h-96 overflow-hidden">
                <div className="prose dark:prose-invert prose-sm max-w-none prose-strong:text-foreground prose-p:leading-relaxed prose-p:my-1 prose-headings:font-semibold text-foreground/80 dark:text-[#d4d4d8]">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{partial}</ReactMarkdown>
                </div>
                <div className="absolute bottom-0 left-0 right-0 h-16 sm:h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
              </div>
              <div className="mt-4 space-y-2 opacity-40">
                <div className="h-3 w-full bg-muted dark:bg-[#222] rounded" />
                <div className="h-3 w-[80%] bg-muted dark:bg-[#222] rounded" />
              </div>
            </div>
          ) : !error ? (
            /* ⚡ Intent-specific skeleton: shown as soon as intent is detected */
            <IntentSkeleton intent={intent} />
          ) : null}

          {(() => {
            const followups = events
              .filter((e) => e.type === "reflection")
              .flatMap((e) => (e.type === "reflection" ? (e.followup_queries ?? []) : []))
              .slice(0, 3);
            return done && final && followups.length > 0 ? (
              <div className="pt-8 sm:pt-12 mt-4">
                <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground mb-3">
                  Related
                </p>
                <div className="flex flex-wrap gap-2">
                  {followups.map((q: string, i: number) => (
                    <a
                      key={i}
                      href={`/results?q=${encodeURIComponent(q)}`}
                      className="text-xs sm:text-sm px-3 sm:px-4 py-1.5 sm:py-2 rounded-full bg-muted/50 dark:bg-[#1a1a1a] border border-border/50 dark:border-[#27272a] text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
                    >
                      {q}
                    </a>
                  ))}
                </div>
              </div>
            ) : null;
          })()}
        </div>
      </div>
    </>
  );
}
