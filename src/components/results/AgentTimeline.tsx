import { useState } from "react";
import {
  Search,
  Brain,
  Globe,
  FileText,
  RefreshCw,
  Sparkles,
  Eye,
  ChevronDown,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import type { StreamEvent } from "@/lib/search/types";

const STAGE_META: Record<string, { icon: typeof Search; label: string; color: string }> = {
  extract_keywords: { icon: Brain, label: "Extracting keywords", color: "text-violet-400" },
  plan: { icon: Sparkles, label: "Planning search queries", color: "text-accent" },
  vision: { icon: Eye, label: "Analyzing image", color: "text-blue-400" },
  synthesize: { icon: Sparkles, label: "Synthesizing answer", color: "text-accent" },
};

interface StageGroup {
  stageEvent: StreamEvent & { type: "stage" };
  subEvents: StreamEvent[];
}

export function AgentTimeline({ events, done }: { events: StreamEvent[]; done: boolean }) {
  const [expandedQueries, setExpandedQueries] = useState(false);

  // Group events by stage to keep the timeline clean and hierarchical
  const groups: StageGroup[] = [];
  let currentGroup: StageGroup | null = null;

  for (const e of events) {
    if (e.type === "stage") {
      currentGroup = {
        stageEvent: e,
        subEvents: [],
      };
      groups.push(currentGroup);
    } else if (currentGroup) {
      if (
        [
          "keywords_extracted",
          "search_plan",
          "search_results",
          "scrape_progress",
          "reflection",
          "vision_result",
          "thinking",
        ].includes(e.type)
      ) {
        currentGroup.subEvents.push(e);
      }
    }
  }

  const totalSources = events
    .filter((e) => e.type === "search_results")
    .reduce((a, e) => a + (e.type === "search_results" ? e.count : 0), 0);

  if (!groups.length) {
    return (
      <ol className="space-y-2.5 text-sm list-none pl-0">
        <li className="flex items-center gap-2 animate-pulse text-muted-foreground font-sans text-xs pl-7 relative">
          <div className="absolute left-[calc(0.5rem-3px)] top-1.5 h-1.5 w-1.5 rounded-full bg-accent/60" />
          Connecting to research engine…
        </li>
      </ol>
    );
  }

  const renderIndicator = (isCompleted: boolean, isActive: boolean) => {
    if (isActive) {
      return (
        <div className="absolute left-[-9px] top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full border-[1.5px] border-accent dark:border-[#93c5fd] bg-accent/20 dark:bg-[#1e3a8a]">
          <span className="h-[6px] w-[6px] rounded-full bg-accent dark:bg-[#93c5fd]"></span>
        </div>
      );
    }
    if (isCompleted) {
      return (
        <div className="absolute left-[-9px] top-1.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-transparent border-[1.5px] border-border dark:border-[#3f3f46]">
          <CheckCircle2
            className="h-[18px] w-[18px] text-muted-foreground dark:text-[#a1a1aa]"
            strokeWidth={1.5}
          />
        </div>
      );
    }
    return (
      <div className="absolute left-[-9px] top-1.5 h-[18px] w-[18px] rounded-full bg-transparent border-[1.5px] border-border dark:border-[#3f3f46]" />
    );
  };

  return (
    <ol className="space-y-6 text-sm border-l border-border/60 dark:border-[#333] ml-[9px] mt-[9px] list-none pl-0">
      {groups.map((group, i) => {
        const isLast = i === groups.length - 1;
        const isCompleted = done || !isLast;
        const isActive = !done && isLast;

        const stage = group.stageEvent.stage;
        const isSearch = stage.startsWith("search_loop");
        const meta = STAGE_META[stage];
        const label = meta?.label ?? (isSearch ? `Search pass ${stage.split("_").pop()}` : stage);

        return (
          <li
            key={i}
            className="relative pl-7 fade-up-enhanced font-medium"
            style={{ animationDelay: `${i * 100}ms` }}
          >
            {renderIndicator(isCompleted, isActive)}

            {/* Stage Title */}
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-sans font-medium text-foreground dark:text-white/90">
                {label}
              </span>
            </div>

            {/* Nested Sub-Events */}
            <div className="mt-2 space-y-3 font-normal">
              {group.subEvents.map((sub, subIdx) => {
                /* ── Keywords ── */
                if (sub.type === "keywords_extracted") {
                  return (
                    <div key={subIdx} className="space-y-1">
                      {sub.keywords.intent_summary && (
                        <p className="text-[11px] text-muted-foreground dark:text-[#a1a1aa] font-sans leading-relaxed">
                          {sub.keywords.intent_summary}
                        </p>
                      )}
                    </div>
                  );
                }

                /* ── Search plan ── */
                if (sub.type === "search_plan") {
                  return (
                    <div key={subIdx} className="space-y-1.5">
                      <button
                        onClick={() => setExpandedQueries((v) => !v)}
                        className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition font-sans"
                      >
                        <Search className="h-3 w-3 text-accent" />
                        <span>{sub.queries.length} search queries planned</span>
                        <ChevronDown
                          className={`h-3 w-3 transition-transform ${expandedQueries ? "rotate-180" : ""}`}
                        />
                      </button>
                      {expandedQueries && (
                        <ul className="mt-1 pl-3 border-l border-border dark:border-white/10 text-[11px] text-muted-foreground dark:text-[#a1a1aa] space-y-1 list-none font-sans">
                          {sub.queries.map((q, qi) => (
                            <li key={qi} className="flex items-start gap-1">
                              <span className="text-accent/60 font-mono">{qi + 1}.</span>
                              <span>{q}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  );
                }

                /* ── Search results ── */
                if (sub.type === "search_results") {
                  return (
                    <div
                      key={subIdx}
                      className="text-[11px] text-muted-foreground dark:text-[#a1a1aa] font-sans flex items-center gap-1.5"
                    >
                      <Globe className="h-3.5 w-3.5 text-sky-400 shrink-0" />
                      <span>
                        Found {sub.count} sources{sub.loop > 1 && ` (pass ${sub.loop})`}
                      </span>
                    </div>
                  );
                }

                /* ── Scrape progress ── */
                if (sub.type === "scrape_progress") {
                  return (
                    <div
                      key={subIdx}
                      className="flex items-center gap-1.5 text-xs text-muted-foreground font-sans"
                    >
                      <FileText className="h-3.5 w-3.5 shrink-0" />
                      <span>Reading {sub.count} pages…</span>
                    </div>
                  );
                }

                /* ── Reflection ── */
                if (sub.type === "reflection") {
                  const sufficient = sub.done;
                  return (
                    <div
                      key={subIdx}
                      className="glass-soft rounded-lg p-3 border border-border dark:border-white/5 space-y-1 bg-card/30"
                    >
                      <div
                        className={`flex items-center gap-1.5 text-xs font-semibold font-sans ${sufficient ? "text-emerald-500 dark:text-emerald-400" : "text-amber-500 dark:text-amber-400"}`}
                      >
                        {sufficient ? (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        ) : (
                          <AlertCircle
                            className="h-3.5 w-3.5 animate-spin"
                            style={{ animationDuration: "3s" }}
                          />
                        )}
                        <span>
                          {sufficient
                            ? "Sufficient evidence gathered"
                            : "Reflection: Need more data"}
                        </span>
                      </div>
                      {!sufficient && sub.missing && (
                        <p className="text-[11px] text-muted-foreground italic font-sans pl-5 leading-relaxed">
                          {sub.missing}
                        </p>
                      )}
                    </div>
                  );
                }

                /* ── Vision result ── */
                if (sub.type === "vision_result") {
                  return (
                    <div
                      key={subIdx}
                      className="glass-soft rounded-lg p-3 border border-border dark:border-white/5 space-y-1 bg-card/30"
                    >
                      <div className="flex items-center gap-1.5 text-xs font-medium text-blue-500 dark:text-blue-400 font-sans">
                        <Eye className="h-3.5 w-3.5" />
                        <span>Scene detected</span>
                      </div>
                      {sub.scene.scene && (
                        <p className="text-[11px] text-muted-foreground font-sans leading-relaxed pl-5">
                          {sub.scene.scene}
                        </p>
                      )}
                    </div>
                  );
                }

                /* ── Thinking / live reasoning ── */
                if (sub.type === "thinking") {
                  return (
                    <div
                      key={subIdx}
                      className="flex items-start gap-2 text-[11px] text-foreground/60 italic font-sans leading-relaxed bg-violet-500/5 dark:bg-violet-500/10 rounded-md px-2.5 py-1.5 border border-violet-200/30 dark:border-violet-500/20"
                    >
                      <Brain className="h-3.5 w-3.5 text-violet-500 dark:text-violet-400 shrink-0 mt-0.5" />
                      <span>{sub.message}</span>
                    </div>
                  );
                }

                return null;
              })}
            </div>
          </li>
        );
      })}

      {done && totalSources > 0 && (
        <li
          className="relative pl-7 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 font-semibold mt-2 pt-3 border-t border-border dark:border-white/10 fade-up-enhanced"
          style={{ animationDelay: `${groups.length * 100}ms` }}
        >
          <div className="absolute left-[calc(0.5rem-6px)] top-3 flex h-3 w-3 items-center justify-center rounded-full bg-emerald-500 text-white shadow-[0_0_12px_oklch(0.62_0.16_165/0.5)]">
            <CheckCircle2 className="h-2.5 w-2.5 text-white" />
          </div>
          <span className="font-sans">Research complete · {totalSources} sources analyzed</span>
        </li>
      )}
      {!done && (
        <li className="relative pl-7 flex items-center gap-2 text-[13px] font-sans font-medium text-muted-foreground dark:text-[#52525b]">
          <div className="absolute left-[-5px] top-[7px] h-[10px] w-[10px] rounded-full bg-muted dark:bg-[#27272a]" />
          <span>Synthesizing answer...</span>
        </li>
      )}
    </ol>
  );
}
