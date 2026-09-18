import { createFileRoute, Link } from "@tanstack/react-router";
import ReactMarkdown from "react-markdown";
import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { SiteHeader } from "@/components/SiteHeader";
import { ARCHITECTURE_MD } from "@/lib/architecture-content";
import {
  ChevronRight,
  Server,
  Shield,
  Zap,
  Eye,
  Database,
  Globe,
  Layers,
  GitBranch,
  FileCode,
  Award,
} from "lucide-react";

export const Route = createFileRoute("/app-info")({
  head: () => ({
    meta: [
      { title: "Architecture & System Design — Lensr" },
      {
        name: "description",
        content:
          "Comprehensive architecture documentation for Lensr — an intent-aware AI search engine built on Azure, AWS Bedrock, and TanStack Start.",
      },
    ],
  }),
  component: AppInfoPage,
});

/* ─── Table of Contents entries ──────────────────────────────────────── */

const TOC = [
  { id: "1-system-overview", label: "System Overview", icon: Globe },
  { id: "2-high-level-architecture", label: "Architecture", icon: Layers },
  { id: "3-azure-cloud-infrastructure", label: "Azure Infrastructure", icon: Server },
  { id: "4-tech-stack", label: "Tech Stack", icon: FileCode },
  { id: "5-request-flow-query--result-card", label: "Request Flow", icon: Zap },
  { id: "6-multi-agent-system", label: "Agent System", icon: GitBranch },
  { id: "7-llm-configuration", label: "LLM Config", icon: Database },
  { id: "8-semantic-caching", label: "Semantic Caching", icon: Database },
  { id: "9-security--compliance", label: "Security", icon: Shield },
  { id: "10-observability", label: "Observability", icon: Eye },
  { id: "11-cicd-pipeline", label: "CI/CD", icon: GitBranch },
  { id: "12-database-schema", label: "Database", icon: Database },
  { id: "13-project-structure", label: "Project Structure", icon: FileCode },
  { id: "14-why-this-architecture-is-production-grade", label: "Why It's Production-Grade", icon: Award },
];

/* ─── Markdown component overrides ───────────────────────────────────── */

