/**
 * PostHog connector: fixed aggregate HogQL over allowlisted events and
 * properties only (the same allowlist Core/Reporting send). No raw events, no
 * person data, and no user text is ever interpolated into the query.
 */
import { CONNECTOR_TIMEOUT_MS, type FetchLike, type RetrievedItem } from "./types.js";

export const POSTHOG_EVENTS = [
  "$pageview",
  "product_navigation",
  "report_opened",
  "bff_status",
  "create_dialog_opened",
  "invoice_deep_link_miss",
  "assistant_message_sent",
] as const;
const ACTIVITY_EVENTS = new Set(["$pageview", "product_navigation", "report_opened", "create_dialog_opened"]);
const MAX_DAYS = 30;
const ROW_LIMIT = 5000;

export interface PosthogDeps {
  apiKey: string;
  projectId: string;
  host: string;
  fetch: FetchLike;
}

/** One aggregate row: hourly count of an event per app ("core" | "reporting"). */
export interface PosthogRow {
  hour: string;
  event: string;
  app: string;
  /** bff_status: "true"/"false"; assistant_message_sent: "answered"/"failed"; otherwise "". */
  detail: string;
  n: number;
}

function activityQuery(days: number): string {
  const window = Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS);
  const events = POSTHOG_EVENTS.map((e) => `'${e}'`).join(", ");
  return `SELECT toStartOfHour(timestamp) AS hour, event,
  coalesce(properties.source, properties.app, if(properties.$host LIKE '%reporting%', 'reporting', 'core')) AS app,
  multiIf(event = 'bff_status', toString(properties.connected), event = 'assistant_message_sent', toString(properties.outcome), '') AS detail,
  count() AS n
FROM events
WHERE event IN (${events}) AND timestamp > now() - INTERVAL ${window} DAY
GROUP BY hour, event, app, detail ORDER BY hour LIMIT ${ROW_LIMIT}`;
}

export async function fetchPosthogActivity(days: number, deps: PosthogDeps): Promise<PosthogRow[]> {
  const res = await deps.fetch(`${deps.host}/api/projects/${deps.projectId}/query/`, {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: { kind: "HogQLQuery", query: activityQuery(days) } }),
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`posthog_${res.status}`);
  const body = (await res.json()) as { results?: unknown[][] };
  return (body.results ?? []).map((r) => ({
    hour: String(r[0]),
    event: String(r[1]),
    app: String(r[2] ?? "core").toLowerCase() === "reporting" ? "reporting" : "core",
    detail: String(r[3] ?? ""),
    n: Number(r[4]) || 0,
  }));
}

const sum = (rows: PosthogRow[]) => rows.reduce((a, r) => a + r.n, 0);

/** Summary item for Grok. Also says plainly what is NOT tracked, so answers don't overreach. */
export function normalizePosthogActivity(rows: PosthogRow[], days: number, deps: Pick<PosthogDeps, "host" | "projectId">, nowIso: string): RetrievedItem {
  const id = `posthog:activity:${days}d`;
  const byEvent = POSTHOG_EVENTS.map((e) => {
    const ev = rows.filter((r) => r.event === e);
    return `${e} ${sum(ev)} (core ${sum(ev.filter((r) => r.app === "core"))}, reporting ${sum(ev.filter((r) => r.app === "reporting"))})`;
  }).join("; ");
  const bff = rows.filter((r) => r.event === "bff_status");
  const disconnected = bff.filter((r) => r.detail === "false");
  const assistant = rows.filter((r) => r.event === "assistant_message_sent");
  const failed = assistant.filter((r) => r.detail === "failed");
  const assistantLine = assistant.length
    ? `AI Assistant messages: ${sum(assistant)} (core ${sum(assistant.filter((r) => r.app === "core"))}, reporting ${sum(assistant.filter((r) => r.app === "reporting"))}); ${sum(failed)} failed (core ${sum(failed.filter((r) => r.app === "core"))}, reporting ${sum(failed.filter((r) => r.app === "reporting"))}).`
    : "NOT TRACKED YET: no assistant_message_sent events recorded in this window. Tracking was added to Core and Reporting on 26 Sep 2026 (PR #11 in each) and appears once those deploy; until then assistant usage CANNOT be measured, and the numbers below are general product activity, not assistant usage.";
  const activity = rows.filter((r) => ACTIVITY_EVENTS.has(r.event));
  const daysActive = new Set(activity.map((r) => r.hour.slice(0, 10))).size;
  return {
    connector: "posthog",
    citation: {
      id,
      kind: "posthog_insight",
      title: `PostHog product activity · last ${days} days`,
      url: `${deps.host}/project/${deps.projectId}/activity/explore`,
      status: "live",
    },
    text: `[${id}] ${assistantLine} PostHog (allowlisted, aggregated events; no personal data), last ${days} days: ${byEvent}. Product activity events total ${sum(activity)} across ${daysActive} active day(s). BFF status: ${sum(bff)} checks, ${sum(disconnected)} reported NOT connected (core ${sum(disconnected.filter((r) => r.app === "core"))}, reporting ${sum(disconnected.filter((r) => r.app === "reporting"))}).`,
    updatedAt: activity.at(-1)?.hour ?? nowIso,
    mentions: [],
  };
}

/**
 * Sample insight used when PostHog isn't configured. Pre-aggregated, never raw
 * events.
 */
export function samplePosthogInsight(nowIso: string): RetrievedItem {
  const id = "posthog:insight:assistant-adoption-28d";
  return {
    connector: "posthog",
    citation: {
      id,
      kind: "posthog_insight",
      title: "AI Assistant adoption · last 28 days (sample)",
      url: "https://us.posthog.com/",
      status: "sample",
    },
    text: `[${id}] PostHog insight (SAMPLE DATA, allowlisted events only) — product_navigation to "AI Assistant" up ~35% over 28 days; assistant chats per active org roughly flat week over week; bff_status errors on Reporting elevated after the assistant chrome shipped. No per-user or financial data.`,
    updatedAt: nowIso,
    mentions: [],
  };
}
