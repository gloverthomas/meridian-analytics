/**
 * Questions about the Cursor SDK workflow: the agent's plan for a ticket, how
 * evals are tracking, and where a ticket is in the pipeline. Reads the
 * authenticated liquid-workflow API plus Linear history and GitHub PRs.
 */
import type { ChartSeries, ChartSpec, PipelineTimeline, TimelineStep } from "../shared/contracts.js";
import { describeChart, makeBuckets } from "./charts.js";
import type { Config } from "./config.js";
import { errorCode, logEvent } from "./log.js";
import { searchPullsMentioning, type GithubPull } from "./retrieval/github.js";
import { fetchIssueHistory, type LinearIssueHistory } from "./retrieval/linear.js";
import type { RetrievalPlan } from "./retrieval/router.js";
import type { FetchLike, RetrievedItem } from "./retrieval/types.js";
import {
  evalSummary,
  fetchEvalReports,
  fetchGates,
  fetchWorkflowRun,
  fetchWorkflowRuns,
  normalizePlanRun,
  type EvalReport,
  type WorkflowDeps,
  type WorkflowGates,
  type WorkflowRunSummary,
} from "./retrieval/workflow.js";
import type { ConnectorMode, RetrievalMeta } from "../shared/contracts.js";

export interface WorkflowOutcome {
  context: string;
  items: RetrievedItem[];
  meta: RetrievalMeta;
  charts: ChartSpec[];
  timeline?: PipelineTimeline;
  /** Set for plan questions: the ticket whose plan was shown, and whether its eval passed. */
  plan?: { issueId: string; evalPassed: boolean };
}

const UNAVAILABLE =
  "WORKFLOW SERVICE UNAVAILABLE: liquid-workflow didn't respond (it runs on Tom's Mac behind the workflow.meridian-saas.local tunnel — it may be stopped), so Cursor plans and evals can't be read right now. Say so plainly.";

function meta(mode: ConnectorMode, days: number, count: number, extra: Partial<Record<"linear" | "github", ConnectorMode>> = {}): RetrievalMeta {
  return {
    connectors: ["workflow", ...(Object.keys(extra) as Array<"linear" | "github">)],
    connectorModes: { workflow: mode, ...extra },
    window: `last ${days} days`,
    truncated: false,
    itemCount: count,
  };
}

function depsFor(config: Config, fetch: FetchLike): WorkflowDeps | null {
  return config.workflow.token ? { baseUrl: config.workflow.baseUrl, token: config.workflow.token, fetch } : null;
}

const latestFirst = (a: WorkflowRunSummary, b: WorkflowRunSummary) => b.startedAt.localeCompare(a.startedAt);

// ─── "What's the Cursor plan for KAN-18?" ───────────────────────────────────

async function planQuestion(plan: RetrievalPlan, wf: WorkflowDeps, days: number): Promise<WorkflowOutcome> {
  const runs = (await fetchWorkflowRuns(wf)).filter((r) => r.kind === "plan").sort(latestFirst);
  const issueId = plan.issueIds[0] ?? runs.find((r) => r.status === "completed")?.issue.identifier;
  const forIssue = runs.filter((r) => r.issue.identifier.toUpperCase() === issueId);
  const chosen = forIssue.find((r) => r.status === "completed" && !r.dryRun) ?? forIssue[0];
  if (!issueId || !chosen) {
    const text = `[workflow:none] No Cursor plan runs are recorded${issueId ? ` for ${issueId}` : ""}. Moving a ticket to In Progress (e.g. "Move ${issueId ?? "KAN-18"} to In Progress") starts one.`;
    return { context: text, items: [], meta: meta("live", days, 0), charts: [] };
  }
  const record = await fetchWorkflowRun(chosen.runId, wf);
  const report =
    record.eval ?? (await fetchEvalReports(wf, 200)).find((r) => r.runId === chosen.runId) ?? null;
  const item = normalizePlanRun(record, report, wf.baseUrl);
  const attempts = `${forIssue.length} plan run(s) recorded for ${issueId}; showing ${chosen.runId}.`;
  return {
    context: `WORKFLOW: ${attempts}\n${item.text}`,
    items: [item],
    meta: meta("live", days, 1),
    charts: [],
    plan: { issueId, evalPassed: Boolean(report?.passed) },
  };
}

// ─── "How are our evals tracking?" ──────────────────────────────────────────

