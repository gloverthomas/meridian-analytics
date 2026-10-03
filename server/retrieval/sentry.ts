/**
 * Sentry connector (read-only): unresolved production issues per app and daily
 * event counts. Summaries only — title, level, counts, dates, link. Never stack
 * traces, event payloads, or user details.
 */
import { clip } from "./redact.js";
import { CONNECTOR_TIMEOUT_MS, type FetchLike, type RetrievedItem } from "./types.js";

export const SENTRY_APPS = ["core", "reporting"] as const;
export type SentryApp = (typeof SENTRY_APPS)[number];
const ISSUE_LIMIT = 25;
const MAX_DAYS = 30;

export interface SentryDeps {
  token: string;
  org: string;
  host: string;
  environment: string;
  fetch: FetchLike;
}

export interface SentryIssue {
  shortId: string;
  title: string;
  level: string;
  count: number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  culprit: string;
  app: SentryApp;
}

/** One day's event count for one app. */
export interface SentryDay {
  day: string;
  app: SentryApp;
  n: number;
}

const period = (days: number) => `${Math.min(Math.max(Math.trunc(days), 1), MAX_DAYS)}d`;

async function get<T>(path: string, deps: SentryDeps): Promise<T> {
  const res = await deps.fetch(`${deps.host}/api/0${path}`, {
    headers: { Authorization: `Bearer ${deps.token}` },
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`sentry_${res.status}`);
  return (await res.json()) as T;
}

interface RawIssue {
  shortId: string;
  title: string;
  level: string;
  count: string | number;
  userCount: number;
  firstSeen: string;
  lastSeen: string;
  permalink: string;
  culprit?: string | null;
}

/** Unresolved issues seen in the window, per app (split by the apps' own `app` tag). */
export async function fetchSentryIssues(days: number, deps: SentryDeps): Promise<SentryIssue[]> {
  const perApp = await Promise.all(
    SENTRY_APPS.map(async (app) => {
      const query = encodeURIComponent(`is:unresolved environment:${deps.environment} app:${app}`);
      const raw = await get<RawIssue[]>(`/organizations/${deps.org}/issues/?query=${query}&statsPeriod=${period(days)}&limit=${ISSUE_LIMIT}&sort=freq`, deps);
      return raw.map((r): SentryIssue => ({
        shortId: r.shortId,
        title: r.title,
        level: r.level,
        count: Number(r.count) || 0,
        userCount: Number(r.userCount) || 0,
        firstSeen: r.firstSeen,
        lastSeen: r.lastSeen,
        permalink: r.permalink,
        culprit: r.culprit ?? "",
        app,
      }));
    }),
  );
  return perApp.flat();
}

/** Daily production event counts per app (Sentry's top-events series keyed by the `app` tag). */
export async function fetchSentryDaily(days: number, deps: SentryDeps): Promise<SentryDay[]> {
  const query = encodeURIComponent(`environment:${deps.environment}`);
  const body = await get<Record<string, { data?: Array<[number, Array<{ count: number }>]> }>>(
    `/organizations/${deps.org}/events-stats/?yAxis=count()&interval=1d&statsPeriod=${period(days)}&query=${query}&field=app&field=count()&topEvents=${SENTRY_APPS.length}`,
    deps,
  );
  const rows: SentryDay[] = [];
  for (const app of SENTRY_APPS) {
    for (const [ts, counts] of body[app]?.data ?? []) {
      const n = counts.reduce((a, c) => a + (Number(c.count) || 0), 0);
      if (n) rows.push({ day: new Date(ts * 1000).toISOString(), app, n });
    }
  }
  return rows;
}

const appName = (app: SentryApp) => (app === "core" ? "Core" : "Reporting");

export function normalizeSentryIssue(issue: SentryIssue, environment: string): RetrievedItem {
  const id = `sentry:${issue.shortId}`;
  const users = issue.userCount ? `, ${issue.userCount} user(s)` : "";
  return {
    connector: "sentry",
    citation: { id, kind: "sentry_issue", title: `${appName(issue.app)} · ${clip(issue.title, 90)}`, url: issue.permalink, status: issue.level },
    text: `[${id}] Sentry ${environment} ${issue.level} in ${appName(issue.app)}: "${clip(issue.title, 140)}" — ${issue.count} events${users} · first seen ${issue.firstSeen.slice(0, 10)} · last seen ${issue.lastSeen.slice(0, 10)}${issue.culprit ? ` · at ${clip(issue.culprit, 80)}` : ""}`,
    updatedAt: issue.lastSeen,
    mentions: [],
  };
}

/** Deterministic totals for Grok (it must not count issues itself). */
export function sentryCounts(issues: SentryIssue[], daily: SentryDay[] | undefined, days: number, environment: string): string {
  const lines = [`SENTRY COUNTS (computed by the server; ${environment} only; last ${days} days; use these for any error numbers):`];
  for (const app of SENTRY_APPS) {
    const mine = issues.filter((i) => i.app === app);
    const byLevel = ["error", "warning"].map((l) => `${l} ${mine.filter((i) => i.level === l).length}`).join(", ");
    const events = daily ? daily.filter((d) => d.app === app).reduce((a, d) => a + d.n, 0) : mine.reduce((a, i) => a + i.count, 0);
    lines.push(`- ${appName(app)}: ${mine.length} unresolved issue(s) (${byLevel}); ${events} event(s)`);
  }
  return lines.join("\n");
}
