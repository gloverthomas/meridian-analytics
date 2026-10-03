/** GitHub REST connector (read-only): merged PRs, PR search by ticket id, check runs on a branch. */
import { clip } from "./redact.js";
import { CONNECTOR_TIMEOUT_MS, type FetchLike, type RetrievedItem } from "./types.js";

const GITHUB_API = "https://api.github.com";
const PR_PAGE_SIZE = 50;
const SEARCH_PAGE_SIZE = 20;
const CHECKS_PAGE_SIZE = 50;
const PR_BODY_CHARS = 240;
const ISSUE_ID = /\b([A-Z][A-Z0-9]{1,5}-\d{1,6})\b/g;

export interface GithubDeps {
  token: string;
  fetch: FetchLike;
}

export interface GithubPull {
  number: number;
  title: string;
  html_url: string;
  state: string;
  merged_at: string | null;
  updated_at: string;
  created_at?: string;
  user: { login: string } | null;
  body?: string | null;
  /** Present on search results; tells us which repo the item belongs to. */
  repository_url?: string;
  pull_request?: { merged_at: string | null };
}

export interface GithubCheckRun {
  name: string;
  status: string;
  conclusion: string | null;
  html_url: string;
  head_sha: string;
  completed_at: string | null;
  started_at?: string | null;
}

async function getJson<T>(path: string, deps: GithubDeps): Promise<T> {
  const res = await deps.fetch(`${GITHUB_API}${path}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${deps.token}`,
      "User-Agent": "meridian-analytics",
      "X-GitHub-Api-Version": "2022-11-28",
    },
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`github_${res.status}`);
  return (await res.json()) as T;
}

export function fetchRecentPulls(repo: string, deps: GithubDeps): Promise<GithubPull[]> {
  return getJson<GithubPull[]>(`/repos/${repo}/pulls?state=closed&sort=updated&direction=desc&per_page=${PR_PAGE_SIZE}`, deps);
}

export async function searchPullsMentioning(ids: string[], repos: string[], deps: GithubDeps): Promise<Array<{ repo: string; pull: GithubPull }>> {
  if (!ids.length || !repos.length) return [];
  const terms = ids.map((id) => `"${id}"`).join(" OR ");
  const scope = repos.map((repo) => `repo:${repo}`).join(" ");
  const q = encodeURIComponent(`${terms} is:pr ${scope}`);
  const body = await getJson<{ items: GithubPull[] }>(`/search/issues?q=${q}&per_page=${SEARCH_PAGE_SIZE}`, deps);
  return body.items.map((pull) => ({
    repo: pull.repository_url?.split("/repos/")[1] ?? repos[0],
    pull: { ...pull, merged_at: pull.merged_at ?? pull.pull_request?.merged_at ?? null },
  }));
}

/** Free-text PR search (e.g. rationale for a design, or open security work). `query` is GitHub search syntax without scope. */
export async function searchPulls(query: string, repos: string[], deps: GithubDeps, perPage = 4): Promise<Array<{ repo: string; pull: GithubPull }>> {
  if (!repos.length) return [];
  const scope = repos.map((repo) => `repo:${repo}`).join(" ");
  const q = encodeURIComponent(`${query} is:pr ${scope}`);
  const body = await getJson<{ items: GithubPull[] }>(`/search/issues?q=${q}&per_page=${perPage}`, deps);
  return body.items.map((pull) => ({
    repo: pull.repository_url?.split("/repos/")[1] ?? repos[0],
    pull: { ...pull, merged_at: pull.merged_at ?? pull.pull_request?.merged_at ?? null },
  }));
}

export async function fetchCheckRuns(repo: string, ref: string, deps: GithubDeps): Promise<GithubCheckRun[]> {
  const body = await getJson<{ check_runs: GithubCheckRun[] }>(
    `/repos/${repo}/commits/${encodeURIComponent(ref)}/check-runs?per_page=${CHECKS_PAGE_SIZE}`,
    deps,
  );
  return body.check_runs;
}

