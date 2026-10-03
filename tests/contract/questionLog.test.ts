/** Insights question log: categories only on write, spoof-filtered on read, routed for meta questions. */
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { TtlCache } from "../../server/retrieval/cache.js";
import { runRetrieval } from "../../server/retrieval/index.js";
import { fetchQuestionLog, isGenuineRow, normalizeQuestionLog, questionTopicsChart, questionsPerDayChart, type QuestionLog } from "../../server/retrieval/insightsUsage.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import { anonymousViewerId, ingestHost, questionEventProperties, recordQuestion } from "../../server/telemetry.js";
import { jsonResponse, makeConfig, mockFetch, postJson } from "../helpers.js";

const TOKEN = "phc_testtesttesttesttest1234";
const NOW = Date.parse("2026-09-26T00:00:00Z");
const DEPS = { apiKey: "phx", projectId: "1", host: "https://us.posthog.com" };

describe("question log writes", () => {
  it("records categories only: never the question text", async () => {
    const config = makeConfig({ POSTHOG_PROJECT_TOKEN: TOKEN });
    const fetch = mockFetch((url) => (url.includes("posthog") ? jsonResponse({ status: "Ok" }) : undefined));
    const app = createApp({ config, grok: null, fetch });
    const secret = "What's our unreleased pricing for ACME Corp? email jane@acme.test";
    await app(postJson("/api/v1/insights/chat", { message: secret }), { ip: "1.1.1.1", requestId: "r", path: "/api/v1/insights/chat" });

    const ingest = fetch.calls.find((c) => c.url === "https://us.i.posthog.com/i/v0/e/")!;
    const body = JSON.parse(String(ingest.init!.body));
    expect(body.event).toBe("insights_question");
    expect(body.api_key).toBe(TOKEN);
    expect(body.distinct_id).toMatch(/^insights-[0-9a-f]{16}$/);
    expect(Object.keys(body.properties).sort()).toEqual(
      ["$process_person_profile", "answer_type", "app", "channel", "chart_count", "chart_kinds", "citation_count", "latency_ms", "outcome", "sources", "style", "topic", "window_days"].sort(),
    );
    const raw = String(ingest.init!.body);
    for (const leak of ["pricing", "ACME", "jane@acme.test", "unreleased"]) expect(raw).not.toContain(leak);
  });

  it("logs ticket moves by topic and skips logging without a token", async () => {
    const withToken = mockFetch((url) => (url.includes("posthog") ? jsonResponse({ status: "Ok" }) : undefined));
    const app = createApp({ config: makeConfig({ POSTHOG_PROJECT_TOKEN: TOKEN }), grok: null, fetch: withToken });
    await app(postJson("/api/v1/insights/chat", { message: "Move KAN-18 to In Progress" }), { ip: "1", requestId: "r", path: "/api/v1/insights/chat" });
    const props = JSON.parse(String(withToken.calls.at(-1)!.init!.body)).properties;
    expect(props).toMatchObject({ topic: "ticket_move", style: "action", answer_type: "action" });
    expect(JSON.stringify(props)).not.toContain("KAN-18");

    const noToken = mockFetch();
    await createApp({ config: makeConfig(), grok: null, fetch: noToken })(postJson("/api/v1/insights/chat", { message: "status of KAN-5" }), { ip: "1", requestId: "r", path: "/api/v1/insights/chat" });
    expect(noToken.calls.some((c) => c.url.includes("posthog"))).toBe(false);
  });

  it("never lets telemetry failures affect the answer", async () => {
    const config = makeConfig({ POSTHOG_PROJECT_TOKEN: TOKEN });
    await expect(recordQuestion(config, mockFetch(() => jsonResponse({}, 500)), "v", { topic: "general", style: "direct", charts: [], sources: [], answerType: "grok", outcome: "answered", latencyMs: 1, citationCount: 0, windowDays: 14 })).resolves.toBeUndefined();
  });

  it("helpers: ingest host, stable anonymous ids, sorted property lists", () => {
    expect(ingestHost("https://eu.posthog.com")).toBe("https://eu.i.posthog.com");
    expect(ingestHost("https://us.posthog.com")).toBe("https://us.i.posthog.com");
    expect(anonymousViewerId("a")).toBe(anonymousViewerId("a"));
    expect(anonymousViewerId("a")).not.toBe(anonymousViewerId("b"));
    expect(questionEventProperties({ topic: "t", style: "direct", charts: ["b", "a"], sources: ["github", "linear"], answerType: "grok", outcome: "answered", latencyMs: 12.6, citationCount: 2, windowDays: 7 })).toMatchObject({ chart_kinds: "a,b", chart_count: 2, latency_ms: 13 });
  });
});

