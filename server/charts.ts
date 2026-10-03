/**
 * Server-computed charts. Every number here comes from connector data, never
 * from the model, so a chart always agrees with the sources beside it.
 */
import type { ChartSeries, ChartSpec } from "../shared/contracts.js";
import type { RetrievalPlan } from "./retrieval/router.js";
import type { LinearActivityNode } from "./retrieval/linear.js";
import type { PosthogRow } from "./retrieval/posthog.js";
import type { SentryDay } from "./retrieval/sentry.js";
import type { RetrievedItem } from "./retrieval/types.js";

const DAY_MS = 86_400_000;
const DAILY_MAX_DAYS = 14;
const TREND_MIN_DAYS = 28;
const STATE_ORDER = ["Backlog", "Todo", "In Progress", "In Review", "Done", "Canceled"];
const FAILED = new Set(["failure", "timed_out", "cancelled", "startup_failure", "action_required"]);

export interface CiRunPoint {
  repo: string;
  createdAt: string;
  conclusion: string | null;
  /** Present when the question named a check: that job's conclusion within the run. */
  jobConclusion?: string | null;
}

export interface ChartInputs {
  items: RetrievedItem[];
  activity?: LinearActivityNode[];
  runs?: CiRunPoint[];
  posthog?: PosthogRow[];
  sentryDaily?: SentryDay[];
  sentryEnvironment?: string;
  /** Per-dataset sample flags (sample connectors produce sample charts). */
  sample: { linear: boolean; github: boolean };
}

interface Buckets {
  labels: string[];
  unit: "day" | "week";
  indexOf: (iso: string | null | undefined) => number;
}

function dayKey(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

function dayLabel(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone, weekday: "short", day: "numeric" }).format(ms);
}

function shortDate(ms: number, timeZone: string): string {
  return new Intl.DateTimeFormat("en-AU", { timeZone, day: "numeric", month: "short" }).format(ms);
}

/** Daily buckets up to 14 days, weekly beyond; the last bucket ends "now". */
export function makeBuckets(days: number, nowMs: number, timeZone: string): Buckets {
  if (days <= DAILY_MAX_DAYS) {
    const stamps = Array.from({ length: days }, (_, i) => nowMs - (days - 1 - i) * DAY_MS);
    const keys = stamps.map((ms) => dayKey(ms, timeZone));
    return {
      labels: stamps.map((ms) => dayLabel(ms, timeZone)),
      unit: "day",
      indexOf: (iso) => (iso ? keys.indexOf(dayKey(Date.parse(iso), timeZone)) : -1),
    };
  }
  const weeks = Math.ceil(days / 7);
  const start = nowMs - weeks * 7 * DAY_MS;
  return {
    labels: Array.from({ length: weeks }, (_, i) => `w/c ${shortDate(start + i * 7 * DAY_MS + DAY_MS, timeZone)}`),
    unit: "week",
    indexOf: (iso) => {
      const t = iso ? Date.parse(iso) : NaN;
      if (!Number.isFinite(t) || t <= start || t > nowMs) return -1;
      return Math.min(weeks - 1, Math.floor((t - start) / (7 * DAY_MS)));
    },
  };
}

function count(buckets: Buckets, dates: Array<string | null | undefined>): number[] {
  const values = buckets.labels.map(() => 0);
  for (const iso of dates) {
    const i = buckets.indexOf(iso);
    if (i >= 0) values[i] += 1;
  }
  return values;
}

const repoName = (repo: string) => {
  const last = repo.split("/")[1]?.split("-").pop() ?? repo;
  return last.charAt(0).toUpperCase() + last.slice(1);
};

const windowNote = (days: number, unit: "day" | "week", timeZone: string) => `Last ${days} days · per ${unit} · ${timeZone.split("/").pop()?.replace("_", " ")} time`;

