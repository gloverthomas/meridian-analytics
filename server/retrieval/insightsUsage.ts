/**
 * Reads the Insights question log (insights_question events) back from PostHog
 * for "what have people been asking?". Categories only — the log never
 * contains question text. Fixed aggregate HogQL; no user text in the query.
 */
import type { ChartSeries, ChartSpec } from "../../shared/contracts.js";
import { makeBuckets } from "../charts.js";
import { QUESTION_EVENT } from "../telemetry.js";
import type { PosthogDeps } from "./posthog.js";
import { CONNECTOR_TIMEOUT_MS, type RetrievedItem } from "./types.js";

const MAX_DAYS = 30;
export const LOG_STARTED = "26 Sep 2026";

export const TOPIC_LABELS: Record<string, string> = {
  issue_status: "Ticket status",
  ci_health: "CI health",
  trend: "Trends",
  problems: "Problems & bugs",
  merged_prs: "Merged PRs",
  linear_overview: "Tickets overview",
  general: "General",
  ticket_move: "Ticket moves",
  insights_usage: "Insights usage",
  workflow_plan: "Cursor plans",
  evals: "Eval tracking",
  pipeline: "Pipeline tracker",
  help: "What can I ask?",
  how_it_works: "How it works",
};

export interface QuestionRow {
  hour: string;
  topic: string;
  answerType: string;
  outcome: string;
  n: number;
  latencySum: number;
  charted: number;
}

export interface QuestionLog {
  rows: QuestionRow[];
  viewers: number;
}

async function hogql(deps: PosthogDeps, query: string): Promise<unknown[][]> {
  const res = await deps.fetch(`${deps.host}/api/projects/${deps.projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`posthog_${res.status}`);
  return ((await res.json()) as { results?: unknown[][] }).results ?? [];
}

const ANSWER_TYPES = new Set(["grok", "fixture", "digest", "action", "none"]);
const OUTCOMES = new Set(["answered", "fallback", "error"]);

/**
 * The log is written with PostHog's public project token, so anyone could send
 * look-alike events. Only rows with known topics/answer types/outcomes count.
 */
export function isGenuineRow(row: QuestionRow): boolean {
  return row.topic in TOPIC_LABELS && ANSWER_TYPES.has(row.answerType) && OUTCOMES.has(row.outcome);
}

export async function fetchQuestionLog(days: number, deps: PosthogDeps): Promise<QuestionLog> {
  const window = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  const where = `event = '${QUESTION_EVENT}' AND timestamp > now() - INTERVAL ${window} DAY`;
  const [rows, totals] = await Promise.all([
    hogql(
      deps,
      `SELECT toStartOfHour(timestamp) AS hour, properties.topic AS topic, properties.answer_type AS answer_type, properties.outcome AS outcome,
  count() AS n, sum(toFloat(properties.latency_ms)) AS latency_sum, countIf(toFloat(properties.chart_count) > 0) AS charted
FROM events WHERE ${where}
GROUP BY hour, topic, answer_type, outcome ORDER BY hour LIMIT 5000`,
    ),
    hogql(deps, `SELECT uniq(distinct_id) FROM events WHERE ${where}`),
  ]);
  return {
    rows: rows
      .map((r) => ({
      hour: String(r[0]),
      topic: String(r[1] ?? "general"),
      answerType: String(r[2] ?? "none"),
      outcome: String(r[3] ?? "answered"),
      n: Number(r[4]) || 0,
      latencySum: Number(r[5]) || 0,
        charted: Number(r[6]) || 0,
      }))
      .filter(isGenuineRow),
    viewers: Number(totals[0]?.[0]) || 0,
  };
}

const sum = (rows: QuestionRow[], pick: (r: QuestionRow) => number = (r) => r.n) => rows.reduce((a, r) => a + pick(r), 0);
const pct = (part: number, whole: number) => (whole ? Math.round((part / whole) * 100) : 0);

function tallyBy(rows: QuestionRow[], key: (r: QuestionRow) => string): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const r of rows) counts.set(key(r), (counts.get(key(r)) ?? 0) + r.n);
  return [...counts].sort((a, b) => b[1] - a[1]);
}

export function normalizeQuestionLog(log: QuestionLog, days: number, deps: Pick<PosthogDeps, "host" | "projectId">, nowIso: string): RetrievedItem {
  const id = `posthog:insights-questions:${days}d`;
  const total = sum(log.rows);
  const intro = `[${id}] INSIGHTS QUESTION LOG (categories only; question text is never recorded; log started ${LOG_STARTED}), last ${days} days:`;
  let body: string;
  if (!total) {
    body = ` No questions recorded yet.`;
  } else {
    const topics = tallyBy(log.rows, (r) => TOPIC_LABELS[r.topic] ?? r.topic).map(([t, n]) => `${t} ${n} (${pct(n, total)}%)`).join(", ");
    const types = tallyBy(log.rows, (r) => r.answerType).map(([t, n]) => `${t === "digest" ? "source list (Grok unavailable)" : t} ${n}`).join(", ");
    const fellBack = sum(log.rows.filter((r) => r.outcome === "fallback"));
    const errors = sum(log.rows.filter((r) => r.outcome === "error"));
    const avgSeconds = (sum(log.rows, (r) => r.latencySum) / total / 1000).toFixed(1);
    body = ` ${total} questions from about ${log.viewers} anonymous session(s). By topic: ${topics}. By answer type: ${types}. Fell back to a source list: ${fellBack} (${pct(fellBack, total)}%). Errors: ${errors}. Questions that included a chart: ${sum(log.rows, (r) => r.charted)}. Average answer time: ${avgSeconds}s.`;
  }
  return {
    connector: "posthog",
    citation: {
      id,
      kind: "posthog_insight",
      title: `Insights question log · last ${days} days`,
      url: `${deps.host}/project/${deps.projectId}/events?eventFilter=${encodeURIComponent(QUESTION_EVENT)}`,
      status: "live",
    },
    text: `${intro}${body} LIMITS: the log holds categories only, so which tickets, repos or exact wording people used can't be known; suggest follow-ups answerable from topics, answer types, outcomes, timing and charts only.`,
    updatedAt: log.rows.at(-1)?.hour ?? nowIso,
    mentions: [],
  };
}

