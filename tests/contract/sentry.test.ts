/** Sentry: production-only summaries per app, host allowlist, counts, chart, routing. */
import { describe, expect, it } from "vitest";
import { sentryErrors } from "../../server/charts.js";
import { loadConfig } from "../../server/config.js";
import { progressSteps } from "../../server/progress.js";
import { TtlCache } from "../../server/retrieval/cache.js";
import { runRetrieval } from "../../server/retrieval/index.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import { fetchSentryDaily, fetchSentryIssues, normalizeSentryIssue, sentryCounts, type SentryIssue } from "../../server/retrieval/sentry.js";
import { jsonResponse, makeConfig, mockFetch } from "../helpers.js";

const NOW = Date.parse("2026-09-26T00:00:00Z");
const DEPS = { token: "sntryu_test", org: "meridian-bank", host: "https://us.sentry.io", environment: "production" };

const raw = (shortId: string, title: string, level: string, count: number) => ({
  shortId,
  title,
  level,
  count: String(count),
  userCount: 0,
  firstSeen: "2026-09-24T10:00:00Z",
  lastSeen: "2026-09-24T11:00:00Z",
  permalink: `https://liquid-accounting.sentry.io/issues/${shortId}/`,
  culprit: "https://reporting.meridian-saas.local/",
});

function sentryRoute(url: string) {
  if (!url.startsWith("https://us.sentry.io/api/0/")) return undefined;
  if (url.includes("/events-stats/")) {
    return jsonResponse({
      core: { data: [[Date.parse("2026-09-24T00:00:00Z") / 1000, [{ count: 6 }]]] },
      reporting: { data: [[Date.parse("2026-09-24T00:00:00Z") / 1000, [{ count: 10 }]]] },
    });
  }
  const q = decodeURIComponent(url);
  if (q.includes("app:core")) return jsonResponse([raw("JAVASCRIPT-REACT-2", "Core deep-link to missing Reporting hash", "error", 6)]);
  if (q.includes("app:reporting")) return jsonResponse([raw("JAVASCRIPT-REACT-3", "Legacy report deep-link hit", "warning", 6), raw("JAVASCRIPT-REACT-4", "Reporting Help centre control failed", "error", 3)]);
  return undefined;
}

describe("Sentry connector", () => {
  it("asks for unresolved PRODUCTION issues per app, summaries only", async () => {
    const fetch = mockFetch(sentryRoute);
    const issues = await fetchSentryIssues(14, { ...DEPS, fetch });
    expect(issues.map((i) => [i.app, i.shortId, i.count])).toEqual([
      ["core", "JAVASCRIPT-REACT-2", 6],
      ["reporting", "JAVASCRIPT-REACT-3", 6],
      ["reporting", "JAVASCRIPT-REACT-4", 3],
    ]);
    for (const call of fetch.calls) {
      expect(decodeURIComponent(call.url)).toContain("is:unresolved environment:production app:");
      expect(call.url).not.toMatch(/\/events\/[0-9a-f]{8,}|\/stacktrace|\/users/);
      expect((call.init!.headers as Record<string, string>).Authorization).toBe("Bearer sntryu_test");
    }
  });

  it("reads daily counts per app and fails loudly on HTTP errors", async () => {
    const daily = await fetchSentryDaily(14, { ...DEPS, fetch: mockFetch(sentryRoute) });
    expect(daily.map((d) => [d.app, d.n])).toEqual([
      ["core", 6],
      ["reporting", 10],
    ]);
    await expect(fetchSentryIssues(7, { ...DEPS, fetch: mockFetch(() => jsonResponse({}, 403)) })).rejects.toThrow("sentry_403");
  });

  it("normalises to a cited item and computes counts for Grok", () => {
    const issue: SentryIssue = { ...raw("JAVASCRIPT-REACT-4", "Reporting Help centre control failed", "error", 3), count: 3, app: "reporting" };
    const item = normalizeSentryIssue(issue, "production");
    expect(item.citation).toMatchObject({ id: "sentry:JAVASCRIPT-REACT-4", kind: "sentry_issue", status: "error", title: "Reporting · Reporting Help centre control failed" });
    expect(item.text).toMatch(/^\[sentry:JAVASCRIPT-REACT-4\] Sentry production error in Reporting/);
    const counts = sentryCounts([issue], [{ day: "2026-09-24T00:00:00Z", app: "reporting", n: 10 }], 14, "production");
    expect(counts).toContain("Reporting: 1 unresolved issue(s) (error 1, warning 0); 10 event(s)");
    expect(counts).toContain("Core: 0 unresolved issue(s)");
  });

  it("charts events per day, Core vs Reporting", () => {
    const chart = sentryErrors([{ day: "2026-09-24T00:00:00Z", app: "core", n: 6 }, { day: "2026-09-24T00:00:00Z", app: "reporting", n: 10 }], 7, NOW, "Australia/Sydney", "production")!;
    expect(chart.series.map((s) => [s.name, s.values.reduce((a, v) => a + v, 0)])).toEqual([
      ["Core", 6],
      ["Reporting", 10],
    ]);
    expect(chart.subtitle).toContain("production only");
    expect(sentryErrors([], 7, NOW, "UTC", "production")).toBeNull();
  });
});

describe("Sentry config, routing and retrieval", () => {
  it("only sends the token to Sentry's own hosts", () => {
    expect(loadConfig({ SENTRY_HOST: "https://evil.example" }).sentry.host).toBe("https://us.sentry.io");
    expect(loadConfig({ SENTRY_HOST: "https://de.sentry.io/" }).sentry.host).toBe("https://de.sentry.io");
    expect(loadConfig({ SENTRY_ORG: "../x" }).sentry.org).toBe("liquid-accounting");
    expect(loadConfig({}).sentry.environment).toBe("production");
  });

  it("routes error questions to Sentry and charts comparisons", () => {
    const R = ["o/core"];
    expect(planRetrieval("What errors are users hitting in production?", R).wantsSentry).toBe(true);
    expect(planRetrieval("What issues have we had this week?", R).wantsSentry).toBe(true);
    expect(planRetrieval("Is Reporting erroring more than Core?", R).charts).toContain("sentry_errors");
    expect(planRetrieval("What's the status of KAN-5?", R).wantsSentry).toBe(false);
    const cfg = makeConfig({ SENTRY_AUTH_TOKEN: "sntryu_x" });
    expect(progressSteps("What errors are users hitting?", cfg)).toContain("Checking Sentry for production errors in Core and Reporting…");
    expect(progressSteps("What errors are users hitting?", makeConfig()).some((s) => s.includes("Sentry"))).toBe(false);
  });

  it("adds Sentry items, counts and the chart when configured; nothing when not", async () => {
    const plan = planRetrieval("Is Reporting erroring more than Core? show errors per day", ["gloverthomas/meridian-saas-core"]);
    const out = await runRetrieval(plan, makeConfig({ SENTRY_AUTH_TOKEN: "sntryu_x" }), { fetch: mockFetch(sentryRoute), cache: new TtlCache(), now: () => NOW });
    expect(out.meta.connectorModes.sentry).toBe("live");
    expect(out.items.some((i) => i.citation.id === "sentry:JAVASCRIPT-REACT-4")).toBe(true);
    expect(out.context).toContain("SENTRY COUNTS");
    expect(out.charts.map((c) => c.id)).toContain("sentry_errors");

    const off = await runRetrieval(plan, makeConfig(), { fetch: mockFetch(), cache: new TtlCache(), now: () => NOW });
    expect(off.meta.connectors).not.toContain("sentry");
  });
});
