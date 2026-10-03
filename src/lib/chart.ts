/** Chart helpers kept out of the component so they're unit-testable. */
import type { ChartColor, ChartSeries, ChartSpec } from "../../shared/contracts";
import { MAX_CHART_CATEGORIES, MAX_CHART_SERIES } from "../../shared/contracts";

/** Colour roles → CSS tokens (validated: blue/orange categorical, green/red status). */
const COLOR_VARS: Record<ChartColor, string> = {
  series1: "var(--chart-series-1)",
  series2: "var(--chart-series-2)",
  good: "var(--chart-good)",
  critical: "var(--chart-critical)",
};

export function chartColor(color: ChartColor): string {
  return COLOR_VARS[color] ?? COLOR_VARS.series1;
}

/** 0 plus 2-4 clean, integer ticks covering `max`. */
export function niceTicks(max: number): number[] {
  if (max <= 0) return [0, 1];
  const rough = max / 3;
  const pow = 10 ** Math.floor(Math.log10(rough));
  const step = Math.max(1, [1, 2, 5, 10].map((m) => m * pow).find((s) => s >= rough) ?? 10 * pow);
  const ticks: number[] = [];
  for (let t = 0; t <= max + step - 1e-9; t += step) ticks.push(Math.round(t));
  return ticks;
}

/** Key of the top-most non-zero segment in a stacked column (it gets the rounded end). */
export function stackedTop(series: ChartSeries[], index: number): string | null {
  for (let i = series.length - 1; i >= 0; i--) if ((series[i].values[index] ?? 0) > 0) return series[i].key;
  return null;
}

const COLORS = new Set<string>(["series1", "series2", "good", "critical"]);

/** Validates a chart from untrusted storage; returns null if anything is off. */
export function sanitizeChart(value: unknown): ChartSpec | null {
  if (typeof value !== "object" || value === null) return null;
  const c = value as Record<string, unknown>;
  if (c.kind !== "grouped" && c.kind !== "stacked" && c.kind !== "ranked") return null;
  if (!["id", "title", "subtitle", "unit"].every((k) => typeof c[k] === "string") || typeof c.sample !== "boolean") return null;
  const categories = c.categories;
  if (!Array.isArray(categories) || !categories.length || categories.length > MAX_CHART_CATEGORIES || !categories.every((x) => typeof x === "string")) return null;
  const series = c.series;
  if (!Array.isArray(series) || !series.length || series.length > MAX_CHART_SERIES) return null;
  const ok = series.every((s) => {
    const r = s as Record<string, unknown>;
    return (
      typeof r.key === "string" &&
      typeof r.name === "string" &&
      COLORS.has(r.color as string) &&
      Array.isArray(r.values) &&
      r.values.length === categories.length &&
      r.values.every((v) => typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e6)
    );
  });
  return ok ? (value as ChartSpec) : null;
}