export function prsPerDay(items: RetrievedItem[], repos: string[], days: number, nowMs: number, timeZone: string, sample: boolean): ChartSpec | null {
  const merged = items.filter((i) => i.citation.kind === "github_pr" && i.citation.status === "merged");
  const b = makeBuckets(days, nowMs, timeZone);
  const series: ChartSeries[] = repos.slice(0, 2).map((repo, idx) => ({
    key: repo,
    name: repoName(repo),
    color: idx === 0 ? "series1" : "series2",
    values: count(b, merged.filter((i) => i.citation.id.startsWith(`github:PR:${repo}#`)).map((i) => i.updatedAt)),
  }));
  if (!series.some((s) => s.values.some(Boolean))) return null;
  return {
    id: "prs_per_day",
    kind: "grouped",
    title: `PRs merged per ${b.unit}`,
    subtitle: `${windowNote(days, b.unit, timeZone)} · GitHub`,
    categories: b.labels,
    series,
    unit: "PRs",
    sample,
  };
}

export function ticketsByState(items: RetrievedItem[], sample: boolean): ChartSpec | null {
  const byId = new Map(items.filter((i) => i.citation.kind === "linear_issue").map((i) => [i.citation.id, i]));
  const issues = [...byId.values()];
  if (!issues.length) return null;
  const present = new Set(issues.map((i) => i.citation.status ?? "Unknown"));
  const states = [...STATE_ORDER.filter((s) => present.has(s)), ...[...present].filter((s) => !STATE_ORDER.includes(s))];
  const isBug = (i: RetrievedItem) => (i.labels ?? []).some((l) => /bug/i.test(l));
  const hasBugs = issues.some(isBug);
  const tally = (filter: (i: RetrievedItem) => boolean) => states.map((s) => issues.filter((i) => (i.citation.status ?? "Unknown") === s && filter(i)).length);
  const series: ChartSeries[] = hasBugs
    ? [
        { key: "bug", name: "Bugs", color: "series2", values: tally(isBug) },
        { key: "other", name: "Other tickets", color: "series1", values: tally((i) => !isBug(i)) },
      ]
    : [{ key: "all", name: "Tickets", color: "series1", values: tally(() => true) }];
  return {
    id: "tickets_by_state",
    kind: "stacked",
    title: "Linear tickets by status",
    subtitle: `${issues.length} most recently updated tickets · Linear`,
    categories: states,
    series,
    unit: "tickets",
    sample,
  };
}

export function openedVsClosed(activity: LinearActivityNode[], days: number, nowMs: number, timeZone: string, bugsOnly: boolean, sample: boolean): ChartSpec | null {
  const span = Math.max(days, TREND_MIN_DAYS);
  const b = makeBuckets(span, nowMs, timeZone);
  const pool = bugsOnly ? activity.filter((a) => (a.labels?.nodes ?? []).some((l) => /bug/i.test(l.name))) : activity;
  const series: ChartSeries[] = [
    { key: "opened", name: "Opened", color: "series2", values: count(b, pool.map((a) => a.createdAt)) },
    { key: "closed", name: "Closed", color: "series1", values: count(b, pool.map((a) => a.completedAt)) },
  ];
  if (!series.some((s) => s.values.some(Boolean))) return null;
  const noun = bugsOnly ? "Bugs" : "Tickets";
  return {
    id: "opened_vs_closed",
    kind: "grouped",
    title: `${noun} opened vs closed per ${b.unit}`,
    subtitle: `${windowNote(span, b.unit, timeZone)} · Linear`,
    categories: b.labels,
    series,
    unit: bugsOnly ? "bugs" : "tickets",
    sample,
  };
}

export function ciHistory(runs: CiRunPoint[], days: number, nowMs: number, timeZone: string, checkName: string | null, sample: boolean): ChartSpec | null {
  const b = makeBuckets(days, nowMs, timeZone);
  const outcome = (r: CiRunPoint) => (checkName ? r.jobConclusion : r.conclusion) ?? null;
  const done = runs.filter((r) => outcome(r) !== null && outcome(r) !== "skipped" && outcome(r) !== "neutral");
  const series: ChartSeries[] = [
    { key: "passed", name: "Passed", color: "good", values: count(b, done.filter((r) => outcome(r) === "success").map((r) => r.createdAt)) },
    { key: "failed", name: "Failed", color: "critical", values: count(b, done.filter((r) => FAILED.has(outcome(r) ?? "")).map((r) => r.createdAt)) },
  ];
  if (!series.some((s) => s.values.some(Boolean))) return null;
  const repos = [...new Set(runs.map((r) => repoName(r.repo)))].join(" + ");
  return {
    id: "ci_history",
    kind: "stacked",
    title: checkName ? `${checkName} results per ${b.unit}` : `CI runs per ${b.unit}`,
    subtitle: `${windowNote(days, b.unit, timeZone)} · ${repos} · all branches · GitHub Actions`,
    categories: b.labels,
    series,
    unit: checkName ? "runs of this check" : "workflow runs",
    sample,
  };
}

