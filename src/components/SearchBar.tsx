import { useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, type FormEvent } from "react";
import { motion } from "framer-motion";
import { Search, ArrowRight } from "lucide-react";

const INTENT_CHIPS = [
  { label: "Buy a phone", q: "best phone under $700 for photography" },
  { label: "Plan a trip", q: "5-day trip to Lisbon in October" },
  { label: "Price history", q: "price history of Sony WH-1000XM5" },
  { label: "Insta caption", q: "/insta" },
];

export function SearchBar({ initial = "", autoFocus: shouldAutoFocus = false }: { initial?: string; autoFocus?: boolean }) {
  const [q, setQ] = useState(initial);
  const [focused, setFocused] = useState(false);
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setQ(initial);
  }, [initial]);

  // Spotlight mouse tracking
  const handleMouseMove = (e: React.MouseEvent) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty("--spotlight-x", `${e.clientX - rect.left}px`);
    el.style.setProperty("--spotlight-y", `${e.clientY - rect.top}px`);
  };

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!q.trim()) return;
    // Dismiss mobile keyboard immediately on submit
    inputRef.current?.blur();
    navigate({ to: "/results", search: { q: q.trim() } });
  }

  return (
    <div className="w-full">
      <motion.form
        onSubmit={submit}
        initial={false}
        animate={{ scale: focused ? 1.01 : 1 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="relative"
      >
        <div
          ref={containerRef}
          onMouseMove={handleMouseMove}
          className="spotlight relative rounded-2xl"
        >
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground pointer-events-none z-10" />
          <input
            ref={inputRef}
            autoFocus={shouldAutoFocus}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="Ask anything…"
            className="glass-input w-full rounded-2xl pl-13 pr-24 sm:pr-32 py-4 sm:py-5 text-base sm:text-lg text-foreground placeholder:text-muted-foreground relative z-10"
          />
          <button
            type="submit"
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity text-sm"
          >
            <span className="hidden sm:inline">Search</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </motion.form>

      <div className="flex flex-wrap gap-2 mt-4">
        {INTENT_CHIPS.map((c, i) => (
          <motion.button
            key={c.label}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 + i * 0.05, duration: 0.3 }}
            whileHover={{ scale: 1.04 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => {
              if (c.q.startsWith("/")) navigate({ to: c.q });
              else {
                setQ(c.q);
                navigate({ to: "/results", search: { q: c.q } });
              }
            }}
            className="text-xs px-3.5 py-2 rounded-full border border-border bg-card text-muted-foreground hover:text-foreground hover:border-accent/50 transition-colors"
          >
            {c.label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
