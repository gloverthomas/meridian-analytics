/**
 * Retrieval orchestration: plan → parallel connector fetch (live or sample) →
 * normalise → rank → pack into the Grok context budget.
 */
import type { ChartSpec, ConnectorId, ConnectorMode, RetrievalMeta } from "../../shared/contracts.js";
import type { Config } from "../config.js";
import { sampleCheckRuns, samplePulls, sampleWorkflowRuns } from "../fixtures/github.js";
import { sampleLinearActivity, sampleLinearIssues } from "../fixtures/linear.js";
import { errorCode, logEvent } from "../log.js";
import { CACHE_TTL_MS, retrievalCache, type TtlCache } from "./cache.js";
import {
  fetchCheckRuns,
  fetchRecentPulls,
  fetchRunJobs,
  fetchWorkflowRuns,
  latestPerCheck,
  mergedWithin,
  normalizeCheck,
  normalizePull,
  searchPullsMentioning,
  type GithubCheckRun,
  type GithubDeps,
  type GithubJob,
  type GithubPull,
  type GithubWorkflowRun,
} from "./github.js";
import { fetchLinearActivity, fetchLinearIssues, fetchLinearRecent, normalizeLinearIssue, type LinearActivityNode, type LinearDeps, type LinearIssueNode } from "./linear.js";
import { fetchSentryDaily, fetchSentryIssues, normalizeSentryIssue, sentryCounts, type SentryDay, type SentryIssue } from "./sentry.js";
import { fetchQuestionLog, normalizeQuestionLog, questionTopicsChart, questionsPerDayChart, type QuestionLog } from "./insightsUsage.js";
import { fetchPosthogActivity, normalizePosthogActivity, samplePosthogInsight, type PosthogRow } from "./posthog.js";
import { buildCharts, describeChart, type ChartInputs, type CiRunPoint } from "../charts.js";
import { CONTEXT_CHAR_BUDGET, dedupe, packContext, rankItems } from "./rank.js";
import type { RetrievalPlan } from "./router.js";
import type { ConnectorResult, FetchLike, RetrievedItem } from "./types.js";

interface LinearSource {
  issues(ids: string[]): Promise<LinearIssueNode[]>;
  recent(): Promise<LinearIssueNode[]>;
  activity(sinceIso: string): Promise<LinearActivityNode[]>;
}

interface GithubSource {
  pulls(repo: string): Promise<GithubPull[]>;
  search(ids: string[], repos: string[]): Promise<Array<{ repo: string; pull: GithubPull }>>;
  checks(repo: string, ref: string): Promise<GithubCheckRun[]>;
  runs(repo: string, sinceDate: string): Promise<GithubWorkflowRun[]>;
  jobs(repo: string, runId: number): Promise<GithubJob[]>;
}

const MAX_RUNS_WITH_JOBS = 25;

export interface RetrievalDeps {
  fetch: FetchLike;
  cache?: TtlCache;
  now?: () => number;
}

export interface RetrievalOutcome {
  results: ConnectorResult[];
  context: string;
  items: RetrievedItem[];
  meta: RetrievalMeta;
  charts: ChartSpec[];
}

function liveLinear(deps: LinearDeps, cache: TtlCache): LinearSource {
  const scope = deps.teamId ?? deps.teamKey;
  return {
    issues: (ids) => cache.getOrLoad(`linear:issues:${ids.join(",")}`, CACHE_TTL_MS.linearIssue, () => fetchLinearIssues(ids, deps)),
    recent: () => cache.getOrLoad(`linear:recent:${scope}`, CACHE_TTL_MS.linearList, () => fetchLinearRecent(deps)),
    activity: (sinceIso) => cache.getOrLoad(`linear:activity:${scope}:${sinceIso.slice(0, 10)}`, CACHE_TTL_MS.linearList, () => fetchLinearActivity(sinceIso, deps)),
  };
}

const sampleLinear: LinearSource = {
  issues: async (ids) => sampleLinearIssues().filter((issue) => ids.includes(issue.identifier)),
  recent: async () => sampleLinearIssues(),
  activity: async () => sampleLinearActivity(),
};

