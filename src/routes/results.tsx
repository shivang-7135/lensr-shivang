import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { z } from "zod";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { ResultsStream } from "@/components/ResultsStream";

const searchSchema = z.object({ q: z.string().catch("") });

export const Route = createFileRoute("/results")({
  validateSearch: (s) => searchSchema.parse(s),
  head: ({ match }) => ({
    meta: [
      { title: `${(match.search as { q: string }).q || "Search"} — Lensr` },
      { name: "description", content: "Live agent-powered search results." },
    ],
  }),
  component: ResultsPage,
  errorComponent: ({ error }) => (
    <div className="min-h-screen flex items-center justify-center p-6 text-center">
      <div>
        <p className="text-destructive font-medium mb-2">Something went wrong.</p>
        <p className="text-sm text-muted-foreground mb-4">{error.message}</p>
        <Link to="/" className="underline">
          Back home
        </Link>
      </div>
    </div>
  ),
  notFoundComponent: () => <div className="p-10">Not found.</div>,
});

function ResultsPage() {
  const { q } = Route.useSearch();
  const [fastMode, setFastMode] = useState(true);

  return (
    <div className="min-h-screen flex flex-col overflow-x-hidden">
      <SiteHeader />
      <main className="flex-1 mx-auto max-w-5xl w-full px-4 sm:px-6 py-4 sm:py-6 overflow-x-hidden">
        {/* Compact search bar on results page */}
        <div className="mb-4 max-w-2xl">
          <SearchBar initial={q} />
        </div>

        {q && (
          <div className="flex items-center justify-end mb-4">

            {/* Fast/Deep toggle */}
            <motion.div
              layout
              className="flex p-0.5 rounded-lg border border-border bg-secondary"
            >
              <button
                onClick={() => setFastMode(true)}
                className={`relative text-xs px-3.5 py-1.5 rounded-md font-medium transition-colors ${
                  fastMode ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {fastMode && (
                  <motion.div
                    layoutId="mode-indicator"
                    className="absolute inset-0 bg-card rounded-md shadow-sm border border-border"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">Fast</span>
              </button>
              <button
                onClick={() => setFastMode(false)}
                className={`relative text-xs px-3.5 py-1.5 rounded-md font-medium transition-colors ${
                  !fastMode ? "text-foreground" : "text-muted-foreground"
                }`}
              >
                {!fastMode && (
                  <motion.div
                    layoutId="mode-indicator"
                    className="absolute inset-0 bg-card rounded-md shadow-sm border border-border"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <span className="relative z-10">Deep</span>
              </button>
            </motion.div>
          </div>
        )}

        {q ? (
          <ResultsStream key={`${q}-${fastMode}`} query={q} fastMode={fastMode} />
        ) : (
          <p className="text-muted-foreground">Type a query above to start.</p>
        )}
      </main>
    </div>
  );
}
