/**
 * Question log for "how are people using Insights?". Records the *kind* of
 * question only (topic, charts, sources, answer type, outcome, speed) as one
 * PostHog event — never the question text, ticket ids, or anything a user typed.
 */
import { createHash } from "node:crypto";
import type { Config } from "./config.js";
import { errorCode, logEvent } from "./log.js";
import type { FetchLike } from "./retrieval/types.js";

export const QUESTION_EVENT = "insights_question";
const TELEMETRY_TIMEOUT_MS = 1_500;

/** us.posthog.com → us.i.posthog.com (ingestion lives on the ".i." host). */
export function ingestHost(host: string): string {
  if (host.includes("eu.")) return "https://eu.i.posthog.com";
  return "https://us.i.posthog.com";
}

export type QuestionOutcome = "answered" | "fallback" | "error";
export type QuestionChannel = "web" | "slack";

export interface QuestionRecord {
  topic: string;
  style: "overview" | "direct" | "plan" | "pipeline" | "explain" | "action";
  charts: string[];
  sources: string[];
  answerType: "grok" | "fixture" | "digest" | "action" | "none";
  outcome: QuestionOutcome;
  latencyMs: number;
  citationCount: number;
  windowDays: number;
  channel?: QuestionChannel;
}

/** Anonymous, stable per signed-in session; lets PostHog count viewers without identifying anyone. */
export function anonymousViewerId(sessionSecretMaterial: string): string {
  return `insights-${createHash("sha256").update(sessionSecretMaterial).digest("hex").slice(0, 16)}`;
}

export function questionEventProperties(record: QuestionRecord): Record<string, string | number | boolean> {
  return {
    app: "insights",
    topic: record.topic,
    style: record.style,
    chart_kinds: [...record.charts].sort().join(","),
    chart_count: record.charts.length,
    sources: [...record.sources].sort().join(","),
    answer_type: record.answerType,
    outcome: record.outcome,
    latency_ms: Math.round(record.latencyMs),
    citation_count: record.citationCount,
    window_days: record.windowDays,
    channel: record.channel ?? "web",
    // Don't create person profiles for anonymous viewers.
    $process_person_profile: false,
  };
}

/** Best effort: a telemetry failure is logged and never affects the answer. */
export async function recordQuestion(config: Config, fetch: FetchLike, viewerId: string, record: QuestionRecord, nowMs = Date.now()): Promise<void> {
  const token = config.posthog.projectToken;
  if (!token) return;
  try {
    const res = await fetch(`${ingestHost(config.posthog.host)}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event: QUESTION_EVENT,
        distinct_id: viewerId,
        timestamp: new Date(nowMs).toISOString(),
        properties: questionEventProperties(record),
      }),
      signal: AbortSignal.timeout(TELEMETRY_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`posthog_ingest_${res.status}`);
  } catch (error) {
    logEvent("telemetry_error", { error: errorCode(error) });
  }
}
