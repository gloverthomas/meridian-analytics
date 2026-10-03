/** Cursor workflow questions (plan, evals, pipeline) and the confirm-gated "Approve & implement". */
import { describe, expect, it } from "vitest";
import { executeImplement, IMPLEMENT_STATE, proposeImplement } from "../../server/actions/workflowImplement.js";
import { executeTransition } from "../../server/actions/linearTransition.js";
import { createActionToken } from "../../server/actions/token.js";
import { progressSteps } from "../../server/progress.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import { cleanTranscript, evalSummary, normalizePlanRun, type EvalReport, type WorkflowRunSummary } from "../../server/retrieval/workflow.js";
import type { LinearIssueHistory } from "../../server/retrieval/linear.js";
import { buildTimeline, evalCharts, runWorkflowQuestion } from "../../server/workflowQuestions.js";
import { jsonResponse, makeConfig, mockFetch } from "../helpers.js";

const NOW = Date.parse("2026-09-25T06:00:00Z");
const WF = "http://127.0.0.1:4100";
const WF_TOKEN = "wf-token-0123456789abcdef0123456789";
const REPOS = ["gloverthomas/meridian-saas-core", "gloverthomas/meridian-saas-reporting"];
const ENV = { LINEAR_API_KEY: "lin_read", LINEAR_ACTIONS_API_KEY: "lin_write", WORKFLOW_API_TOKEN: WF_TOKEN };
const TEAM = { id: "team-uuid", key: "KAN" };

const run = (over: Partial<WorkflowRunSummary> = {}): WorkflowRunSummary => ({
  runId: "run_plan_1",
  kind: "plan",
  status: "completed",
  issue: { identifier: "KAN-5", title: "Assistant replies slow" },
  startedAt: "2026-09-24T01:00:00Z",
  finishedAt: "2026-09-24T01:10:00Z",
  dryRun: false,
  agentUrl: "https://cursor.com/agents/abc",
  prUrls: [],
  summary: null,
  error: null,
  eval: null,
  ...over,
});

const report = (over: Partial<EvalReport> = {}): EvalReport => ({
  evalId: "ev1",
  runId: "run_plan_1",
  issueId: "KAN-5",
  kind: "plan",
  passed: true,
  checkedAt: "2026-09-24T01:11:00Z",
  checks: [
    { id: "human-write-gate", passed: true },
    { id: "playwright-parity", passed: true },
  ],
  ...over,
});

const history = (over: Partial<LinearIssueHistory> = {}): LinearIssueHistory => ({
  identifier: "KAN-5",
  title: "Assistant replies slow",
  url: "https://linear.app/x/KAN-5",
  createdAt: "2026-09-20T00:00:00Z",
  completedAt: null,
  canceledAt: null,
  state: { name: "In Progress" },
  history: { nodes: [{ createdAt: "2026-09-21T00:00:00Z", fromState: { name: "Triage" }, toState: { name: "Todo" } }] },
  ...over,
});

describe("router: workflow intents", () => {
  it("routes plan, eval and pipeline questions", () => {
    expect(planRetrieval("What's the Cursor plan for KAN-5?", REPOS)).toMatchObject({ intent: "workflow_plan", issueIds: ["KAN-5"] });
    expect(planRetrieval("How are our evals tracking?", REPOS).intent).toBe("evals");
    expect(planRetrieval("Where is KAN-5 in the pipeline?", REPOS)).toMatchObject({ intent: "pipeline", issueIds: ["KAN-5"] });
  });

  it("names the workflow steps in the progress list", () => {
    const config = makeConfig(ENV);
    expect(progressSteps("How are our evals tracking?", config)[0]).toBe("Reading eval reports from liquid-workflow…");
    expect(progressSteps("Where is KAN-5 in the pipeline?", config)).toContain("Drawing the pipeline…");
  });
});

