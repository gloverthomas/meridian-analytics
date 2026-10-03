/**
 * liquid-workflow connector (Cursor SDK plan/eval/implement service). Reads run
 * summaries, a run's plan transcript, eval reports and approval gates through
 * the service's authenticated API. The token never leaves the server.
 */
import { clip } from "./redact.js";
import { CONNECTOR_TIMEOUT_MS, type FetchLike, type RetrievedItem } from "./types.js";

export interface WorkflowDeps {
  baseUrl: string;
  token: string;
  fetch: FetchLike;
}

export interface WorkflowRunSummary {
  runId: string;
  kind: "plan" | "implement";
  status: "queued" | "running" | "completed" | "failed" | "dry_run";
  issue: { identifier: string; title: string; url?: string };
  startedAt: string;
  finishedAt: string | null;
  dryRun: boolean;
  agentUrl: string | null;
  prUrls: string[];
  summary: string | null;
  error: string | null;
  eval: { passed: boolean; failed: string[] } | null;
}

export interface EvalCheck {
  id: string;
  passed: boolean;
  label?: string;
  detail?: string;
}

export interface EvalReport {
  evalId: string;
  runId: string;
  issueId: string;
  kind: "plan" | "implement";
  passed: boolean;
  checkedAt?: string;
  checks: EvalCheck[];
}

export interface WorkflowRunRecord extends Omit<WorkflowRunSummary, "summary" | "eval"> {
  summary?: string;
  modelRoster?: string;
  eval?: EvalReport;
}

export interface WorkflowGates {
  formalApproval: { approvalId?: string; actor?: string; expiresAt?: string } | null;
  requireFormalApproval?: boolean;
  [key: string]: unknown;
}

async function get<T>(path: string, deps: WorkflowDeps): Promise<T> {
  const res = await deps.fetch(`${deps.baseUrl}${path}`, {
    headers: { Authorization: `Bearer ${deps.token}`, Accept: "application/json" },
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`workflow_${res.status}`);
  return (await res.json()) as T;
}

export const fetchWorkflowRuns = (deps: WorkflowDeps, limit = 200) =>
  get<{ runs: WorkflowRunSummary[] }>(`/runs?limit=${limit}`, deps).then((r) => r.runs);

export const fetchWorkflowRun = (runId: string, deps: WorkflowDeps) =>
  get<{ record: WorkflowRunRecord }>(`/runs/${encodeURIComponent(runId)}`, deps).then((r) => r.record);

export const fetchEvalReports = (deps: WorkflowDeps, limit = 200) =>
  get<{ reports: EvalReport[] }>(`/evals/reports?limit=${limit}`, deps).then((r) => r.reports);

export const fetchGates = (issueId: string, deps: WorkflowDeps) =>
  get<WorkflowGates>(`/gates?issue=${encodeURIComponent(issueId)}`, deps);

/** Records the human approval the write-gate requires (actor is always Meridian Insights). */
export async function approveImplement(issueId: string, note: string, deps: WorkflowDeps): Promise<{ approvalId?: string; expiresAt?: string }> {
  const res = await deps.fetch(`${deps.baseUrl}/approve`, {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ issue: issueId, actor: "liquid-insights", note }),
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`workflow_approve_${res.status}`);
  const body = (await res.json()) as { approval?: { approvalId?: string; expiresAt?: string } };
  return body.approval ?? {};
}

/**
 * Plan transcripts are stored as streamed fragments ("Beginning work\n to fix\n ...").
 * Rejoin single newlines, keep paragraph breaks, and keep the end — that's where
 * the converged plan is.
 */
export function cleanTranscript(raw: string, maxChars = 3_500): string {
  const joined = raw
    .replace(/\r/g, "")
    .replace(/(?<!\n)\n(?!\n)/g, "")
    .replace(/\n{2,}/g, "\n\n")
    .trim();
  return joined.length > maxChars ? `…${joined.slice(joined.length - maxChars)}` : joined;
}

const statusWord = (run: Pick<WorkflowRunSummary, "status" | "dryRun">) => (run.dryRun ? "dry run" : run.status);

export function normalizePlanRun(run: WorkflowRunRecord, evalReport: EvalReport | null, baseUrl: string): RetrievedItem {
  const id = `workflow:run:${run.runId}`;
  const checks = evalReport?.checks ?? [];
  const evalLine = evalReport
    ? `Eval ${evalReport.passed ? "PASSED" : "FAILED"} (${checks.filter((c) => c.passed).length}/${checks.length} checks): ${checks.map((c) => `${c.id}=${c.passed ? "pass" : "FAIL"}`).join(", ")}.`
    : "No eval report for this run.";
  const transcript = run.summary ? cleanTranscript(run.summary) : "(no plan transcript saved)";
  return {
    connector: "workflow",
    citation: {
      id,
      kind: "workflow_run",
      title: `${run.issue.identifier} Cursor ${run.kind} · ${statusWord(run)}`,
      url: run.agentUrl ?? `${baseUrl}/evals`,
      status: evalReport ? (evalReport.passed ? "eval passed" : "eval failed") : statusWord(run),
    },
    text: `[${id}] Cursor SDK ${run.kind} run for ${run.issue.identifier} "${clip(run.issue.title, 120)}" — ${statusWord(run)}, started ${run.startedAt.slice(0, 16).replace("T", " ")} UTC. ${evalLine}\n  PLAN TRANSCRIPT (the agent's working notes, most recent part; the full plan is in the Cursor agent run): ${clip(transcript, 3_500)}`,
    updatedAt: run.finishedAt ?? run.startedAt,
    mentions: [run.issue.identifier.toUpperCase()],
  };
}

/** Deterministic eval roll-up for Grok: pass rate, per-ticket latest verdict, most-failed checks. */
export function evalSummary(reports: EvalReport[], days: number, nowMs: number): { text: string; inWindow: EvalReport[] } {
  const cutoff = nowMs - days * 86_400_000;
  const inWindow = reports.filter((r) => !r.checkedAt || Date.parse(r.checkedAt) >= cutoff);
  const pool = inWindow.length ? inWindow : reports;
  const passed = pool.filter((r) => r.passed).length;
  const latestByIssue = new Map<string, EvalReport>();
  for (const r of pool) if (!latestByIssue.has(`${r.issueId}:${r.kind}`)) latestByIssue.set(`${r.issueId}:${r.kind}`, r);
  const fails = new Map<string, number>();
  for (const r of pool) for (const c of r.checks) if (!c.passed) fails.set(c.id, (fails.get(c.id) ?? 0) + 1);
  const topFails = [...fails].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([id, n]) => `${id} ${n}`).join(", ") || "none";
  const perIssue = [...latestByIssue.values()].map((r) => `${r.issueId} ${r.kind}: ${r.passed ? "passed" : "failed"}`).join("; ");
  const text = `EVAL COUNTS (computed by the server from liquid-workflow's deterministic eval harness; ${inWindow.length ? `last ${days} days` : "all saved reports"}): ${pool.length} eval reports, ${passed} passed, ${pool.length - passed} failed (pass rate ${pool.length ? Math.round((passed / pool.length) * 100) : 0}%). Latest verdict per ticket: ${perIssue || "none"}. Most-failed checks: ${topFails}.`;
  return { text, inWindow: pool };
}