const PRODUCT_EVENTS = new Set(["$pageview", "product_navigation", "report_opened", "create_dialog_opened"]);

/** Sum `n` per bucket (PostHog rows are pre-aggregated per hour). */
function sumBy(buckets: Buckets, rows: PosthogRow[]): number[] {
  const values = buckets.labels.map(() => 0);
  for (const r of rows) {
    const i = buckets.indexOf(r.hour.includes("T") ? r.hour : r.hour.replace(" ", "T") + "Z");
    if (i >= 0) values[i] += r.n;
  }
  return values;
}

export function usageTrend(rows: PosthogRow[], days: number, nowMs: number, timeZone: string): ChartSpec | null {
  const b = makeBuckets(days, nowMs, timeZone);
  const product = rows.filter((r) => PRODUCT_EVENTS.has(r.event));
  const series: ChartSeries[] = [
    { key: "core", name: "Core", color: "series1", values: sumBy(b, product.filter((r) => r.app === "core")) },
    { key: "reporting", name: "Reporting", color: "series2", values: sumBy(b, product.filter((r) => r.app === "reporting")) },
  ];
  if (!series.some((s) => s.values.some(Boolean))) return null;
  return {
    id: "usage_trend",
    kind: "grouped",
    title: `Product activity per ${b.unit}`,
    subtitle: `${windowNote(days, b.unit, timeZone)} · page views, navigation, reports, create · PostHog`,
    categories: b.labels,
    series,
    unit: "events",
    sample: false,
  };
}

export function bffHealth(rows: PosthogRow[], days: number, nowMs: number, timeZone: string): ChartSpec | null {
  const b = makeBuckets(days, nowMs, timeZone);
  const bff = rows.filter((r) => r.event === "bff_status");
  const series: ChartSeries[] = [
    { key: "connected", name: "Connected", color: "good", values: sumBy(b, bff.filter((r) => r.detail === "true")) },
    { key: "disconnected", name: "Not connected", color: "critical", values: sumBy(b, bff.filter((r) => r.detail === "false")) },
  ];
  if (!series.some((s) => s.values.some(Boolean))) return null;
  return {
    id: "bff_health",
    kind: "stacked",
    title: `BFF connection checks per ${b.unit}`,
    subtitle: `${windowNote(days, b.unit, timeZone)} · Core + Reporting · PostHog bff_status`,
    categories: b.labels,
    series,
    unit: "checks",
    sample: false,
  };
}

export function assistantUsage(rows: PosthogRow[], days: number, nowMs: number, timeZone: string): ChartSpec | null {
  const b = makeBuckets(days, nowMs, timeZone);
  const msgs = rows.filter((r) => r.event === "assistant_message_sent");
  const series: ChartSeries[] = [
    { key: "answered", name: "Answered", color: "good", values: sumBy(b, msgs.filter((r) => r.detail === "answered")) },
    { key: "failed", name: "Failed", color: "critical", values: sumBy(b, msgs.filter((r) => r.detail === "failed")) },
  ];
  if (!series.some((s) => s.values.some(Boolean))) return null;
  return {
    id: "assistant_usage",
    kind: "stacked",
    title: `AI Assistant messages per ${b.unit}`,
    subtitle: `${windowNote(days, b.unit, timeZone)} · Core + Reporting · PostHog assistant_message_sent`,
    categories: b.labels,
    series,
    unit: "messages",
    sample: false,
  };
}

