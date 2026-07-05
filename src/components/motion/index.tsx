/* eslint-disable react-refresh/only-export-components */
"use client";

import { motion, AnimatePresence, type Variants } from "framer-motion";
import type { ReactNode, ComponentProps } from "react";

// ─── Shared easing curves ────────────────────────────────────────────────────
export const ease = {
  out: [0.16, 1, 0.3, 1] as [number, number, number, number],
  inOut: [0.4, 0, 0.2, 1] as [number, number, number, number],
  spring: { type: "spring" as const, stiffness: 300, damping: 30 },
};

// ─── Fade In ─────────────────────────────────────────────────────────────────
export function FadeIn({
  children,
  delay = 0,
  duration = 0.5,
  className,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration, delay, ease: ease.out }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Slide Up (fade + translate Y) ──────────────────────────────────────────
export function SlideUp({
  children,
  delay = 0,
  duration = 0.5,
  distance = 16,
  className,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  distance?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: distance }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: distance / 2 }}
      transition={{ duration, delay, ease: ease.out }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Scale In ────────────────────────────────────────────────────────────────
export function ScaleIn({
  children,
  delay = 0,
  duration = 0.4,
  className,
}: {
  children: ReactNode;
  delay?: number;
  duration?: number;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration, delay, ease: ease.out }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Stagger Children ────────────────────────────────────────────────────────
const staggerContainer: Variants = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const staggerItem: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: ease.out } },
};

export function StaggerChildren({
  children,
  className,
  staggerDelay = 0.06,
}: {
  children: ReactNode;
  className?: string;
  staggerDelay?: number;
}) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0 },
        show: {
          opacity: 1,
          transition: { staggerChildren: staggerDelay, delayChildren: 0.1 },
        },
      }}
      initial="hidden"
      animate="show"
      className={className}
    >
      {children}
    </motion.div>
  );
}

export function StaggerItem({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div variants={staggerItem} className={className}>
      {children}
    </motion.div>
  );
}

// ─── Page Transition Wrapper ─────────────────────────────────────────────────
export function PageTransition({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.3, ease: ease.out }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

// ─── Text Reveal (word by word) ──────────────────────────────────────────────
export function TextReveal({
  text,
  className,
  delay = 0,
}: {
  text: string;
  className?: string;
  delay?: number;
}) {
  const words = text.split(" ");
  return (
    <motion.span className={className}>
      {words.map((word, i) => (
        <motion.span
          key={i}
          initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          transition={{
            duration: 0.4,
            delay: delay + i * 0.04,
            ease: ease.out,
          }}
          className="inline-block mr-[0.25em]"
        >
          {word}
        </motion.span>
      ))}
    </motion.span>
  );
}

// ─── Thinking Dots (Claude-style) ────────────────────────────────────────────
export function ThinkingDots({ className }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 ${className ?? ""}`}>
      <span className="thinking-dot" />
      <span className="thinking-dot" />
      <span className="thinking-dot" />
    </span>
  );
}

// ─── Re-export motion & AnimatePresence for convenience ──────────────────────
export { motion, AnimatePresence };
export type { Variants };
