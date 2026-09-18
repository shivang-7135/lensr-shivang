import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { Search, Clock } from "lucide-react";
import { getSavedSearches } from "@/lib/saved.functions";
import { useQuery } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/saved")({
  head: () => ({ meta: [{ title: "Saved Searches — Lensr" }] }),
  component: SavedPage,
});

function SavedPage() {
  const { data: searches, isLoading } = useQuery({
    queryKey: ["saved_searches"],
    queryFn: () => getSavedSearches(),
  });

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1 max-w-3xl w-full mx-auto p-6">
        <div className="mb-8">
          <h1 className="display text-3xl font-bold mb-2">Saved Searches</h1>
          <p className="text-muted-foreground">Your recent research history.</p>
        </div>

        {isLoading ? (
          <div className="flex justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-foreground"></div>
          </div>
        ) : !searches?.length ? (
          <div className="text-center p-12 border-2 border-dashed border-border rounded-xl">
            <Clock className="mx-auto h-8 w-8 text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No saved searches yet.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {searches.map((s) => (
              <a
                key={s.id}
                href={`/results?q=${encodeURIComponent(s.query)}`}
                className="block p-4 border border-border rounded-xl hover:bg-secondary/50 transition flex items-start gap-4"
              >
                <div className="bg-secondary p-2 rounded-lg mt-0.5">
                  <Search className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-medium line-clamp-1">{s.query}</h3>
                  <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground">
                    <span className="capitalize px-2 py-0.5 bg-muted rounded-full">{s.intent}</span>
                    <span>{new Date(s.created_at).toLocaleDateString()}</span>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
