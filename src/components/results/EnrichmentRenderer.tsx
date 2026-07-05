"use client";

import { motion } from "framer-motion";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  BarChart3,
  Table2,
  Clock,
  GitCompare,
  Zap,
} from "lucide-react";
import type { EnrichmentArtifact } from "@/lib/search/types";

const COLORS = ["#D97706", "#059669", "#7C3AED", "#0EA5E9", "#F43F5E", "#8B5CF6"];

// ─── Chart Renderer ──────────────────────────────────────────────────────────
function ChartRenderer({ data }: { data: Extract<EnrichmentArtifact, { type: "chart" }> }) {
  if (!data.labels?.length || !data.datasets?.length) return null;

  const chartData = data.labels.map((label, i) => {
    const point: Record<string, string | number> = { name: label };
    data.datasets.forEach((ds) => {
      point[ds.label] = ds.data[i] ?? 0;
    });
    return point;
  });

  if (data.chart_type === "pie") {
    const pieData = data.labels.map((label, i) => ({
      name: label,
      value: data.datasets[0].data[i] ?? 0,
    }));
    return (
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={pieData}
            cx="50%"
            cy="50%"
            outerRadius={100}
            dataKey="value"
            label={({ name }) => name}
          >
            {pieData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Pie>
          <Tooltip />
        </PieChart>
      </ResponsiveContainer>
    );
  }

  if (data.chart_type === "line") {
    return (
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={chartData}>
          <XAxis dataKey="name" tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} />
          <Tooltip />
          <Legend />
          {data.datasets.map((ds, i) => (
            <Line
              key={i}
              type="monotone"
              dataKey={ds.label}
              stroke={ds.color || COLORS[i]}
              strokeWidth={2}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    );
  }

  if (data.chart_type === "radar") {
    return (
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={chartData}>
          <PolarGrid stroke="var(--border)" />
          <PolarAngleAxis dataKey="name" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis tick={{ fontSize: 10 }} />
          {data.datasets.map((ds, i) => (
            <Radar
              key={i}
              name={ds.label}
              dataKey={ds.label}
              stroke={ds.color || COLORS[i]}
              fill={ds.color || COLORS[i]}
              fillOpacity={0.15}
              strokeWidth={2}
            />
          ))}
          <Legend />
          <Tooltip />
        </RadarChart>
      </ResponsiveContainer>
    );
  }

  // Default: bar chart
  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={chartData}>
        <XAxis dataKey="name" tick={{ fontSize: 11 }} />
        <YAxis tick={{ fontSize: 11 }} />
        <Tooltip />
        <Legend />
        {data.datasets.map((ds, i) => (
          <Bar key={i} dataKey={ds.label} fill={ds.color || COLORS[i]} radius={[4, 4, 0, 0]} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

// ─── Table Renderer ──────────────────────────────────────────────────────────
function TableRenderer({ data }: { data: Extract<EnrichmentArtifact, { type: "table" }> }) {
  if (!data.headers?.length || !data.rows?.length) return null;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            {data.headers.map((h, i) => (
              <th
                key={i}
                className="text-left py-2.5 px-3 font-semibold text-foreground text-xs uppercase tracking-wider"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.rows.map((row, i) => (
            <tr
              key={i}
              className="border-b border-border/50 hover:bg-secondary/30 transition-colors"
            >
              {row.map((cell, j) => (
                <td key={j} className="py-2.5 px-3 text-foreground/80">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Timeline Renderer ───────────────────────────────────────────────────────
function TimelineRenderer({ data }: { data: Extract<EnrichmentArtifact, { type: "timeline" }> }) {
  if (!data.events?.length) return null;
  return (
    <div className="space-y-0">
      {data.events.map((ev, i) => (
        <div key={i} className="flex gap-3 items-start">
          <div className="flex flex-col items-center">
            <div className="w-3 h-3 rounded-full bg-accent shadow-sm shrink-0 mt-1" />
            {i < data.events.length - 1 && <div className="w-0.5 flex-1 min-h-[32px] bg-border" />}
          </div>
          <div className="pb-4">
            <span className="text-[11px] font-mono text-muted-foreground">{ev.date}</span>
            <p className="text-sm font-medium text-foreground leading-snug">{ev.event}</p>
            {ev.detail && <p className="text-xs text-muted-foreground mt-0.5">{ev.detail}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Comparison (Radar) Renderer ─────────────────────────────────────────────
function ComparisonRenderer({
  data,
}: {
  data: Extract<EnrichmentArtifact, { type: "comparison" }>;
}) {
  if (!data.items?.length || !data.dimensions?.length) return null;

  const radarData = data.dimensions.map((dim) => {
    const point: Record<string, string | number> = { dimension: dim };
    data.items.forEach((item) => {
      point[item.name] = item.scores[dim] ?? 0;
    });
    return point;
  });

  return (
    <ResponsiveContainer width="100%" height={300}>
      <RadarChart data={radarData}>
        <PolarGrid stroke="var(--border)" />
        <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
        <PolarRadiusAxis tick={{ fontSize: 10 }} domain={[0, 100]} />
        {data.items.map((item, i) => (
          <Radar
            key={i}
            name={item.name}
            dataKey={item.name}
            stroke={COLORS[i % COLORS.length]}
            fill={COLORS[i % COLORS.length]}
            fillOpacity={0.15}
            strokeWidth={2}
          />
        ))}
        <Legend />
        <Tooltip />
      </RadarChart>
    </ResponsiveContainer>
  );
}

// ─── Stat Cards Renderer ─────────────────────────────────────────────────────
function StatCardsRenderer({
  data,
}: {
  data: Extract<EnrichmentArtifact, { type: "stat_cards" }>;
}) {
  if (!data.stats?.length) return null;

  const TrendIcon = {
    up: TrendingUp,
    down: TrendingDown,
    neutral: Minus,
  };

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {data.stats.map((stat, i) => {
        const Icon = TrendIcon[stat.trend ?? "neutral"];
        const trendColor =
          stat.trend === "up"
            ? "text-emerald-500"
            : stat.trend === "down"
              ? "text-red-500"
              : "text-muted-foreground";
        return (
          <div key={i} className="p-3.5 rounded-xl border border-border bg-card">
            <p className="text-[11px] uppercase tracking-wider text-muted-foreground mb-1">
              {stat.label}
            </p>
            <div className="flex items-end gap-2">
              <span className="text-xl font-display font-bold text-foreground">{stat.value}</span>
              <Icon className={`h-4 w-4 ${trendColor} mb-0.5`} />
            </div>
            {stat.detail && <p className="text-xs text-muted-foreground mt-1">{stat.detail}</p>}
          </div>
        );
      })}
    </div>
  );
}

// ─── Type-to-icon mapping ────────────────────────────────────────────────────
const TYPE_ICONS = {
  chart: BarChart3,
  table: Table2,
  timeline: Clock,
  comparison: GitCompare,
  stat_cards: Zap,
} as const;

// ─── Main Component ──────────────────────────────────────────────────────────
export function EnrichmentRenderer({ data }: { data: EnrichmentArtifact }) {
  const Icon = TYPE_ICONS[data.type] ?? BarChart3;

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="rounded-xl border border-border overflow-hidden"
    >
      {/* Header */}
      <div className="px-4 py-3 bg-secondary/40 border-b border-border flex items-center gap-2">
        <Icon className="h-4 w-4 text-accent" />
        <span className="text-sm font-semibold text-foreground">
          {data.title || "Visual Summary"}
        </span>
        <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground bg-accent/10 px-2 py-0.5 rounded-full">
          AI Generated
        </span>
      </div>

      {/* Body */}
      <div className="p-4">
        {data.type === "chart" && <ChartRenderer data={data} />}
        {data.type === "table" && <TableRenderer data={data} />}
        {data.type === "timeline" && <TimelineRenderer data={data} />}
        {data.type === "comparison" && <ComparisonRenderer data={data} />}
        {data.type === "stat_cards" && <StatCardsRenderer data={data} />}
      </div>
    </motion.div>
  );
}
