import { useState, useEffect, useRef } from "react";
import { Loader2, Zap, Database, Clock, RefreshCw } from "lucide-react";
import type { StreamEvent } from "@/lib/search/types";
import { AgentTimeline } from "@/components/results/AgentTimeline";

/** Shown instead of the research panel when result came from cache */
export function CacheHitBanner({ query }: { query?: string }) {
  return (
    <div className="relative overflow-hidden rounded-xl border border-emerald-500/30 bg-emerald-500/5 px-4 py-3">
      {/* subtle shimmer line */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-emerald-400/60 to-transparent" />
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 border border-emerald-500/30">
          <Zap className="h-4 w-4 text-emerald-400" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold text-emerald-400">Instant result</span>
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" /> Served from semantic cache
            </span>
          </div>
          {query && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">
              A semantically similar search was cached — no API calls needed.
            </p>
          )}
        </div>
        <div className="ml-auto shrink-0 flex items-center gap-1 text-xs text-emerald-400/70">
          <Clock className="h-3 w-3" />
          <span>&lt;100ms</span>
        </div>
      </div>
    </div>
  );
}

export function ResearchPanel({ events, done }: { events: StreamEvent[]; done: boolean }) {
  const startRef = useRef(Date.now());
  const [elapsed, setElapsed] = useState(0);

  // Tick elapsed time while researching
  useEffect(() => {
    if (done) return;
    const id = setInterval(() => setElapsed(Date.now() - startRef.current), 250);
    return () => clearInterval(id);
  }, [done]);

  // Capture final elapsed when done
  useEffect(() => {
    if (done) setElapsed(Date.now() - startRef.current);
  }, [done]);

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card p-4 transition-all duration-300">
      <div className="flex items-center gap-2 mb-4">
        {!done ? (
          <RefreshCw className="h-3.5 w-3.5 text-accent animate-spin" />
        ) : (
          <RefreshCw className="h-3.5 w-3.5 text-muted-foreground" />
        )}
        <h2 className="text-sm font-semibold tracking-tight text-foreground">Live Research</h2>
      </div>

      <div className="pl-0.5">
        <AgentTimeline events={events} done={done} />
      </div>
    </div>
  );
}