function liveGithub(deps: GithubDeps, cache: TtlCache): GithubSource {
  return {
    pulls: (repo) => cache.getOrLoad(`github:prs:${repo}`, CACHE_TTL_MS.githubPrs, () => fetchRecentPulls(repo, deps)),
    search: (ids, repos) =>
      cache.getOrLoad(`github:search:${ids.join(",")}:${repos.join(",")}`, CACHE_TTL_MS.githubSearch, () => searchPullsMentioning(ids, repos, deps)),
    checks: (repo, ref) => cache.getOrLoad(`github:checks:${repo}:${ref}`, CACHE_TTL_MS.githubChecks, () => fetchCheckRuns(repo, ref, deps)),
    runs: (repo, sinceDate) => cache.getOrLoad(`github:runs:${repo}:${sinceDate}`, CACHE_TTL_MS.githubChecks, () => fetchWorkflowRuns(repo, sinceDate, deps)),
    // A finished run's jobs never change, so cache them for the page's life.
    jobs: (repo, runId) => cache.getOrLoad(`github:jobs:${repo}:${runId}`, 24 * 3_600_000, () => fetchRunJobs(repo, runId, deps)),
  };
}

const sampleGithub: GithubSource = {
  pulls: async (repo) => samplePulls(repo),
  search: async (ids, repos) =>
    repos.flatMap((repo) => samplePulls(repo).filter((pull) => ids.some((id) => pull.title.includes(id))).map((pull) => ({ repo, pull }))),
  checks: async (repo) => sampleCheckRuns(repo),
  runs: async (repo) => sampleWorkflowRuns(repo),
  jobs: async (repo) => sampleCheckRuns(repo).map((run) => ({ name: run.name, conclusion: run.conclusion })),
};

/** Extra data only chart questions need; failures drop the chart, never the answer. */
async function collectChartInputs(
  plan: RetrievalPlan,
  modes: { linear: ConnectorMode; github: ConnectorMode },
  sources: { linear: LinearSource | null; github: GithubSource | null },
  nowMs: number,
): Promise<Pick<ChartInputs, "activity" | "runs">> {
  const since = (days: number) => new Date(nowMs - days * 86_400_000).toISOString();
  const out: Pick<ChartInputs, "activity" | "runs"> = {};
  const tasks: Array<Promise<void>> = [];

  if (plan.charts.includes("opened_vs_closed") && sources.linear && modes.linear !== "unavailable") {
    tasks.push(
      sources.linear.activity(since(Math.max(plan.sinceDays, 28))).then((a) => {
        out.activity = a;
      }),
    );
  }
  if (plan.charts.includes("ci_history") && sources.github && modes.github !== "unavailable") {
    const gh = sources.github;
    const sinceDate = since(plan.sinceDays).slice(0, 10);
    tasks.push(
      Promise.all(
        plan.repos.map(async (repo): Promise<CiRunPoint[]> => {
          const runs = (await gh.runs(repo, sinceDate)).filter((r) => r.status === "completed");
          if (!plan.checkName) return runs.map((r) => ({ repo, createdAt: r.created_at, conclusion: r.conclusion }));
          const recent = runs.slice(0, MAX_RUNS_WITH_JOBS);
          return Promise.all(
            recent.map(async (r) => {
              const job = (await gh.jobs(repo, r.id)).find((j) => j.name === plan.checkName);
              return { repo, createdAt: r.created_at, conclusion: r.conclusion, jobConclusion: job ? job.conclusion : null };
            }),
          );
        }),
      ).then((perRepo) => {
        out.runs = perRepo.flat();
      }),
    );
  }

  const settled = await Promise.allSettled(tasks);
  for (const result of settled) {
    if (result.status === "rejected") logEvent("chart_data_error", { error: errorCode(result.reason) });
  }
  return out;
}

async function collectLinear(source: LinearSource, plan: RetrievalPlan): Promise<RetrievedItem[]> {
  const [detail, recent] = await Promise.all([source.issues(plan.issueIds), source.recent()]);
  return [...detail, ...recent].map(normalizeLinearIssue);
}

