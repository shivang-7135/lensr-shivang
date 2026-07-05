import { createFileRoute } from "@tanstack/react-router";
import { SiteHeader } from "@/components/SiteHeader";
import { SearchBar } from "@/components/SearchBar";
import { CategoryGrid } from "@/components/CategoryGrid";
import { TextReveal, SlideUp } from "@/components/motion";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Lensr — search that thinks" },
      {
        name: "description",
        content:
          "Intent-aware search. Compare products, plan trips, track prices, write captions — powered by LangGraph agents.",
      },
      { property: "og:title", content: "Lensr — search that thinks" },
      {
        property: "og:description",
        content: "Intent-aware search. Compare products, plan trips, track prices, write captions.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto max-w-3xl px-6 pt-24 sm:pt-32 pb-20">
          {/* Hero */}
          <div className="text-center mb-12">
            <SlideUp delay={0} duration={0.6}>
              <p className="text-sm text-muted-foreground mb-4 tracking-wide">
                An intent-aware search engine
              </p>
            </SlideUp>

            <h1 className="display text-5xl sm:text-7xl font-bold tracking-tight mb-6">
              <TextReveal text="Don't search." delay={0.1} />
              <br />
              <span className="text-accent">
                <TextReveal text="Ask." delay={0.4} />
              </span>
            </h1>

            <SlideUp delay={0.5} duration={0.6}>
              <p className="text-lg text-muted-foreground max-w-xl mx-auto leading-relaxed">
                Lensr routes your query to a specialized agent and returns{" "}
                <strong className="text-foreground font-medium">one opinionated answer</strong>{" "}
                instead of ten blue links.
              </p>
            </SlideUp>
          </div>

          {/* Search */}
          <SlideUp delay={0.6} duration={0.5}>
            <SearchBar />
          </SlideUp>

          {/* Categories */}
          <CategoryGrid />
        </div>
      </main>

      <footer className="py-6 text-center text-xs text-muted-foreground border-t border-border">
        Built with TanStack Start · LangGraph · AWS Bedrock
      </footer>
    </div>
  );
}