export function evalCharts(reports: EvalReport[], days: number, nowMs: number, timeZone: string): ChartSpec[] {
  const charts: ChartSpec[] = [];
  const b = makeBuckets(days, nowMs, timeZone);
  const count = (list: EvalReport[]) => {
    const values = b.labels.map(() => 0);
    for (const r of list) {
      const i = b.indexOf(r.checkedAt);
      if (i >= 0) values[i] += 1;
    }
    return values;
  };
  const series: ChartSeries[] = [
    { key: "passed", name: "Passed", color: "good", values: count(reports.filter((r) => r.passed)) },
    { key: "failed", name: "Failed", color: "critical", values: count(reports.filter((r) => !r.passed)) },
  ];
  if (series.some((s) => s.values.some(Boolean))) {
    charts.push({
      id: "evals_daily",
      kind: "stacked",
      title: `Cursor plan evals per ${b.unit}`,
      subtitle: `Last ${days} days · deterministic eval harness · liquid-workflow`,
      categories: b.labels,
      series,
      unit: "eval reports",
      sample: false,
    });
  }
  const fails = new Map<string, number>();
  for (const r of reports) for (const c of r.checks) if (!c.passed) fails.set(c.id, (fails.get(c.id) ?? 0) + 1);
  const top = [...fails].sort((a, b2) => b2[1] - a[1]).slice(0, 8);
  if (top.length) {
    charts.push({
      id: "eval_checks",
      kind: "ranked",
      title: "Most-failed eval checks",
      subtitle: `${reports.length} eval reports · times each check failed`,
      categories: top.map(([id]) => id),
      series: [{ key: "failures", name: "Failures", color: "series2", values: top.map(([, n]) => n) }],
      unit: "failures",
      sample: false,
    });
  }
  return charts;
}

async function evalsQuestion(plan: RetrievalPlan, wf: WorkflowDeps, config: Config, nowMs: number): Promise<WorkflowOutcome> {
  const reports = await fetchEvalReports(wf, 500);
  const days = Math.max(plan.sinceDays, 7);
  const scoped = plan.issueIds.length ? reports.filter((r) => plan.issueIds.includes(r.issueId.toUpperCase())) : reports;
  const { text, inWindow } = evalSummary(scoped, days, nowMs);
  const item: RetrievedItem = {
    connector: "workflow",
    citation: { id: "workflow:evals", kind: "workflow_run", title: "Cursor plan evals · liquid-workflow", url: `${wf.baseUrl}/evals`, status: "live" },
    text: `[workflow:evals] ${text} Checks are pass/fail rules on the plan artifact (e.g. human-write-gate: the plan must say a human approves before PRs; playwright-parity: it must prove both apps with Playwright).`,
    updatedAt: inWindow[0]?.checkedAt ?? null,
    mentions: plan.issueIds,
  };
  const charts = evalCharts(inWindow, days, nowMs, config.timeZone);
  return { context: `${charts.map(describeChart).join("\n")}\n\n${item.text}`, items: [item], meta: meta("live", days, 1), charts };
}

// ─── "Where is KAN-5 in the pipeline?" ─────────────────────────────────────

export function buildTimeline(
  issue: LinearIssueHistory,
  runs: WorkflowRunSummary[],
  reports: EvalReport[],
  gates: WorkflowGates | null,
  pulls: GithubPull[],
): PipelineTimeline {
  const step = (key: TimelineStep["key"], label: string, status: TimelineStep["status"], at: string | null, detail: string, url: string | null = null): TimelineStep => ({ key, label, status, at, detail, url });
  const history = [...issue.history.nodes].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lastInto = (state: string) => [...history].reverse().find((h) => h.toState?.name === state)?.createdAt ?? null;

  const triaged = history.find((h) => h.toState?.name === "Todo")?.createdAt ?? issue.createdAt;
  const plans = runs.filter((r) => r.kind === "plan").sort(latestFirst);
  const implementRuns = runs.filter((r) => r.kind === "implement").sort(latestFirst);
  const latestPlan = plans[0];
  const planReport = latestPlan ? (reports.find((r) => r.runId === latestPlan.runId) ?? null) : null;
  const latestImpl = implementRuns[0];
  const merged = pulls.filter((p) => p.merged_at).sort((a, b) => (b.merged_at ?? "").localeCompare(a.merged_at ?? ""));
  const open = pulls.filter((p) => !p.merged_at && p.state === "open");
  const state = issue.state?.name ?? "Unknown";

  const planStatus: TimelineStep["status"] = !latestPlan ? "pending" : latestPlan.status === "completed" ? "done" : latestPlan.status === "failed" ? "failed" : latestPlan.dryRun ? "done" : "current";
  const evalStatus: TimelineStep["status"] = !planReport ? "pending" : planReport.passed ? "done" : "failed";
  const approval = gates?.formalApproval ?? null;
  const implStatus: TimelineStep["status"] = !latestImpl ? "pending" : latestImpl.status === "completed" ? "done" : latestImpl.status === "failed" ? "failed" : "current";

  const steps: TimelineStep[] = [
    step("signal", "Triage", "done", triaged, `Ticket opened ${issue.createdAt.slice(0, 10)}`, issue.url),
    step(
      "planning",
      "Cursor plan",
      planStatus,
      latestPlan?.startedAt ?? lastInto("In Progress"),
      latestPlan ? `${plans.length} run(s); latest ${latestPlan.dryRun ? "dry run" : latestPlan.status}` : "Not started — move to In Progress",
      latestPlan?.agentUrl ?? null,
    ),
    step(
      "eval",
      "Eval gate",
      evalStatus,
      planReport?.checkedAt ?? null,
      planReport ? `${planReport.checks.filter((c) => c.passed).length}/${planReport.checks.length} checks passed` : "Waiting for a plan",
      null,
    ),
    step("approval", "Human approval", approval ? "done" : "pending", null, approval ? `Approved by ${approval.actor ?? "a human"}` : "Awaiting approval", null),
    step(
      "implement",
      "Implement",
      implStatus,
      latestImpl?.startedAt ?? lastInto("In Review"),
      latestImpl ? (latestImpl.status === "failed" ? (latestImpl.error ?? "failed").split(".")[0].slice(0, 90) : latestImpl.status) : "Not started",
      latestImpl?.agentUrl ?? null,
    ),
    step(
      "pr",
      "Pull requests",
      merged.length || open.length ? (open.length ? "current" : "done") : "pending",
      (open[0] ?? merged[0])?.created_at ?? null,
      pulls.length ? `${merged.length} merged, ${open.length} open` : "None mention this ticket yet",
      (open[0] ?? merged[0])?.html_url ?? null,
    ),
    step("merged", "Merged", merged.length ? "done" : "pending", merged[0]?.merged_at ?? null, merged.length ? `Latest #${merged[0].number}` : "Nothing merged", merged[0]?.html_url ?? null),
    step(
      "done",
      "Done",
      state === "Done" ? "done" : state === "Canceled" ? "skipped" : "pending",
      issue.completedAt ?? issue.canceledAt,
      `Linear: ${state}`,
      issue.url,
    ),
  ];

  // Mark where the ticket is now: the earliest stage still waiting (PRs that merely mention
  // the ticket can be "done" while approval is still outstanding).
  const next = steps.findIndex((s) => s.status === "pending");
  if (next >= 0 && state !== "Done" && !steps.some((s) => s.status === "current")) steps[next] = { ...steps[next], status: "current" };

  return { issueId: issue.identifier, title: issue.title, url: issue.url, state, steps };
}

