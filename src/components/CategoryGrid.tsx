import { useNavigate } from "@tanstack/react-router";
import { motion } from "framer-motion";
import { SEARCH_CATEGORIES } from "@/lib/search/categories";

const container = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: { staggerChildren: 0.04, delayChildren: 0.2 },
  },
};

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export function CategoryGrid() {
  const navigate = useNavigate();

  return (
    <section className="mt-24 relative">
      <div className="mb-8">
        <h2 className="font-display text-2xl sm:text-3xl tracking-tight font-semibold mb-2">
          Try asking…
        </h2>
        <p className="text-sm text-muted-foreground">
          Twenty things Lensr is good at. Tap one to see it in action.
        </p>
      </div>

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3"
      >
        {SEARCH_CATEGORIES.map((c) => (
          <motion.button
            key={c.id}
            variants={item}
            whileHover={{ y: -2, transition: { duration: 0.2 } }}
            whileTap={{ scale: 0.98 }}
            type="button"
            onClick={() => {
              if (c.to) navigate({ to: c.to });
              else navigate({ to: "/results", search: { q: c.example } });
            }}
            className="group text-left p-4 rounded-xl border border-border bg-card hover:border-accent/50 hover:shadow-md transition-all duration-200"
          >
            <div className="flex items-center gap-3 mb-2">
              <span className="text-2xl">{c.emoji}</span>
              <span className="font-display text-sm font-semibold leading-tight group-hover:text-accent transition-colors">
                {c.label}
              </span>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">{c.hint}</p>
            <p className="text-xs text-foreground/50 mt-2 line-clamp-1 italic">
              {c.to ? "Upload a photo →" : `"${c.example}"`}
            </p>
          </motion.button>
        ))}
      </motion.div>
    </section>
  );
}
