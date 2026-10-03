/** Meridian Insights in Slack: signature checks, formatting, events and buttons (Slack and Linear are faked). */
import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { createActionToken } from "../../server/actions/token.js";
import type { InsightAnswer } from "../../server/insights.js";
import { retrievalCache } from "../../server/retrieval/cache.js";
import { cleanSlackText } from "../../server/slack/handler.js";
import { ACTION_IDS, chartSummary, formatAnswer, formatPartial, PROPOSAL_BLOCK_ID, toMrkdwn } from "../../server/slack/format.js";
import { verifySlackSignature } from "../../server/slack/verify.js";
import { jsonResponse, makeConfig, mockFetch } from "../helpers.js";

const NOW = Date.parse("2026-09-26T01:00:00Z");
const SECRET = "slack-signing-secret-0123456789";
// Assembled at runtime so no token-shaped literal is committed (it is fake either way).
const BOT = ["xoxb", "0000000000", "testtokentesttoken"].join("-");
const APPROVER = "U0APPROVER";
const ENV = { SLACK_BOT_TOKEN: BOT, SLACK_SIGNING_SECRET: SECRET, SLACK_APPROVER_IDS: APPROVER, LINEAR_API_KEY: "lin_read", LINEAR_ACTIONS_API_KEY: "lin_write" };

beforeEach(() => retrievalCache.clear());

function signed(path: string, body: string, contentType: string, opts: { secret?: string; ts?: number; headers?: Record<string, string> } = {}): Request {
  const ts = String(Math.floor((opts.ts ?? NOW) / 1000));
  const sig = `v0=${createHmac("sha256", opts.secret ?? SECRET).update(`v0:${ts}:${body}`).digest("hex")}`;
  return new Request(`http://localhost:5173${path}`, {
    method: "POST",
    headers: { "Content-Type": contentType, "X-Slack-Request-Timestamp": ts, "X-Slack-Signature": sig, ...opts.headers },
    body,
  });
}

const eventReq = (event: object, extra: object = {}, opts = {}) =>
  signed("/api/v1/slack/events", JSON.stringify({ type: "event_callback", event_id: `Ev${Math.random()}`, team_id: "T1", event, ...extra }), "application/json", opts);
const actionReq = (payload: object) =>
  signed("/api/v1/slack/interactions", new URLSearchParams({ payload: JSON.stringify(payload) }).toString(), "application/x-www-form-urlencoded");
const ctx = (path: string) => ({ ip: "3.3.3.3", requestId: "req-slack", path });

type SlackCall = { method: string; params: URLSearchParams };