async function pipelineQuestion(plan: RetrievalPlan, wf: WorkflowDeps, config: Config, fetch: FetchLike, days: number): Promise<WorkflowOutcome> {
  const issueId = plan.issueIds[0];
  const linearKey = config.linear.apiKey;
  const [issue, runs, reports, gates, pulls] = await Promise.all([
    linearKey ? fetchIssueHistory(issueId, { apiKey: linearKey, fetch }) : Promise.resolve(null),
    fetchWorkflowRuns(wf).then((all) => all.filter((r) => r.issue.identifier.toUpperCase() === issueId)),
    fetchEvalReports(wf, 500).then((all) => all.filter((r) => r.issueId.toUpperCase() === issueId)),
    fetchGates(issueId, wf).catch(() => null),
    config.github.token
      ? searchPullsMentioning([issueId], config.github.repos, { token: config.github.token, fetch }).then((hits) => hits.map((h) => h.pull))
      : Promise.resolve([] as GithubPull[]),
  ]);
  if (!issue) {
    return { context: `[workflow:none] ${issueId} wasn't found in Linear, so its pipeline can't be shown.`, items: [], meta: meta("live", days, 0), charts: [] };
  }
  const timeline = buildTimeline(issue, runs, reports, gates, pulls);
  const lines = timeline.steps.map((s) => `${s.label}: ${s.status}${s.at ? ` (${s.at.slice(0, 16).replace("T", " ")} UTC)` : ""} — ${s.detail}`).join("; ");
  const item: RetrievedItem = {
    connector: "workflow",
    citation: { id: `workflow:pipeline:${issueId}`, kind: "workflow_run", title: `${issueId} pipeline`, url: issue.url, status: timeline.state },
    text: `[workflow:pipeline:${issueId}] PIPELINE for ${issueId} "${issue.title}" (Linear state ${timeline.state}; the app draws this as a timeline): ${lines}.`,
    updatedAt: issue.completedAt ?? issue.history.nodes.at(-1)?.createdAt ?? null,
    mentions: [issueId],
  };
  return { context: item.text, items: [item], meta: meta("live", days, 1, { linear: linearKey ? "live" : "unavailable", github: config.github.token ? "live" : "unavailable" }), charts: [], timeline };
}

export async function runWorkflowQuestion(plan: RetrievalPlan, config: Config, fetch: FetchLike, nowMs: number): Promise<WorkflowOutcome> {
  const days = plan.sinceDays;
  const wf = depsFor(config, fetch);
  if (!wf) return { context: UNAVAILABLE.replace("didn't respond", "isn't connected (no WORKFLOW_API_TOKEN)"), items: [], meta: meta("unavailable", days, 0), charts: [] };
  try {
    if (plan.intent === "evals") return await evalsQuestion(plan, wf, config, nowMs);
    if (plan.intent === "pipeline") return await pipelineQuestion(plan, wf, config, fetch, days);
    return await planQuestion(plan, wf, days);
  } catch (error) {
    logEvent("connector_error", { connectors: ["workflow"], connector_error: errorCode(error) });
    return { context: UNAVAILABLE, items: [], meta: meta("unavailable", days, 0), charts: [] };
  }
}
