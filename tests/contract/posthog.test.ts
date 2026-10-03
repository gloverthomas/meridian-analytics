/** PostHog: fixed aggregate query, host allowlist, summary text, charts and routing. */
import { describe, expect, it } from "vitest";
import { assistantUsage, bffHealth, usageTrend } from "../../server/charts.js";
import { loadConfig } from "../../server/config.js";
import { TtlCache } from "../../server/retrieval/cache.js";
import { runRetrieval } from "../../server/retrieval/index.js";
import { fetchPosthogActivity, normalizePosthogActivity, POSTHOG_EVENTS, type PosthogRow } from "../../server/retrieval/posthog.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import { jsonResponse, makeConfig, mockFetch } from "../helpers.js";

const NOW = Date.parse("2026-09-25T04:00:00Z");
const TZ = "Australia/Sydney";
const ROWS: PosthogRow[] = [
  { hour: "2026-09-24T07:00:00Z", event: "$pageview", app: "core", detail: "", n: 3 },
  { hour: "2026-09-24T07:00:00Z", event: "product_navigation", app: "core", detail: "", n: 3 },
  { hour: "2026-09-24T07:00:00Z", event: "$pageview", app: "reporting", detail: "", n: 2 },
  { hour: "2026-09-24T07:00:00Z", event: "bff_status", app: "core", detail: "true", n: 4 },
  { hour: "2026-09-24T08:00:00Z", event: "bff_status", app: "reporting", detail: "false", n: 1 },
];
const RAW = ROWS.map((r) => [r.hour, r.event, r.app, r.detail, r.n]);
const DEPS = { apiKey: "phx_test", projectId: "123", host: "https://us.posthog.com" };

describe("fetchPosthogActivity", () => {
  it("sends one fixed aggregate HogQL query over allowlisted events only", async () => {
    const fetch = mockFetch(() => jsonResponse({ results: RAW }));
    const rows = await fetchPosthogActivity(99, { ...DEPS, fetch });
    expect(rows).toEqual(ROWS);
    const call = fetch.calls[0];
    expect(call.url).toBe("https://us.posthog.com/api/projects/123/query/");
    expect((call.init!.headers as Record<string, string>).Authorization).toBe("Bearer phx_test");
    const sql = JSON.parse(String(call.init!.body)).query.query as string;
    expect(sql).toMatch(/INTERVAL 30 DAY/); // clamped
    expect(sql).toMatch(/count\(\)/);
    for (const e of POSTHOG_EVENTS) expect(sql).toContain(`'${e}'`);
    expect(sql).not.toMatch(/distinct_id|person|token|\$ip|email/i);
  });

  it("throws on HTTP errors", async () => {
    await expect(fetchPosthogActivity(7, { ...DEPS, fetch: mockFetch(() => jsonResponse({}, 403)) })).rejects.toThrow("posthog_403");
  });
});

describe("normalizePosthogActivity", () => {
  it("leads with what isn't tracked, then aggregates per event and app", () => {
    const item = normalizePosthogActivity(ROWS, 14, DEPS, "2026-09-25T00:00:00Z");
    expect(item.citation).toMatchObject({ id: "posthog:activity:14d", status: "live", url: "https://us.posthog.com/project/123/activity/explore" });
    expect(item.text).toMatch(/^\[posthog:activity:14d\] NOT TRACKED YET: no assistant_message_sent events/);
    expect(item.text).toContain("$pageview 5 (core 3, reporting 2)");
    expect(item.text).toContain("BFF status: 5 checks, 1 reported NOT connected (core 0, reporting 1)");
  });
});

describe("assistant tracking", () => {
  const withAssistant: PosthogRow[] = [
    ...ROWS,
    { hour: "2026-09-25T01:00:00Z", event: "assistant_message_sent", app: "core", detail: "answered", n: 4 },
    { hour: "2026-09-25T01:00:00Z", event: "assistant_message_sent", app: "reporting", detail: "failed", n: 3 },
  ];

  it("reports assistant messages and failures once events exist", () => {
    const item = normalizePosthogActivity(withAssistant, 14, DEPS, "2026-09-25T02:00:00Z");
    expect(item.text).toMatch(/^\[posthog:activity:14d\] AI Assistant messages: 7 \(core 4, reporting 3\); 3 failed \(core 0, reporting 3\)\./);
    expect(item.text).not.toContain("NOT TRACKED");
  });

  it("charts answered vs failed per day", () => {
    const chart = assistantUsage(withAssistant, 7, NOW, TZ)!;
    expect(chart.series.map((s) => [s.name, s.color, s.values.reduce((a, v) => a + v, 0)])).toEqual([
      ["Answered", "good", 4],
      ["Failed", "critical", 3],
    ]);
    expect(assistantUsage(ROWS, 7, NOW, TZ)).toBeNull();
  });
});

describe("PostHog charts", () => {
  it("charts product activity by app, excluding BFF checks", () => {
    const chart = usageTrend(ROWS, 7, NOW, TZ)!;
    expect(chart.series.map((s) => [s.name, s.values.reduce((a, v) => a + v, 0)])).toEqual([
      ["Core", 6],
      ["Reporting", 2],
    ]);
    expect(usageTrend([], 7, NOW, TZ)).toBeNull();
  });

  it("charts BFF connected vs not with status colours", () => {
    const chart = bffHealth(ROWS, 7, NOW, TZ)!;
    expect(chart.series.map((s) => [s.name, s.color, s.values.reduce((a, v) => a + v, 0)])).toEqual([
      ["Connected", "good", 4],
      ["Not connected", "critical", 1],
    ]);
  });
});

describe("PostHog config and routing", () => {
  it("only allows PostHog's own hosts and numeric project ids", () => {
    expect(loadConfig({ POSTHOG_HOST: "https://eu.posthog.com/" }).posthog.host).toBe("https://eu.posthog.com");
    expect(loadConfig({ POSTHOG_HOST: "https://evil.example" }).posthog.host).toBe("https://us.posthog.com");
    expect(loadConfig({ POSTHOG_PROJECT_ID: "12; DROP" }).posthog.projectId).toBeNull();
    expect(loadConfig({ POSTHOG_PROJECT_ID: "123" }).posthog.projectId).toBe("123");
  });

  it.each([
    ["How has product usage changed over the last 2 weeks?", ["usage_trend"]],
    ["Is AI Assistant usage going up?", ["assistant_usage"]],
    ["Is the BFF disconnecting? show me connection checks per day", ["bff_health"]],
    ["How often has assistant-unit failed over the last 2 weeks?", ["ci_history"]],
  ])("%s → %j", (q, charts) => {
    const plan = planRetrieval(q, ["o/core"]);
    expect(plan.charts).toEqual(charts);
  });

  it("uses live PostHog when configured and falls back to the sample insight when not", async () => {
    const plan = planRetrieval("How has product usage changed over the last 2 weeks?", ["o/core"]);
    const live = makeConfig({ POSTHOG_PERSONAL_API_KEY: "phx_test", POSTHOG_PROJECT_ID: "123" });
    const out = await runRetrieval(plan, live, { fetch: mockFetch((url) => (url.includes("posthog") ? jsonResponse({ results: RAW }) : undefined)), cache: new TtlCache(), now: () => NOW });
    expect(out.meta.connectorModes.posthog).toBe("live");
    expect(out.charts.map((c) => c.id)).toEqual(["usage_trend"]);

    const sample = await runRetrieval(plan, makeConfig(), { fetch: mockFetch(), cache: new TtlCache(), now: () => NOW });
    expect(sample.meta.connectorModes.posthog).toBe("sample");
    expect(sample.charts).toEqual([]);
  });
});