const mdComponents = {
  h1: ({ children, ...props }: React.ComponentPropsWithoutRef<"h1">) => (
    <h1
      className="text-3xl sm:text-4xl font-bold tracking-tight text-foreground mt-10 mb-4 pb-3 border-b border-border"
      {...props}
    >
      {children}
    </h1>
  ),
  h2: ({ children, ...props }: React.ComponentPropsWithoutRef<"h2">) => {
    const text = typeof children === "string" ? children : "";
    const id = text
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-");
    return (
      <h2
        id={id}
        className="text-xl sm:text-2xl font-semibold tracking-tight text-foreground mt-10 mb-3 scroll-mt-20"
        {...props}
      >
        {children}
      </h2>
    );
  },
  h3: ({ children, ...props }: React.ComponentPropsWithoutRef<"h3">) => (
    <h3 className="text-lg font-semibold text-foreground mt-6 mb-2" {...props}>
      {children}
    </h3>
  ),
  p: ({ children, ...props }: React.ComponentPropsWithoutRef<"p">) => (
    <p className="text-sm leading-relaxed text-muted-foreground mb-4" {...props}>
      {children}
    </p>
  ),
  ul: ({ children, ...props }: React.ComponentPropsWithoutRef<"ul">) => (
    <ul className="list-disc list-inside text-sm text-muted-foreground mb-4 space-y-1 pl-2" {...props}>
      {children}
    </ul>
  ),
  ol: ({ children, ...props }: React.ComponentPropsWithoutRef<"ol">) => (
    <ol className="list-decimal list-inside text-sm text-muted-foreground mb-4 space-y-1 pl-2" {...props}>
      {children}
    </ol>
  ),
  li: ({ children, ...props }: React.ComponentPropsWithoutRef<"li">) => (
    <li className="text-sm text-muted-foreground" {...props}>
      {children}
    </li>
  ),
  strong: ({ children, ...props }: React.ComponentPropsWithoutRef<"strong">) => (
    <strong className="font-semibold text-foreground" {...props}>
      {children}
    </strong>
  ),
  blockquote: ({ children, ...props }: React.ComponentPropsWithoutRef<"blockquote">) => (
    <blockquote
      className="border-l-4 border-accent pl-4 py-2 my-4 bg-accent/5 rounded-r-lg text-sm italic text-muted-foreground"
      {...props}
    >
      {children}
    </blockquote>
  ),
  code: ({
    className,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<"code"> & { className?: string }) => {
    const isBlock = className?.startsWith("language-");
    if (isBlock) {
      return (
        <code
          className="block bg-secondary/80 text-foreground text-xs leading-relaxed rounded-lg p-4 overflow-x-auto font-mono whitespace-pre"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code className="bg-secondary px-1.5 py-0.5 rounded text-xs font-mono text-foreground" {...props}>
        {children}
      </code>
    );
  },
  pre: ({ children, ...props }: React.ComponentPropsWithoutRef<"pre">) => (
    <pre className="my-4 rounded-lg overflow-hidden" {...props}>
      {children}
    </pre>
  ),
  table: ({ children, ...props }: React.ComponentPropsWithoutRef<"table">) => (
    <div className="overflow-x-auto my-4 rounded-lg border border-border">
      <table className="w-full text-sm" {...props}>
        {children}
      </table>
    </div>
  ),
  thead: ({ children, ...props }: React.ComponentPropsWithoutRef<"thead">) => (
    <thead className="bg-secondary/50" {...props}>
      {children}
    </thead>
  ),
  th: ({ children, ...props }: React.ComponentPropsWithoutRef<"th">) => (
    <th className="px-3 py-2 text-left text-xs font-semibold text-foreground border-b border-border" {...props}>
      {children}
    </th>
  ),
  td: ({ children, ...props }: React.ComponentPropsWithoutRef<"td">) => (
    <td className="px-3 py-2 text-xs text-muted-foreground border-b border-border/50" {...props}>
      {children}
    </td>
  ),
  hr: () => <hr className="my-8 border-border" />,
  a: ({ children, href, ...props }: React.ComponentPropsWithoutRef<"a">) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-accent hover:underline"
      {...props}
    >
      {children}
    </a>
  ),
};

/* ─── Page component ─────────────────────────────────────────────────── */

function AppInfoPage() {
  const [activeSection, setActiveSection] = useState("");
  const contentRef = useRef<HTMLDivElement>(null);

  /* Track which section is in view via IntersectionObserver */
  useEffect(() => {
    const headings = document.querySelectorAll("h2[id]");
    if (!headings.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setActiveSection(entry.target.id);
          }
        }
      },
      { rootMargin: "-80px 0px -70% 0px", threshold: 0.1 },
    );

    headings.forEach((h) => observer.observe(h));
    return () => observer.disconnect();
  }, []);

  return (
    <div className="min-h-screen flex flex-col">
      <SiteHeader />

      <main className="flex-1">
        {/* Hero */}
        <div className="border-b border-border bg-gradient-to-b from-secondary/30 to-background">
          <div className="mx-auto max-w-6xl px-6 py-12 sm:py-16">
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
              <p className="text-xs font-medium text-accent uppercase tracking-widest mb-3">
                System Documentation
              </p>
              <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-foreground mb-4">
                Architecture &<br />
                System Design
              </h1>
              <p className="text-base sm:text-lg text-muted-foreground max-w-2xl leading-relaxed">
                A comprehensive guide to Lensr's production infrastructure — from Azure Container Apps
                and AWS Bedrock to semantic caching and multi-agent orchestration.
              </p>
            </motion.div>
          </div>
        </div>

        {/* Content with sidebar */}
        <div className="mx-auto max-w-6xl px-6 py-8">
          <div className="flex gap-10">
            {/* Table of Contents — desktop sidebar */}
            <motion.aside
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              className="hidden lg:block w-56 shrink-0"
            >
              <nav className="sticky top-20">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider mb-3">
                  On this page
                </p>
                <ul className="space-y-0.5">
                  {TOC.map(({ id, label, icon: Icon }) => (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-xs transition-colors ${
                          activeSection === id
                            ? "bg-accent/10 text-accent font-medium"
                            : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" />
                        {label}
                      </a>
                    </li>
                  ))}
                </ul>
              </nav>
            </motion.aside>

            {/* Main content */}
            <motion.div
              ref={contentRef}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 }}
              className="flex-1 min-w-0"
            >
              <article className="prose-custom">
                <ReactMarkdown components={mdComponents}>{ARCHITECTURE_MD}</ReactMarkdown>
              </article>

              {/* Footer */}
              <div className="mt-12 pt-6 border-t border-border">
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <p>Last updated: September 2026</p>
                  <Link to="/" className="flex items-center gap-1 text-accent hover:underline">
                    Back to search <ChevronRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </motion.div>
          </div>
        </div>
      </main>
    </div>
  );
}