async function collectGithub(source: GithubSource, plan: RetrievalPlan, branch: string, nowMs: number): Promise<RetrievedItem[]> {
  const merged = plan.repos.map(async (repo) => mergedWithin(await source.pulls(repo), plan.sinceDays, nowMs).map((pull) => normalizePull(repo, pull)));
  const mentioned = source
    .search(plan.issueIds, plan.repos)
    .then((hits) => hits.map(({ repo, pull }) => normalizePull(repo, pull)));
  const checks = plan.wantsChecks
    ? plan.repos.map(async (repo) => latestPerCheck(await source.checks(repo, branch)).map((run) => normalizeCheck(repo, branch, run)))
    : [];
  const groups = await Promise.all([...merged, mentioned, ...checks]);
  return groups.flat();
}

/** Tags each sample item inline so Grok can't blend it with live data. Keeps the leading [id]. */
function markSample(item: RetrievedItem): RetrievedItem {
  const idToken = `[${item.citation.id}]`;
  if (!item.text.startsWith(idToken) || item.text.includes("SAMPLE DATA")) return item;
  return { ...item, text: `${idToken} (SAMPLE DATA)${item.text.slice(idToken.length)}` };
}

function tally(values: string[]): string {
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(", ");
}

/**
 * Deterministic counts over every Linear issue retrieved (before the context
 * budget trims anything) — the model reads numbers here instead of counting.
 */
export function linearCounts(items: RetrievedItem[], sinceDays?: number, nowMs = Date.now()): string | null {
  const issues = dedupe(items.filter((item) => item.citation.kind === "linear_issue"));
  if (!issues.length) return null;
  const lines = [`COUNTS (computed by the server over the ${issues.length} most recently updated Linear issues; use these for any numbers):`];
  lines.push(`- All issues by state: ${tally(issues.map((i) => i.citation.status ?? "Unknown"))}`);
  const isClosed = (i: RetrievedItem) => /^(done|canceled|cancelled|duplicate)$/i.test(i.citation.status ?? "");
  const idList = (list: RetrievedItem[]) => list.map((i) => i.mentions[0]).join(", ") || "none";
  const open = issues.filter((i) => !isClosed(i));
  lines.push(`- Open now (not Done/Canceled): ${open.length} (${idList(open)})`);
  if (sinceDays) {
    const recent = issues.filter((i) => i.updatedAt && nowMs - Date.parse(i.updatedAt) <= sinceDays * 86_400_000);
    const resolved = recent.filter((i) => /^done$/i.test(i.citation.status ?? ""));
    lines.push(`- Moved to Done and last updated in the last ${sinceDays} days: ${resolved.length} (${idList(resolved)})`);
    const ids = recent.map((i) => i.mentions[0]).join(", ") || "none";
    lines.push(`- Updated in the last ${sinceDays} days: ${recent.length} (${recent.length ? tally(recent.map((i) => i.citation.status ?? "Unknown")) + "; " : ""}${ids})`);
  }
  const labels = [...new Set(issues.flatMap((i) => i.labels ?? []))].sort();
  for (const label of labels) {
    const tagged = issues.filter((i) => i.labels?.includes(label));
    lines.push(`- Label "${label}" by state: ${tally(tagged.map((i) => i.citation.status ?? "Unknown"))} (${tagged.map((i) => i.mentions[0]).join(", ")})`);
  }
  return lines.join("\n");
}

/** Merged/open PR totals per repo within the plan window, so Grok never counts PRs itself. */
export function githubCounts(items: RetrievedItem[], sinceDays: number, nowMs: number): string | null {
  const pulls = dedupe(items.filter((item) => item.citation.kind === "github_pr"));
  if (!pulls.length) return null;
  const cutoff = nowMs - sinceDays * 86_400_000;
  const byRepo = new Map<string, { merged: string[]; open: string[] }>();
  for (const pull of pulls) {
    const [repo, number] = pull.citation.id.replace(/^github:PR:/, "").split("#");
    const entry = byRepo.get(repo) ?? { merged: [], open: [] };
    if (pull.citation.status === "merged" && Date.parse(pull.updatedAt ?? "") >= cutoff) entry.merged.push(`#${number}`);
    if (pull.citation.status === "open") entry.open.push(`#${number}`);
    byRepo.set(repo, entry);
  }
  const lines = [...byRepo].map(
    ([repo, { merged, open }]) => `- ${repo}: merged in last ${sinceDays} days ${merged.length} (${merged.join(", ") || "none"}); open PRs retrieved ${open.length} (${open.join(", ") || "none"})`,
  );
  return [`PR COUNTS (computed by the server; use these for any PR numbers):`, ...lines].join("\n");
}

