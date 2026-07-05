"use client";

import { motion } from "framer-motion";
import type { ReactNode } from "react";

interface ResultCardProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

/**
 * Base animated card wrapper for all result types.
 * Provides consistent entrance animation, padding, and border styling.
 */
export function ResultCard({ children, delay = 0, className = "" }: ResultCardProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: [0.16, 1, 0.3, 1] }}
      className={`rounded-xl border border-border bg-card p-5 sm:p-6 ${className}`}
    >
      {children}
    </motion.div>
  );
}

/**
 * Section within a result card — for dividing content into visual blocks.
 */
export function ResultSection({
  title,
  icon,
  children,
  className = "",
}: {
  title?: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`${className}`}>
      {title && (
        <div className="flex items-center gap-2 mb-3">
          {icon && <span className="text-accent">{icon}</span>}
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        </div>
      )}
      {children}
    </div>
  );
}