export function questionTopicsChart(log: QuestionLog, days: number): ChartSpec | null {
  const topics = tallyBy(log.rows, (r) => TOPIC_LABELS[r.topic] ?? r.topic).slice(0, 12);
  if (!topics.length) return null;
  return {
    id: "insights_topics",
    kind: "grouped",
    title: "Insights questions by topic",
    subtitle: `Last ${days} days · categories only, no question text · PostHog`,
    categories: topics.map(([t]) => t),
    series: [{ key: "questions", name: "Questions", color: "series1", values: topics.map(([, n]) => n) }],
    unit: "questions",
    sample: false,
  };
}

export function questionsPerDayChart(log: QuestionLog, days: number, nowMs: number, timeZone: string): ChartSpec | null {
  const b = makeBuckets(days, nowMs, timeZone);
  const count = (rows: QuestionRow[]) => {
    const values = b.labels.map(() => 0);
    for (const r of rows) {
      const i = b.indexOf(r.hour.includes("T") ? r.hour : `${r.hour.replace(" ", "T")}Z`);
      if (i >= 0) values[i] += r.n;
    }
    return values;
  };
  const series: ChartSeries[] = [
    { key: "answered", name: "Answered", color: "good", values: count(log.rows.filter((r) => r.outcome === "answered")) },
    { key: "fell_back", name: "Fell back / errored", color: "critical", values: count(log.rows.filter((r) => r.outcome !== "answered")) },
  ];
  if (!series.some((s) => s.values.some(Boolean))) return null;
  return {
    id: "insights_daily",
    kind: "stacked",
    title: `Insights questions per ${b.unit}`,
    subtitle: `Last ${days} days · per ${b.unit} · PostHog question log`,
    categories: b.labels,
    series,
    unit: "questions",
    sample: false,
  };
}