export function sentryErrors(daily: SentryDay[], days: number, nowMs: number, timeZone: string, environment: string): ChartSpec | null {
  const b = makeBuckets(days, nowMs, timeZone);
  const count = (app: string) => {
    const values = b.labels.map(() => 0);
    for (const d of daily.filter((x) => x.app === app)) {
      const i = b.indexOf(d.day);
      if (i >= 0) values[i] += d.n;
    }
    return values;
  };
  const series: ChartSeries[] = [
    { key: "core", name: "Core", color: "series1", values: count("core") },
    { key: "reporting", name: "Reporting", color: "series2", values: count("reporting") },
  ];
  if (!series.some((s) => s.values.some(Boolean))) return null;
  return {
    id: "sentry_errors",
    kind: "grouped",
    title: `Sentry events per ${b.unit}`,
    subtitle: `${windowNote(days, b.unit, timeZone)} · ${environment} only · Sentry`,
    categories: b.labels,
    series,
    unit: "events",
    sample: false,
  };
}

export function buildCharts(plan: RetrievalPlan, inputs: ChartInputs, nowMs: number, timeZone: string, bugsOnly: boolean): ChartSpec[] {
  const charts: Array<ChartSpec | null> = plan.charts.map((kind) => {
    switch (kind) {
      case "prs_per_day":
        return prsPerDay(inputs.items, plan.repos, plan.sinceDays, nowMs, timeZone, inputs.sample.github);
      case "tickets_by_state":
        return ticketsByState(inputs.items, inputs.sample.linear);
      case "opened_vs_closed":
        return inputs.activity ? openedVsClosed(inputs.activity, plan.sinceDays, nowMs, timeZone, bugsOnly, inputs.sample.linear) : null;
      case "ci_history":
        return inputs.runs ? ciHistory(inputs.runs, plan.sinceDays, nowMs, timeZone, plan.checkName, inputs.sample.github) : null;
      case "usage_trend":
        return inputs.posthog ? usageTrend(inputs.posthog, plan.sinceDays, nowMs, timeZone) : null;
      case "bff_health":
        return inputs.posthog ? bffHealth(inputs.posthog, plan.sinceDays, nowMs, timeZone) : null;
      case "assistant_usage":
        return inputs.posthog ? assistantUsage(inputs.posthog, plan.sinceDays, nowMs, timeZone) : null;
      case "insights_topics":
      case "insights_daily":
        return null; // built by the question-log path (retrieval/insightsUsage.ts)
      case "evals_daily":
      case "eval_checks":
        return null; // built by the workflow path (server/workflowQuestions.ts)
      case "sentry_errors":
        return inputs.sentryDaily ? sentryErrors(inputs.sentryDaily, plan.sinceDays, nowMs, timeZone, inputs.sentryEnvironment ?? "production") : null;
    }
  });
  return charts.filter((c): c is ChartSpec => c !== null);
}

/** States two-series comparisons outright, so the model never has to (it got "6 vs 4" backwards). */
function compareLine(chart: ChartSpec): string {
  if (chart.series.length !== 2) return "";
  const [a, b] = chart.series.map((s) => ({ name: s.name, total: s.values.reduce((sum, v) => sum + v, 0) }));
  const relation = a.total > b.total ? "MORE than" : a.total < b.total ? "LESS than" : "EQUAL to";
  return ` COMPARISON (use this; do not recompute): ${a.name} ${a.total} is ${relation} ${b.name} ${b.total}, difference ${Math.abs(a.total - b.total)}.`;
}

/** Compact text version for Grok, so the prose matches the chart exactly. */
export function describeChart(chart: ChartSpec): string {
  const totals = chart.series.map((s) => `${s.name} ${s.values.reduce((a, v) => a + v, 0)}`).join(", ");
  const rows = chart.categories.map((c, i) => `${c}: ${chart.series.map((s) => `${s.name}=${s.values[i]}`).join(" ")}`).join("; ");
  return `CHART "${chart.title}" (${chart.subtitle}${chart.sample ? "; SAMPLE DATA" : ""}). Totals: ${totals}.${compareLine(chart)} By column: ${rows}`;
}