describe("workflow connector helpers", () => {
  it("rejoins streamed transcript fragments and keeps the end", () => {
    expect(cleanTranscript("Beginning work\n to fix\n it.\n\nPlan:\n step one")).toBe("Beginning work to fix it.\n\nPlan: step one");
    const long = cleanTranscript("x".repeat(50) + "END", 10);
    expect(long.startsWith("…")).toBe(true);
    expect(long.endsWith("END")).toBe(true);
  });

  it("normalises a plan run with its eval checklist", () => {
    const item = normalizePlanRun({ ...run(), eval: undefined, summary: "Fix\n the cache" }, report({ passed: false, checks: [{ id: "human-write-gate", passed: false }] }), WF);
    expect(item.citation).toMatchObject({ id: "workflow:run:run_plan_1", kind: "workflow_run", status: "eval failed", url: "https://cursor.com/agents/abc" });
    expect(item.text).toContain("Eval FAILED (0/1 checks): human-write-gate=FAIL");
    expect(item.text).toContain("Fix the cache");
  });

  it("summarises evals deterministically", () => {
    const reports = [report(), report({ evalId: "ev2", passed: false, checks: [{ id: "human-write-gate", passed: false }] })];
    const { text } = evalSummary(reports, 14, NOW);
    expect(text).toContain("2 eval reports, 1 passed, 1 failed (pass rate 50%)");
    expect(text).toContain("Most-failed checks: human-write-gate 1");
  });

  it("builds a stacked daily chart and a most-failed-checks chart", () => {
    const charts = evalCharts([report(), report({ passed: false, checks: [{ id: "playwright-parity", passed: false }] })], 7, NOW, "Australia/Sydney");
    expect(charts.map((c) => c.id)).toEqual(["evals_daily", "eval_checks"]);
    const daily = charts[0];
    expect(daily.series.map((s) => [s.name, s.values.reduce((a, b) => a + b, 0)])).toEqual([
      ["Passed", 1],
      ["Failed", 1],
    ]);
    expect(charts[1].categories).toEqual(["playwright-parity"]);
  });

  it("returns no charts when there are no reports", () => {
    expect(evalCharts([], 7, NOW, "Australia/Sydney")).toEqual([]);
  });
});

describe("buildTimeline", () => {
  it("marks the next stage after the last completed one as current", () => {
    const t = buildTimeline(history(), [run()], [report()], null, []);
    expect(t.steps.map((s) => `${s.key}=${s.status}`)).toEqual([
      "signal=done",
      "planning=done",
      "eval=done",
      "approval=current",
      "implement=pending",
      "pr=pending",
      "merged=pending",
      "done=pending",
    ]);
  });

  it("shows failed implement runs, open PRs and approval", () => {
    const t = buildTimeline(
      history(),
      [run(), run({ runId: "run_impl", kind: "implement", status: "failed", error: "Blocked by write gate. More text" })],
      [report()],
      { formalApproval: { actor: "liquid-insights" } },
      [{ number: 12, title: "fix", html_url: "https://github.com/x/pull/12", state: "open", merged_at: null, updated_at: "2026-09-24T02:00:00Z", user: null }],
    );
    const by = Object.fromEntries(t.steps.map((s) => [s.key, s]));
    expect(by.approval).toMatchObject({ status: "done", detail: "Approved by liquid-insights" });
    expect(by.implement).toMatchObject({ status: "failed", detail: "Blocked by write gate" });
    expect(by.pr).toMatchObject({ status: "current", url: "https://github.com/x/pull/12" });
  });

  it("finishes at Done for completed tickets", () => {
    const t = buildTimeline(history({ state: { name: "Done" }, completedAt: "2026-09-25T00:00:00Z" }), [], [], null, []);
    expect(t.steps.at(-1)).toMatchObject({ key: "done", status: "done" });
    expect(t.steps.some((s) => s.status === "current")).toBe(false);
  });
});

function workflowFetch(opts: { down?: boolean } = {}) {
  return mockFetch((url, init) => {
    if (!url.startsWith(WF)) return undefined;
    if (opts.down) return jsonResponse({}, 502);
    expect(new Headers(init?.headers).get("Authorization")).toBe(`Bearer ${WF_TOKEN}`);
    if (url.startsWith(`${WF}/runs?`)) return jsonResponse({ runs: [run(), run({ runId: "run_old", startedAt: "2026-09-01T00:00:00Z" })] });
    if (url.startsWith(`${WF}/runs/run_plan_1`)) return jsonResponse({ record: { ...run(), summary: "Plan:\n add caching", eval: report() } });
    if (url.startsWith(`${WF}/evals/reports`)) return jsonResponse({ reports: [report()] });
    return undefined;
  });
}

describe("runWorkflowQuestion", () => {
  const config = makeConfig(ENV);

  it("answers a plan question with the latest completed run and its eval", async () => {
    const out = await runWorkflowQuestion(planRetrieval("What's the Cursor plan for KAN-5?", REPOS), config, workflowFetch(), NOW);
    expect(out.items[0].citation.id).toBe("workflow:run:run_plan_1");
    expect(out.plan).toEqual({ issueId: "KAN-5", evalPassed: true });
    expect(out.context).toContain("2 plan run(s) recorded for KAN-5");
  });

  it("answers eval questions with counts and charts", async () => {
    const out = await runWorkflowQuestion(planRetrieval("How are our evals tracking?", REPOS), config, workflowFetch(), NOW);
    expect(out.context).toContain("EVAL COUNTS");
    expect(out.charts.map((c) => c.id)).toEqual(["evals_daily"]);
  });

  it("says the service is unavailable instead of throwing", async () => {
    const out = await runWorkflowQuestion(planRetrieval("How are our evals tracking?", REPOS), config, workflowFetch({ down: true }), NOW);
    expect(out.context.startsWith("WORKFLOW SERVICE UNAVAILABLE")).toBe(true);
    expect(out.meta.connectorModes.workflow).toBe("unavailable");
  });

  it("reports not connected without a token and never calls the service", async () => {
    const fetch = workflowFetch();
    const out = await runWorkflowQuestion(planRetrieval("How are our evals tracking?", REPOS), makeConfig({ LINEAR_API_KEY: "lin" }), fetch, NOW);
    expect(out.context).toContain("isn't connected");
    expect(fetch.calls).toHaveLength(0);
  });
});