describe("question log reads", () => {
  const RAW = [
    ["2026-09-25T21:00:00Z", "ci_health", "grok", "answered", 3, 12_000, 2],
    ["2026-09-25T21:00:00Z", "issue_status", "digest", "fallback", 1, 9_000, 0],
    ["2026-09-25T22:00:00Z", "probe", "none", "answered", 5, 0, 0],
    ["2026-09-25T22:00:00Z", "ci_health", "hacker", "answered", 9, 0, 0],
  ];

  it("filters look-alike events written with the public token", async () => {
    const fetch = mockFetch((_u, init) => (String(init?.body).includes("uniq(") ? jsonResponse({ results: [[2]] }) : jsonResponse({ results: RAW })));
    const log = await fetchQuestionLog(7, { ...DEPS, fetch });
    expect(log.rows.map((r) => r.topic)).toEqual(["ci_health", "issue_status"]);
    expect(log.viewers).toBe(2);
    expect(isGenuineRow({ hour: "", topic: "general", answerType: "grok", outcome: "error", n: 1, latencySum: 0, charted: 0 })).toBe(true);
  });

  it("summarises topics, fallbacks and timing, and states what the log can't know", () => {
    const log: QuestionLog = {
      viewers: 2,
      rows: [
        { hour: "2026-09-25T21:00:00Z", topic: "ci_health", answerType: "grok", outcome: "answered", n: 3, latencySum: 12_000, charted: 2 },
        { hour: "2026-09-25T21:00:00Z", topic: "issue_status", answerType: "digest", outcome: "fallback", n: 1, latencySum: 8_000, charted: 0 },
      ],
    };
    const item = normalizeQuestionLog(log, 7, DEPS, "2026-09-26T00:00:00Z");
    expect(item.text).toContain("4 questions from about 2 anonymous session(s)");
    expect(item.text).toContain("By topic: CI health 3 (75%), Ticket status 1 (25%)");
    expect(item.text).toContain("Fell back to a source list: 1 (25%)");
    expect(item.text).toContain("Average answer time: 5.0s");
    expect(item.text).toContain("can't be known");
    expect(normalizeQuestionLog({ rows: [], viewers: 0 }, 7, DEPS, "x").text).toContain("No questions recorded yet");

    expect(questionTopicsChart(log, 7)!.categories).toEqual(["CI health", "Ticket status"]);
    const daily = questionsPerDayChart(log, 7, NOW, "Australia/Sydney")!;
    expect(daily.series.map((s) => s.values.reduce((a, v) => a + v, 0))).toEqual([3, 1]);
    expect(questionTopicsChart({ rows: [], viewers: 0 }, 7)).toBeNull();
  });

  it("routes meta questions to the log only (no Linear/GitHub)", async () => {
    for (const q of ["What have people been asking this week?", "How are people using Insights?", "What are the most common questions?"]) {
      expect(planRetrieval(q, ["o/core"]).intent).toBe("insights_usage");
    }
    for (const q of ["How are people using the product?", "Is AI Assistant usage going up?"]) {
      expect(planRetrieval(q, ["o/core"]).intent).not.toBe("insights_usage");
    }
    const fetch = mockFetch((url, init) => (url.includes("posthog") ? (String(init?.body).includes("uniq(") ? jsonResponse({ results: [[1]] }) : jsonResponse({ results: RAW.slice(0, 2) })) : undefined));
    const config = makeConfig({ POSTHOG_PERSONAL_API_KEY: "phx", POSTHOG_PROJECT_ID: "1" });
    const out = await runRetrieval(planRetrieval("What have people been asking this week?", ["o/core"]), config, { fetch, cache: new TtlCache(), now: () => NOW });
    expect(out.meta.connectors).toEqual(["posthog"]);
    expect(out.charts.map((c) => c.id)).toEqual(["insights_topics", "insights_daily"]);
    expect(fetch.calls.every((c) => c.url.includes("posthog"))).toBe(true);

    const off = await runRetrieval(planRetrieval("What have people been asking?", ["o/core"]), makeConfig(), { fetch: mockFetch(), cache: new TtlCache(), now: () => NOW });
    expect(off.meta.connectorModes.posthog).toBe("unavailable");
    expect(off.context).toContain("INSIGHTS QUESTION LOG UNAVAILABLE");
  });
});