async function runConnector(
  connector: ConnectorId,
  live: (() => Promise<RetrievedItem[]>) | null,
  sample: (() => Promise<RetrievedItem[]>) | null,
  now: () => number,
): Promise<ConnectorResult> {
  const fetchedAt = new Date(now()).toISOString();
  if (live) {
    try {
      return { connector, mode: "live", fetchedAt, items: await live() };
    } catch (error) {
      // Configured-but-failing never silently falls back to sample data.
      logEvent("connector_error", { connectors: [connector], connector_error: errorCode(error) });
      return { connector, mode: "unavailable", fetchedAt, items: [] };
    }
  }
  if (sample) return { connector, mode: "sample", fetchedAt, items: (await sample()).map(markSample) };
  return { connector, mode: "unavailable", fetchedAt, items: [] };
}

/** "What have people been asking?" reads only the question log — Linear/GitHub would be noise. */
async function runInsightsUsage(plan: RetrievalPlan, config: Config, deps: RetrievalDeps, cache: TtlCache, now: () => number): Promise<RetrievalOutcome> {
  const ph = config.posthog;
  const days = plan.sinceDays;
  const fetchedAt = new Date(now()).toISOString();
  let log: QuestionLog | null = null;
  let mode: ConnectorMode = "unavailable";
  if (ph.apiKey && ph.projectId) {
    const phDeps = { apiKey: ph.apiKey, projectId: ph.projectId, host: ph.host, fetch: deps.fetch };
    try {
      log = await cache.getOrLoad(`posthog:questions:${ph.projectId}:${days}`, CACHE_TTL_MS.linearList, () => fetchQuestionLog(days, phDeps));
      mode = "live";
    } catch (error) {
      logEvent("connector_error", { connectors: ["posthog"], connector_error: errorCode(error) });
    }
  }
  const items = log && ph.projectId ? [normalizeQuestionLog(log, days, { host: ph.host, projectId: ph.projectId }, fetchedAt)] : [];
  const charts = log
    ? [questionTopicsChart(log, days), questionsPerDayChart(log, days, now(), config.timeZone)].filter((c): c is ChartSpec => c !== null)
    : [];
  const unavailable = mode === "unavailable" ? "INSIGHTS QUESTION LOG UNAVAILABLE: PostHog isn't configured or didn't respond, so usage of Insights can't be measured right now.\n" : "";
  return {
    results: [{ connector: "posthog", mode, fetchedAt, items }],
    context: `${unavailable}${charts.map(describeChart).join("\n")}${charts.length ? "\n\n" : ""}${items.map((i) => i.text).join("\n")}`,
    items,
    meta: { connectors: ["posthog"], connectorModes: { posthog: mode }, window: `last ${days} days`, truncated: false, itemCount: items.length },
    charts,
  };
}

