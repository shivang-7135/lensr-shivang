import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion, useMotionValueEvent, useScroll } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { ThemeToggle } from "./ThemeToggle";

export function SiteHeader() {
  const [email, setEmail] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    const previous = scrollY.getPrevious() ?? 0;
    if (latest > 100 && latest > previous) {
      setHidden(true);
    } else {
      setHidden(false);
    }
  });

  useEffect(() => {
    const sync = async (userId: string | undefined) => {
      if (!userId) {
        setIsAdmin(false);
        return;
      }
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", userId)
        .eq("role", "admin")
        .maybeSingle();
      setIsAdmin(!!data);
    };
    supabase.auth.getSession().then(({ data }) => {
      setEmail(data.session?.user.email ?? null);
      sync(data.session?.user.id);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => {
      setEmail(session?.user.email ?? null);
      sync(session?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

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
            to="/insta"
            className="px-3 py-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            Insta
          </Link>
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
              onClick={() => supabase.auth.signOut()}
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
