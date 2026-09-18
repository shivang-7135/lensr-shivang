import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { authClient, useSession } from "@/lib/auth-client";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();
  const { data: session } = useSession();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > 100 && latest > previous) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  const email = session?.user?.email;
  const isAdmin = session?.user?.role === "admin";

  return (
    <motion.header
      animate={{ y: hidden ? "-100%" : "0%" }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="sticky top-0 z-40 bg-background/80 backdrop-blur-sm border-b border-border/50"
    >
      <div className="mx-auto max-w-6xl px-6 h-14 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2.5 group">
          <span className="h-7 w-7 rounded-lg bg-accent flex items-center justify-center font-display text-sm font-bold text-accent-foreground">
            L
          </span>
          <span className="font-display text-lg tracking-tight font-medium">Lensr</span>
        </Link>

        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/saved"
            className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Saved
          </Link>
          {isAdmin && (
            <Link
              to="/admin"
              className="px-3 py-1.5 rounded-lg text-accent hover:bg-secondary transition-colors"
            >
              Admin
            </Link>
          )}
          <div className="w-px h-5 bg-border mx-1" />
          <ThemeToggle />
          {email ? (
            <button
              onClick={() => authClient.signOut()}
              className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              Sign out
            </button>
          ) : (
            <Link
              to="/auth"
              className="px-3.5 py-1.5 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90 transition-opacity text-sm"
            >
              Sign in
            </Link>
          )}
        </nav>
      </div>
    </motion.header>
  );
}
