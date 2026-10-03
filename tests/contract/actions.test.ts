/** Confirmed Linear ticket moves: detection, proposal, signed tokens, execution. */
import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { ActionError, detectTicketAction, executeTransition, proposeTransition } from "../../server/actions/linearTransition.js";
import { ACTION_TOKEN_TTL_MS, createActionToken, verifyActionToken } from "../../server/actions/token.js";
import { answerQuestion } from "../../server/insights.js";
import { jsonResponse, makeConfig, mockFetch, postJson } from "../helpers.js";

const NOW = Date.parse("2026-09-25T06:00:00Z");
const TEAM = { id: "team-uuid", key: "KAN" };
const KAN_18 = { id: "uuid-17", identifier: "KAN-18", title: "Notifications dead in Reporting", url: "https://linear.app/x/KAN-18", team: TEAM, state: { name: "Todo", type: "unstarted" } };

type Body = { query: string; variables: Record<string, unknown> };

/** Stateful fake Linear: tracks the issue's state and records mutations. */
function fakeLinear(issue: typeof KAN_18 | null = { ...KAN_18 }, opts: { updateFails?: boolean; commentFails?: boolean } = {}) {
  const mutations: Body[] = [];
  const current = issue ? { ...issue, state: { ...issue.state } } : null;
  const fetch = mockFetch((url, init) => {
    if (!url.startsWith("https://api.linear.app/graphql")) return undefined;
    const body = JSON.parse(String(init?.body)) as Body;
    if (body.query.includes("issueUpdate")) {
      mutations.push(body);
      if (opts.updateFails) return jsonResponse({ data: { issueUpdate: { success: false, issue: null } } });
      current!.state = { name: "In Progress", type: "started" };
      return jsonResponse({ data: { issueUpdate: { success: true, issue: { state: current!.state } } } });
    }
    if (body.query.includes("commentCreate")) {
      mutations.push(body);
      return opts.commentFails ? jsonResponse({}, 500) : jsonResponse({ data: { commentCreate: { success: true } } });
    }
    if (body.query.includes("workflowStates")) return jsonResponse({ data: { workflowStates: { nodes: [{ id: "state-inprogress", name: "In Progress" }] } } });
    if (body.query.includes("Candidates")) return jsonResponse({ data: { issues: { nodes: current ? [current] : [] } } });
    if (body.query.includes("query Issue(")) {
      return current && body.variables.id === current.identifier
        ? jsonResponse({ data: { issue: current } })
        : jsonResponse({ data: null, errors: [{ message: "Entity not found: Issue" }] });
    }
    return undefined;
  });
  return { fetch, mutations, current };
}

const ENABLED = { LINEAR_API_KEY: "lin_read", LINEAR_ACTIONS_API_KEY: "lin_write" };

describe("detectTicketAction", () => {
  it("recognises move requests and target states", () => {
    expect(detectTicketAction("can we move tickets to in progress here?")).toEqual({ issueIds: [], targetState: "In Progress" });
    expect(detectTicketAction("Move liq-17 to In Progress")).toEqual({ issueIds: ["KAN-18"], targetState: "In Progress" });
    expect(detectTicketAction("start KAN-18")).toEqual({ issueIds: ["KAN-18"], targetState: "In Progress" });
    expect(detectTicketAction("move the tickets in Todo to in-progress")?.targetState).toBe("In Progress");
    expect(detectTicketAction("set KAN-6 to done")?.targetState).toBe("Done");
    expect(detectTicketAction("move KAN-6")).toEqual({ issueIds: ["KAN-6"], targetState: null });
  });

  it("ignores ordinary questions", () => {
    expect(detectTicketAction("What moved to Done this week?")).toBeNull();
    expect(detectTicketAction("Which tickets are in progress?")).toBeNull();
    expect(detectTicketAction("What's the status of KAN-5?")).toBeNull();
    expect(detectTicketAction("Did anything change?")).toBeNull();
  });
});