export function mergedWithin(pulls: GithubPull[], sinceDays: number, nowMs = Date.now()): GithubPull[] {
  const cutoff = nowMs - sinceDays * 86_400_000;
  return pulls.filter((pull) => pull.merged_at && Date.parse(pull.merged_at) >= cutoff);
}

function pullStatus(pull: GithubPull): string {
  if (pull.merged_at) return "merged";
  return pull.state === "open" ? "open" : "closed";
}

export function normalizePull(repo: string, pull: GithubPull): RetrievedItem {
  const id = `github:PR:${repo}#${pull.number}`;
  const status = pullStatus(pull);
  const when = pull.merged_at ? `merged ${pull.merged_at.slice(0, 10)}` : `updated ${pull.updated_at.slice(0, 10)}`;
  const author = pull.user?.login ? `by @${pull.user.login}` : "";
  const lines = [`[${id}] ${repo} PR #${pull.number} "${clip(pull.title, 160)}" — ${status} · ${when} ${author}`.trim()];
  if (pull.body) lines.push(`  Summary: ${clip(pull.body, PR_BODY_CHARS)}`);
  const mentions = [...`${pull.title} ${pull.body ?? ""}`.matchAll(ISSUE_ID)].map((m) => m[1].toUpperCase());

  return {
    connector: "github",
    citation: { id, kind: "github_pr", title: `${repo.split("/")[1]} #${pull.number} ${clip(pull.title, 80)}`, url: pull.html_url, status },
    text: lines.join("\n"),
    updatedAt: pull.merged_at ?? pull.updated_at,
    mentions: [...new Set(mentions)],
  };
}

/** Keeps the most recent run per check name (re-runs create duplicates). */
export function latestPerCheck(runs: GithubCheckRun[]): GithubCheckRun[] {
  const byName = new Map<string, GithubCheckRun>();
  for (const run of runs) {
    const current = byName.get(run.name);
    const runTime = Date.parse(run.completed_at ?? run.started_at ?? "") || 0;
    const currentTime = current ? Date.parse(current.completed_at ?? current.started_at ?? "") || 0 : -1;
    if (runTime > currentTime) byName.set(run.name, run);
  }
  return [...byName.values()];
}

export function normalizeCheck(repo: string, ref: string, run: GithubCheckRun): RetrievedItem {
  const sha = run.head_sha.slice(0, 7);
  const id = `github:check:${repo}@${sha}:${run.name}`;
  const status = run.conclusion ?? run.status;
  const when = run.completed_at ? `completed ${run.completed_at.slice(0, 16).replace("T", " ")} UTC` : "not completed";
  return {
    connector: "github",
    citation: { id, kind: "github_check", title: `${repo.split("/")[1]} · ${run.name} on ${ref}`, url: run.html_url, status },
    text: `[${id}] Check "${run.name}" on ${repo} ${ref} (commit ${sha}) — ${status} · ${when}`,
    updatedAt: run.completed_at ?? run.started_at ?? null,
    mentions: [],
  };
}

export interface GithubWorkflowRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  created_at: string;
  head_branch: string | null;
  html_url: string;
}

export interface GithubJob {
  name: string;
  conclusion: string | null;
}

const RUNS_PAGE_SIZE = 100;

/** Workflow runs created on/after `sinceDate` (YYYY-MM-DD), all branches. */
export async function fetchWorkflowRuns(repo: string, sinceDate: string, deps: GithubDeps): Promise<GithubWorkflowRun[]> {
  const created = encodeURIComponent(`>=${sinceDate}`);
  const body = await getJson<{ workflow_runs: GithubWorkflowRun[] }>(`/repos/${repo}/actions/runs?per_page=${RUNS_PAGE_SIZE}&created=${created}`, deps);
  return body.workflow_runs;
}

/** Jobs of one run (job names match check names, e.g. "assistant-unit"). */
export async function fetchRunJobs(repo: string, runId: number, deps: GithubDeps): Promise<GithubJob[]> {
  const body = await getJson<{ jobs: GithubJob[] }>(`/repos/${repo}/actions/runs/${runId}/jobs?per_page=50`, deps);
  return body.jobs.map((job) => ({ name: job.name, conclusion: job.conclusion }));
}