type Body = { query: string; variables: Record<string, unknown> };

function implementFetch(state = "Todo", opts: { approveStatus?: number } = {}) {
  const issue = { id: "uuid-24", identifier: "KAN-5", title: "Assistant replies slow", url: "https://linear.app/x/KAN-5", team: TEAM, state: { name: state } };
  const mutations: Body[] = [];
  const approvals: unknown[] = [];
  const fetch = mockFetch((url, init) => {
    if (url === `${WF}/approve`) {
      approvals.push(JSON.parse(String(init?.body)));
      return opts.approveStatus ? jsonResponse({}, opts.approveStatus) : jsonResponse({ approval: { approvalId: "ap1", expiresAt: "2026-09-26T06:00:00Z" } });
    }
    if (!url.startsWith("https://api.linear.app/graphql")) return undefined;
    const body = JSON.parse(String(init?.body)) as Body;
    if (body.query.includes("issueUpdate")) {
      mutations.push(body);
      issue.state = { name: IMPLEMENT_STATE };
      return jsonResponse({ data: { issueUpdate: { success: true, issue: { state: issue.state } } } });
    }
    if (body.query.includes("commentCreate")) {
      mutations.push(body);
      return jsonResponse({ data: { commentCreate: { success: true } } });
    }
    if (body.query.includes("workflowStates")) return jsonResponse({ data: { workflowStates: { nodes: [{ id: "state-review", name: IMPLEMENT_STATE }] } } });
    if (body.query.includes("query Issue(")) return jsonResponse({ data: { issue } });
    return undefined;
  });
  return { fetch, mutations, approvals };
}

describe("Approve & implement", () => {
  const config = makeConfig(ENV);
  const now = () => NOW;

  it("proposes only for Todo / In Progress tickets when fully configured", async () => {
    const proposal = await proposeImplement("KAN-5", config, { fetch: implementFetch("Todo").fetch, now });
    expect(proposal).toMatchObject({ kind: "workflow_implement", fromState: "Todo", toState: IMPLEMENT_STATE });
    expect(await proposeImplement("KAN-5", config, { fetch: implementFetch("Done").fetch, now })).toBeNull();
    expect(await proposeImplement("KAN-5", makeConfig({ LINEAR_API_KEY: "lin_read", LINEAR_ACTIONS_API_KEY: "lin_write" }), { fetch: implementFetch().fetch, now })).toBeNull();
  });

  it("records the approval, then moves the ticket to In Review with an audit comment", async () => {
    const proposal = await proposeImplement("KAN-5", config, { fetch: implementFetch().fetch, now });
    const { fetch, mutations, approvals } = implementFetch();
    const result = await executeImplement(proposal!.token, config, { fetch, now });
    expect(approvals).toEqual([expect.objectContaining({ issue: "KAN-5", actor: "liquid-insights" })]);
    expect(mutations.map((m) => (m.query.includes("issueUpdate") ? "update" : "comment"))).toEqual(["update", "comment"]);
    expect(result.reply).toContain("Approved the Cursor plan for KAN-5");
  });

  it("does not move the ticket when the workflow refuses the approval", async () => {
    const proposal = await proposeImplement("KAN-5", config, { fetch: implementFetch().fetch, now });
    const { fetch, mutations } = implementFetch("Todo", { approveStatus: 401 });
    await expect(executeImplement(proposal!.token, config, { fetch, now })).rejects.toMatchObject({ status: 502, code: "workflow_auth_failed" });
    expect(mutations).toHaveLength(0);
  });

  it("keeps token kinds isolated between the two actions", async () => {
    const secret = config.actions.secret!;
    const moveToken = createActionToken({ issueId: "KAN-5", toState: IMPLEMENT_STATE }, secret, NOW).token;
    await expect(executeImplement(moveToken, config, { fetch: implementFetch().fetch, now })).rejects.toMatchObject({ code: "invalid_confirmation" });
    const implToken = createActionToken({ issueId: "KAN-5", toState: "In Progress", action: "workflow_implement" }, secret, NOW).token;
    await expect(executeTransition(implToken, config, { fetch: implementFetch().fetch, now })).rejects.toMatchObject({ code: "invalid_confirmation" });
  });
});