/** Fake Slack Web API + (optionally) Linear; records every Slack call. */
function fakeSlack(extra?: (url: string, init?: RequestInit) => Response | undefined, thread: object[] = []) {
  const calls: SlackCall[] = [];
  const fetch = mockFetch((url, init) => {
    if (!url.startsWith("https://slack.com/api/")) return extra?.(url, init);
    const method = url.slice("https://slack.com/api/".length);
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${BOT}`);
    calls.push({ method, params: new URLSearchParams(String(init?.body)) });
    if (method === "chat.postMessage") return jsonResponse({ ok: true, ts: "999.1" });
    if (method === "conversations.replies") return jsonResponse({ ok: true, messages: thread });
    if (method === "users.info") return jsonResponse({ ok: true, user: { real_name: "Tom <b>Glover</b>" } });
    return jsonResponse({ ok: true });
  });
  return { fetch, calls };
}

function appWith(fetch: ReturnType<typeof mockFetch>, env: Record<string, string> = ENV, grokReply?: object) {
  const work: Promise<unknown>[] = [];
  const text = grokReply ? JSON.stringify(grokReply) : null;
  const grok = text
    ? {
        model: "grok-test",
        complete: async () => text,
        async stream(_m: unknown, onDelta: (t: string) => void) {
          for (let i = 0; i < text.length; i += 5) onDelta(text.slice(i, i + 5));
          return text;
        },
      }
    : null;
  let clock = NOW;
  const app = createApp({ config: makeConfig(env), fetch, grok, now: () => (clock += 700), waitUntil: (p) => work.push(p) });
  return { app, settle: () => Promise.all(work) };
}

describe("verifySlackSignature", () => {
  const headersFor = (req: Request) => req.headers;
  it("accepts a valid signature and rejects tampering, wrong secrets and stale requests", async () => {
    const body = '{"a":1}';
    expect(verifySlackSignature(body, headersFor(signed("/x", body, "application/json")), SECRET, NOW)).toBe(true);
    expect(verifySlackSignature('{"a":2}', headersFor(signed("/x", body, "application/json")), SECRET, NOW)).toBe(false);
    expect(verifySlackSignature(body, headersFor(signed("/x", body, "application/json", { secret: "other-secret-0123456789" })), SECRET, NOW)).toBe(false);
    expect(verifySlackSignature(body, headersFor(signed("/x", body, "application/json", { ts: NOW - 10 * 60_000 })), SECRET, NOW)).toBe(false);
    expect(verifySlackSignature(body, new Headers(), SECRET, NOW)).toBe(false);
  });
});

describe("Slack text", () => {
  it("cleans mentions, links and entities from questions", () => {
    expect(cleanSlackText("<@U123ABC> what's <https://linear.app/x|KAN-5> &amp; <#C1|eng>?")).toBe("what's KAN-5 & #eng?");
  });

  it("converts markdown to mrkdwn with numbered citation links, dropping unknown ids", () => {
    const md = "**KAN-5 is In Progress.** [linear:KAN-5]\n- one [github:PR:x/y#1]\n## Next <script>";
    const out = toMrkdwn(md, [{ id: "linear:KAN-5", kind: "linear_issue", title: "KAN-5", url: "https://linear.app/x/KAN-5" }]);
    expect(out).toBe("*KAN-5 is In Progress.* <https://linear.app/x/KAN-5|[1]>\n• one\n*Next &lt;script&gt;*");
    expect(formatPartial("**Half writ")).toBe("*Half writ* ▍");
    expect(formatPartial("Done [linear:LI")).toBe("Done ▍");
  });
});

const baseAnswer: InsightAnswer = {
  reply: "**Plan ready.** [workflow:run:r1]",
  citations: [{ id: "workflow:run:r1", kind: "workflow_run", title: "KAN-5 Cursor plan", url: "https://cursor.com/agents/1", status: "eval passed" }],
  relatedQuestions: ["How are our evals tracking?"],
  provider: "grok:grok-test",
  retrievalMeta: { connectors: ["workflow"], connectorModes: { workflow: "live" }, window: "last 14 days", truncated: false, itemCount: 1 },
  proposedAction: { kind: "workflow_implement", issueId: "KAN-5", issueTitle: "Parity", url: "https://linear.app/x/KAN-5", fromState: "Todo", toState: "In Review", token: "tok", expiresAt: NOW },
  charts: [{ id: "eval_checks", kind: "ranked", title: "Most-failed eval checks", subtitle: "", categories: ["a", "b"], series: [{ key: "f", name: "Failures", color: "series2", values: [2, 9] }], unit: "failures", sample: false }],
};

describe("formatAnswer", () => {
  it("renders sources, chart summaries, follow-ups and an approve button with a confirm dialog", () => {
    const { text, blocks } = formatAnswer(baseAnswer, { publicUrl: "http://localhost:5173", actionsEnabled: true });
    const json = JSON.stringify(blocks);
    expect(text).toBe("Plan ready.");
    expect(json).toContain("<https://cursor.com/agents/1|[1]>");
    expect(json).toContain("Most-failed eval checks: b 9, a 2");
    const actions = blocks.find((b) => (b as { block_id?: string }).block_id === PROPOSAL_BLOCK_ID) as { elements: Array<{ action_id: string; value: string; confirm?: object }> };
    expect(actions.elements[0]).toMatchObject({ action_id: ACTION_IDS.approve, value: JSON.stringify({ k: "workflow_implement", t: "tok" }) });
    expect(actions.elements[0].confirm).toBeDefined();
    expect(json).toContain(`"action_id":"${ACTION_IDS.ask}_0"`);
  });

  it("links to the web app instead of showing buttons when no approvers are set", () => {
    const { blocks } = formatAnswer(baseAnswer, { publicUrl: "http://localhost:5173", actionsEnabled: false });
    expect(JSON.stringify(blocks)).not.toContain(PROPOSAL_BLOCK_ID);
    expect(JSON.stringify(blocks)).toContain("no Slack approvers are set up");
  });

  it("draws a knowledge flow as a single path line", () => {
    const diagram = {
      title: "Signal to SDK",
      nodes: [
        { id: "n1", label: "Reporting posts /signal" },
        { id: "n2", label: "Workflow opens a Todo" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };
    const { blocks } = formatAnswer({ ...baseAnswer, diagram }, { publicUrl: "http://localhost:5173", actionsEnabled: false });
    expect(JSON.stringify(blocks)).toContain("Reporting posts /signal → Workflow opens a Todo");
  });

  it("summarises column charts by series totals", () => {
    expect(chartSummary({ ...baseAnswer.charts![0], kind: "stacked", series: [{ key: "p", name: "Passed", color: "good", values: [1, 2] }] })).toBe("Most-failed eval checks: Passed 3 failures");
  });
});

describe("POST /api/v1/slack/events", () => {
  const path = "/api/v1/slack/events";

  it("is off (404) unless the bot token and signing secret are set", async () => {
    const app = createApp({ config: makeConfig(), fetch: mockFetch(), grok: null });
    expect((await app(signed(path, "{}", "application/json"), ctx(path))).status).toBe(404);
  });

  it("answers Slack's URL verification and rejects bad signatures", async () => {
    const { app } = appWith(fakeSlack().fetch);
    const res = await app(signed(path, JSON.stringify({ type: "url_verification", challenge: "abc" }), "application/json"), ctx(path));
    expect(await res.text()).toBe("abc");
    const bad = await app(signed(path, "{}", "application/json", { secret: "wrong-secret-0123456789" }), ctx(path));
    expect(bad.status).toBe(401);
  });

  it("answers a mention in a thread: placeholder, streamed updates, then the cited answer", async () => {
    const slack = fakeSlack(undefined, [
      { ts: "100.0", user: "U9", text: "<@UBOT> status of KAN-5?" },
      { ts: "100.5", bot_id: "B1", text: "KAN-5 is In Progress." },
      { ts: "101.0", user: "U9", text: "<@UBOT> and are there PRs?" },
    ]);
    const { app, settle } = appWith(slack.fetch, ENV, { reply: "**Yes, 2 PRs.** [linear:KAN-5]", citations: ["linear:KAN-5"], relatedQuestions: ["q1"] });
    const res = await app(eventReq({ type: "app_mention", user: "U9", text: "<@UBOT> and are there PRs for KAN-5?", channel: "C1", ts: "101.0", thread_ts: "100.0" }), ctx(path));
    expect(res.status).toBe(200);
    await settle();

    const methods = slack.calls.map((c) => c.method);
    expect(methods[0]).toBe("chat.postMessage");
    expect(slack.calls[0].params.get("thread_ts")).toBe("100.0");
    expect(slack.calls[0].params.get("text")).toMatch(/^⏳ /);
    expect(methods).toContain("conversations.replies");
    const updates = slack.calls.filter((c) => c.method === "chat.update");
    expect(updates.length).toBeGreaterThanOrEqual(2);
    expect(updates.some((u) => u.params.get("text")!.endsWith("▍"))).toBe(true);
    const final = updates.at(-1)!;
    expect(final.params.get("text")).toBe("Yes, 2 PRs.");
    expect(final.params.get("blocks")).toContain("*Yes, 2 PRs.*");
  });

  it("ignores bots, edits, retries and duplicate events", async () => {
    const slack = fakeSlack();
    const { app, settle } = appWith(slack.fetch);
    await app(eventReq({ type: "app_mention", bot_id: "B1", user: "U9", text: "hi", channel: "C1", ts: "1.0" }), ctx(path));
    await app(eventReq({ type: "message", subtype: "message_changed", channel_type: "im", user: "U9", text: "hi", channel: "D1", ts: "1.0" }), ctx(path));
    await app(eventReq({ type: "app_mention", user: "U9", text: "hi", channel: "C1", ts: "1.0" }, {}, { headers: { "X-Slack-Retry-Num": "1" } }), ctx(path));
    const body = JSON.stringify({ type: "event_callback", event_id: "EvSame", team_id: "T1", event: { type: "app_mention", user: "U9", text: "<@UBOT> what can I ask?", channel: "C1", ts: "2.0" } });
    await app(signed(path, body, "application/json"), ctx(path));
    await app(signed(path, body, "application/json"), ctx(path));
    await settle();
    expect(slack.calls.filter((c) => c.method === "chat.postMessage")).toHaveLength(1);
  });

  it("replies inline to a DM and treats an empty mention as 'what can I ask?'", async () => {
    const slack = fakeSlack();
    const { app, settle } = appWith(slack.fetch);
    await app(eventReq({ type: "message", channel_type: "im", user: "U9", text: "help", channel: "D1", ts: "5.0" }), ctx(path));
    await app(eventReq({ type: "app_mention", user: "U9", text: "<@UBOT>", channel: "C1", ts: "6.0" }), ctx(path));
    await settle();
    const posts = slack.calls.filter((c) => c.method === "chat.postMessage");
    expect(posts[0].params.has("thread_ts")).toBe(false);
    const finals = slack.calls.filter((c) => c.method === "chat.update").map((c) => c.params.get("text"));
    expect(finals.every((t) => t!.startsWith("You can ask about tickets"))).toBe(true);
  });
});

describe("POST /api/v1/slack/interactions", () => {
  const path = "/api/v1/slack/interactions";
  const message = { ts: "200.0", thread_ts: "100.0", text: "Plan ready", blocks: [{ type: "section" }, { type: "actions", block_id: PROPOSAL_BLOCK_ID }] };

  it("asks a follow-up in the thread, showing who asked", async () => {
    const slack = fakeSlack();
    const { app, settle } = appWith(slack.fetch);
    await app(actionReq({ type: "block_actions", user: { id: "U9" }, channel: { id: "C1" }, message, actions: [{ action_id: `${ACTION_IDS.ask}_0`, value: "What can I ask?" }] }), ctx(path));
    await settle();
    expect(slack.calls[0].params.get("thread_ts")).toBe("100.0");
    expect(slack.calls[0].params.get("text")).toContain("<@U9> asked: _What can I ask?_");
  });

  it("refuses Approve from someone who isn't an approver, without touching Linear", async () => {
    const slack = fakeSlack();
    const { app, settle } = appWith(slack.fetch);
    await app(actionReq({ type: "block_actions", user: { id: "U9" }, channel: { id: "C1" }, message, actions: [{ action_id: ACTION_IDS.approve, value: '{"k":"linear_transition","t":"x"}' }] }), ctx(path));
    await settle();
    expect(slack.calls.map((c) => c.method)).toEqual(["chat.postEphemeral"]);
  });

  it("runs an approver's confirmed move, retires the buttons and posts the result", async () => {
    const issue = { id: "uuid-17", identifier: "KAN-18", title: "Notifications", url: "https://linear.app/x/KAN-18", team: { id: "t", key: "KAN" }, state: { name: "Todo" } };
    const linearBodies: string[] = [];
    const slack = fakeSlack((url, init) => {
      if (!url.startsWith("https://api.linear.app/graphql")) return undefined;
      const body = String(init?.body);
      linearBodies.push(body);
      if (body.includes("issueUpdate")) return jsonResponse({ data: { issueUpdate: { success: true, issue: { state: { name: "In Progress" } } } } });
      if (body.includes("commentCreate")) return jsonResponse({ data: { commentCreate: { success: true } } });
      if (body.includes("workflowStates")) return jsonResponse({ data: { workflowStates: { nodes: [{ id: "s", name: "In Progress" }] } } });
      return jsonResponse({ data: { issue } });
    });
    const config = makeConfig(ENV);
    const { app, settle } = appWith(slack.fetch);
    const token = createActionToken({ issueId: "KAN-18", toState: "In Progress" }, config.actions.secret!, NOW).token;
    await app(
      actionReq({ type: "block_actions", user: { id: APPROVER }, channel: { id: "C1" }, message, actions: [{ action_id: ACTION_IDS.approve, value: JSON.stringify({ k: "linear_transition", t: token }) }] }),
      ctx(path),
    );
    await settle();

    const audit = linearBodies.find((b) => b.includes("commentCreate"))!;
    expect(audit).toContain("from Slack by Tom bGloverb (confirmed with a button)");
    const retire = slack.calls.find((c) => c.method === "chat.update")!;
    expect(retire.params.get("blocks")).not.toContain(PROPOSAL_BLOCK_ID);
    expect(retire.params.get("blocks")).toContain(`Confirmed by <@${APPROVER}>`);
    const result = slack.calls.find((c) => c.method === "chat.postMessage")!;
    expect(result.params.get("text")).toContain("Moved KAN-18 to In Progress");
  });

  it("lets an approver cancel, which only retires the buttons", async () => {
    const slack = fakeSlack();
    const { app, settle } = appWith(slack.fetch);
    await app(actionReq({ type: "block_actions", user: { id: APPROVER }, channel: { id: "C1" }, message, actions: [{ action_id: ACTION_IDS.cancel, value: "cancel" }] }), ctx(path));
    await settle();
    expect(slack.calls.map((c) => c.method)).toEqual(["chat.update"]);
    expect(slack.calls[0].params.get("blocks")).toContain("Cancelled by");
  });
});
