/** Rank retrieved items against the plan, then pack them into a hard character budget. */
import type { Citation } from "../../shared/contracts.js";
import type { Intent, RetrievalPlan } from "./router.js";
import type { RetrievedItem } from "./types.js";

export const CONTEXT_CHAR_BUDGET = 12_000;
const MAX_ITEMS = 25;
const MIN_PARTIAL_CHARS = 200;
const RECENCY_HORIZON_DAYS = 30;

type Kind = Citation["kind"];

const INTENT_BOOST: Record<Intent, Partial<Record<Kind, number>>> = {
  issue_status: { linear_issue: 10, github_pr: 8 },
  ci_health: { github_check: 40 },
  merged_prs: { github_pr: 40 },
  linear_overview: { linear_issue: 40 },
  trend: { posthog_insight: 40, github_pr: 15, linear_issue: 10 },
  problems: { linear_issue: 20, github_check: 10, github_pr: 5, sentry_issue: 25 },
  insights_usage: { posthog_insight: 40 },
  workflow_plan: { workflow_run: 60, linear_issue: 10 },
  evals: { workflow_run: 40 },
  pipeline: { workflow_run: 30, linear_issue: 30, github_pr: 20 },
  how_it_works: { doc: 40, github_pr: 5 },
  general: {},
};

const FAILED_CHECK = new Set(["failure", "cancelled", "timed_out", "action_required", "startup_failure"]);
const FIX_TITLE = /\b(fix|fixes|fixed|hotfix|revert|regression|broken|bug)\b/i;

/** For "what went wrong" questions: bugs, failed checks and fix PRs inside the window rise; stale items sink. */
function problemSignal(item: RetrievedItem, plan: RetrievalPlan, nowMs: number): number {
  let signal = 0;
  if (item.labels?.some((l) => /bug|incident|regression/i.test(l))) signal += 25;
  if (item.citation.kind === "github_check" && FAILED_CHECK.has(item.citation.status ?? "")) signal += 50;
  if (item.citation.kind === "github_pr" && FIX_TITLE.test(item.citation.title)) signal += 15;
  if (item.citation.kind === "sentry_issue") signal += item.citation.status === "error" ? 45 : 30;
  const inWindow = item.updatedAt ? nowMs - Date.parse(item.updatedAt) <= plan.sinceDays * 86_400_000 : false;
  return inWindow ? signal : signal - 25;
}

function score(item: RetrievedItem, plan: RetrievalPlan, nowMs: number): number {
  let total = 0;
  if (item.mentions.some((id) => plan.issueIds.includes(id))) total += 100;
  total += INTENT_BOOST[plan.intent][item.citation.kind] ?? 0;
  if (plan.intent === "merged_prs" && item.citation.status !== "merged") total -= 20;

  if (plan.intent === "problems") total += problemSignal(item, plan, nowMs);

  if (plan.linearStates.length && item.citation.kind === "linear_issue") {
    total += plan.linearStates.includes(item.citation.status ?? "") ? 30 : -30;
  }

  const haystack = item.text.toLowerCase();
  const keywordHits = plan.keywords.filter((kw) => haystack.includes(kw)).length;
  total += Math.min(keywordHits * 4, 20);

  if (item.updatedAt) {
    const ageDays = (nowMs - Date.parse(item.updatedAt)) / 86_400_000;
    total += 10 * Math.max(0, 1 - ageDays / RECENCY_HORIZON_DAYS);
  }
  return total;
}

export function dedupe(items: RetrievedItem[]): RetrievedItem[] {
  const byId = new Map<string, RetrievedItem>();
  for (const item of items) {
    const existing = byId.get(item.citation.id);
    // Prefer the richer (longer) version, e.g. issue detail over list summary.
    if (!existing || item.text.length > existing.text.length) byId.set(item.citation.id, item);
  }
  return [...byId.values()];
}

export function rankItems(items: RetrievedItem[], plan: RetrievalPlan, nowMs = Date.now()): RetrievedItem[] {
  return dedupe(items)
    .map((item) => ({ item, score: score(item, plan, nowMs) }))
    .sort((a, b) => b.score - a.score || (Date.parse(b.item.updatedAt ?? "") || 0) - (Date.parse(a.item.updatedAt ?? "") || 0))
    .map(({ item }) => item);
}

export interface PackedContext {
  context: string;
  included: RetrievedItem[];
  truncated: boolean;
}

/** Greedy pack in rank order. Partial items keep their leading `[id]` so citations survive. */
export function packContext(ranked: RetrievedItem[], budget = CONTEXT_CHAR_BUDGET): PackedContext {
  const blocks: string[] = [];
  const included: RetrievedItem[] = [];
  let used = 0;
  let truncated = ranked.length > MAX_ITEMS;

  for (const item of ranked.slice(0, MAX_ITEMS)) {
    const cost = item.text.length + 1;
    const remaining = budget - used;
    if (cost <= remaining) {
      blocks.push(item.text);
      included.push(item);
      used += cost;
      continue;
    }
    truncated = true;
    if (remaining >= MIN_PARTIAL_CHARS) {
      const partial = `${item.text.slice(0, remaining - 2)}…`;
      blocks.push(partial);
      included.push(item);
      used += partial.length + 1;
    }
    break;
  }
  return { context: blocks.join("\n"), included, truncated };
}