describe("action tokens", () => {
  it("round-trips and rejects tampering, wrong secrets and expiry", () => {
    const { token } = createActionToken({ issueId: "KAN-18", toState: "In Progress" }, "secret-0123456789abcdef", NOW);
    expect(verifyActionToken(token, "secret-0123456789abcdef", NOW)).toMatchObject({ ok: true, claim: { issueId: "KAN-18", toState: "In Progress" } });
    expect(verifyActionToken(token, "other-secret-0123456789", NOW)).toEqual({ ok: false, reason: "invalid" });
    expect(verifyActionToken(token, "secret-0123456789abcdef", NOW + ACTION_TOKEN_TTL_MS + 1)).toEqual({ ok: false, reason: "expired" });
    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ issueId: "KAN-1", toState: "In Progress", expiresAt: NOW + 1e9 })).toString("base64url");
    expect(verifyActionToken(`${forged}.${sig}`, "secret-0123456789abcdef", NOW).ok).toBe(false);
    expect(verifyActionToken(`${payload}.${sig}.x`, "secret-0123456789abcdef", NOW).ok).toBe(false);
    expect(verifyActionToken(42, "secret-0123456789abcdef", NOW).ok).toBe(false);
    expect(verifyActionToken("not-base64.sig", "secret-0123456789abcdef", NOW).ok).toBe(false);
  });
});