export async function runRetrieval(plan: RetrievalPlan, config: Config, deps: RetrievalDeps): Promise<RetrievalOutcome> {
  if (plan.intent === "insights_usage") return runInsightsUsage(plan, config, deps, deps.cache ?? retrievalCache, deps.now ?? Date.now);
  const cache = deps.cache ?? retrievalCache;
  const now = deps.now ?? Date.now;
  const { linear, github, allowFixtures } = config;
  const depsFetch = deps.fetch;

  const linearLiveSource = linear.apiKey ? liveLinear({ apiKey: linear.apiKey, fetch: deps.fetch, teamId: linear.teamId, teamKey: linear.teamKey }, cache) : null;
  const githubLiveSource = github.token ? liveGithub({ token: github.token, fetch: deps.fetch }, cache) : null;
  const linearLive = linearLiveSource ? () => collectLinear(linearLiveSource, plan) : null;
  const githubLive = githubLiveSource ? () => collectGithub(githubLiveSource, plan, github.branch, now()) : null;

  const tasks: Array<Promise<ConnectorResult>> = [
    runConnector("linear", linearLive, allowFixtures ? () => collectLinear(sampleLinear, plan) : null, now),
    runConnector("github", githubLive, allowFixtures ? () => collectGithub(sampleGithub, plan, github.branch, now()) : null, now),
  ];
  // Sentry: production issues per app (+ daily counts when charted). Only when configured —
  // there's no sample Sentry data, and an unconfigured source shouldn't pad answers.
  let sentryIssues: SentryIssue[] | undefined;
  let sentryDaily: SentryDay[] | undefined;
  const sn = config.sentry;
  if (plan.wantsSentry && sn.token) {
    const snDeps = { token: sn.token, org: sn.org, host: sn.host, environment: sn.environment, fetch: depsFetch };
    tasks.push(
      runConnector(
        "sentry",
        async () => {
          const [issues, daily] = await Promise.all([
            cache.getOrLoad(`sentry:issues:${sn.org}:${sn.environment}:${plan.sinceDays}`, CACHE_TTL_MS.githubPrs, () => fetchSentryIssues(plan.sinceDays, snDeps)),
            plan.charts.includes("sentry_errors")
              ? cache.getOrLoad(`sentry:daily:${sn.org}:${sn.environment}:${plan.sinceDays}`, CACHE_TTL_MS.githubPrs, () => fetchSentryDaily(plan.sinceDays, snDeps))
              : Promise.resolve(undefined),
          ]);
          sentryIssues = issues;
          sentryDaily = daily;
          return issues.map((i) => normalizeSentryIssue(i, sn.environment));
        },
        null,
        now,
      ),
    );
  }

  // PostHog rows feed both the summary item and the usage/BFF charts.
  let posthogRows: PosthogRow[] | undefined;
  if (plan.wantsPosthog) {
    const nowIso = new Date(now()).toISOString();
    const ph = config.posthog;
    const days = plan.charts.length ? plan.sinceDays : Math.max(plan.sinceDays, 14);
    const posthogLive =
      ph.apiKey && ph.projectId
        ? async () => {
            const deps = { apiKey: ph.apiKey!, projectId: ph.projectId!, host: ph.host, fetch: depsFetch };
            posthogRows = await cache.getOrLoad(`posthog:activity:${ph.projectId}:${days}`, CACHE_TTL_MS.githubPrs, () => fetchPosthogActivity(days, deps));
            return [normalizePosthogActivity(posthogRows, days, deps, nowIso)];
          }
        : null;
    tasks.push(runConnector("posthog", posthogLive, allowFixtures ? async () => [samplePosthogInsight(nowIso)] : null, now));
  }

  const results = await Promise.all(tasks);
  const ranked = rankItems(
    results.flatMap((r) => r.items),
    plan,
    now(),
  );
  const allItems = results.flatMap((r) => r.items);
  const modeOf = (c: ConnectorId): ConnectorMode => results.find((r) => r.connector === c)?.mode ?? "unavailable";
  const modes = { linear: modeOf("linear"), github: modeOf("github") };
  let charts: ChartSpec[] = [];
  if (plan.charts.length) {
    const extra = await collectChartInputs(
      plan,
      modes,
      { linear: modes.linear === "live" ? linearLiveSource : sampleLinear, github: modes.github === "live" ? githubLiveSource : sampleGithub },
      now(),
    );
    const bugsOnly = plan.keywords.some((k) => /^bugs?$/.test(k));
    charts = buildCharts(plan, { items: allItems, ...extra, posthog: posthogRows, sentryDaily, sentryEnvironment: sn.environment, sample: { linear: modes.linear === "sample", github: modes.github === "sample" } }, now(), config.timeZone, bugsOnly);
  }
  const chartText = charts.map(describeChart).join("\n");
  const counts =
    [
      chartText,
      linearCounts(allItems, plan.sinceDays, now()),
      githubCounts(allItems, plan.sinceDays, now()),
      sentryIssues ? sentryCounts(sentryIssues, sentryDaily, plan.sinceDays, sn.environment) : null,
    ]
      .filter(Boolean)
      .join("\n\n") || null;
  const packed = packContext(ranked, CONTEXT_CHAR_BUDGET - (counts ? counts.length + 2 : 0));

  return {
    results,
    context: counts ? `${counts}\n\n${packed.context}` : packed.context,
    items: packed.included,
    meta: {
      connectors: results.map((r) => r.connector),
      connectorModes: Object.fromEntries(results.map((r) => [r.connector, r.mode])) as Partial<Record<ConnectorId, ConnectorMode>>,
      window: `last ${plan.sinceDays} days`,
      truncated: packed.truncated,
      itemCount: packed.included.length,
    },
    charts,
  };
}