describe("proposeTransition", () => {
  it("explains it's off when no write key is configured", async () => {
    const answer = await proposeTransition({ issueIds: ["KAN-18"], targetState: "In Progress" }, makeConfig({ LINEAR_API_KEY: "lin_read" }), { fetch: mockFetch() });
    expect(answer.reply).toMatch(/isn't switched on/);
    expect(answer.proposedAction).toBeUndefined();
  });

  it("answers the capability question with one-click suggestions", async () => {
    const { fetch } = fakeLinear();
    const answer = await answerQuestion("can we move tickets to in progress here?", [], makeConfig(ENABLED), { fetch, grok: null });
    expect(answer.provider).toBe("action");
    expect(answer.reply).toMatch(/Tell me which ticket/);
    expect(answer.relatedQuestions).toEqual(["Move KAN-18 to In Progress"]);
    expect(answer.proposedAction).toBeUndefined();
  });

  it("proposes a signed move without changing anything", async () => {
    const { fetch, mutations } = fakeLinear();
    const answer = await proposeTransition({ issueIds: ["KAN-18"], targetState: "In Progress" }, makeConfig(ENABLED), { fetch, now: () => NOW });
    expect(answer.proposedAction).toMatchObject({ kind: "linear_transition", issueId: "KAN-18", fromState: "Todo", toState: "In Progress", expiresAt: NOW + ACTION_TOKEN_TTL_MS });
    expect(answer.citations[0]).toMatchObject({ id: "linear:KAN-18", status: "Todo" });
    expect(mutations).toHaveLength(0);
  });

  it("refuses disallowed states, other teams, unknown and already-moved tickets", async () => {
    const config = makeConfig(ENABLED);
    expect((await proposeTransition({ issueIds: ["KAN-18"], targetState: "Done" }, config, { fetch: fakeLinear().fetch })).reply).toMatch(/can't move tickets to Done/);
    expect((await proposeTransition({ issueIds: ["KAN-100"], targetState: "In Progress" }, config, { fetch: fakeLinear().fetch })).reply).toMatch(/couldn't find KAN-100/);
    const other = fakeLinear({ ...KAN_18, team: { id: "x", key: "OPS" } });
    expect((await proposeTransition({ issueIds: ["KAN-18"], targetState: "In Progress" }, config, { fetch: other.fetch })).reply).toMatch(/isn't in the KAN team/);
    const started = fakeLinear({ ...KAN_18, state: { name: "In Progress", type: "started" } });
    expect((await proposeTransition({ issueIds: ["KAN-18"], targetState: "In Progress" }, config, { fetch: started.fetch })).reply).toMatch(/already In Progress/);
    const two = await proposeTransition({ issueIds: ["KAN-18", "KAN-6"], targetState: "In Progress" }, config, { fetch: fakeLinear().fetch });
    expect(two.reply).toMatch(/One ticket at a time/);
    expect(two.relatedQuestions).toEqual(["Move KAN-18 to In Progress", "Move KAN-6 to In Progress"]);
  });
});

describe("executeTransition", () => {
  const config = makeConfig(ENABLED);
  const token = () => createActionToken({ issueId: "KAN-18", toState: "In Progress" }, config.actions.secret!, NOW).token;

  it("moves the ticket, leaves an audit comment, and cites the new state", async () => {
    const linear = fakeLinear();
    const answer = await executeTransition(token(), config, { fetch: linear.fetch, now: () => NOW });
    expect(answer.reply).toMatch(/Moved KAN-18 to In Progress/);
    expect(answer.citations[0].status).toBe("In Progress");
    expect(linear.mutations.map((m) => m.query.includes("issueUpdate") ? "update" : "comment")).toEqual(["update", "comment"]);
    expect(linear.mutations[0].variables).toEqual({ id: "uuid-17", stateId: "state-inprogress" });
    const writeCall = linear.fetch.calls.find((c) => String(c.init?.body).includes("issueUpdate"))!;
    expect((writeCall.init!.headers as Record<string, string>).Authorization).toBe("lin_write");
  });

  it("is idempotent: a replayed token doesn't move it again", async () => {
    const linear = fakeLinear();
    await executeTransition(token(), config, { fetch: linear.fetch, now: () => NOW });
    const again = await executeTransition(token(), config, { fetch: linear.fetch, now: () => NOW });
    expect(again.reply).toMatch(/already In Progress/);
    expect(linear.mutations.filter((m) => m.query.includes("issueUpdate"))).toHaveLength(1);
  });

  it("still succeeds if the audit comment fails", async () => {
    const answer = await executeTransition(token(), config, { fetch: fakeLinear(undefined, { commentFails: true }).fetch, now: () => NOW });
    expect(answer.reply).toMatch(/Moved KAN-18/);
  });

  it("refuses bad tokens, expiry, missing config, other teams and failed updates", async () => {
    const run = (t: unknown, c = config, fetch = fakeLinear().fetch, now = NOW) => executeTransition(t, c, { fetch, now: () => now });
    await expect(run("forged.token")).rejects.toMatchObject({ status: 400, code: "invalid_confirmation" });
    await expect(run(token(), config, fakeLinear().fetch, NOW + ACTION_TOKEN_TTL_MS + 1)).rejects.toMatchObject({ status: 410, code: "confirmation_expired" });
    await expect(run(token(), makeConfig({ LINEAR_API_KEY: "r" }))).rejects.toMatchObject({ status: 503 });
    await expect(run(token(), config, fakeLinear({ ...KAN_18, team: { id: "x", key: "OPS" } }).fetch)).rejects.toMatchObject({ status: 403, code: "issue_outside_team" });
    await expect(run(token(), config, fakeLinear(null).fetch)).rejects.toMatchObject({ status: 404 });
    await expect(run(token(), config, fakeLinear(undefined, { updateFails: true }).fetch)).rejects.toMatchObject({ status: 502 });
    const doneToken = createActionToken({ issueId: "KAN-18", toState: "Done" }, config.actions.secret!, NOW).token;
    await expect(run(doneToken)).rejects.toBeInstanceOf(ActionError);
  });
});

describe("action endpoint", () => {
  it("requires auth, executes with a valid token, and maps refusals to status codes", async () => {
    const config = makeConfig(ENABLED);
    const linear = fakeLinear();
    const app = createApp({ config, grok: null, fetch: linear.fetch, now: () => NOW });
    const ctx = { ip: "1.1.1.1", requestId: "r", path: "/api/v1/actions/linear-transition" };

    const unauth = await app(postJson(ctx.path, { token: "x" }, { Authorization: "" }), ctx);
    expect(unauth.status).toBe(401);

    const { token } = createActionToken({ issueId: "KAN-18", toState: "In Progress" }, config.actions.secret!, NOW);
    const ok = await app(postJson(ctx.path, { token }), ctx);
    expect(ok.status).toBe(200);
    expect(await ok.json()).toMatchObject({ provider: "action", citations: [{ id: "linear:KAN-18", status: "In Progress" }] });

    const bad = await app(postJson(ctx.path, { token: "nope" }), ctx);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe("invalid_confirmation");
  });
});
