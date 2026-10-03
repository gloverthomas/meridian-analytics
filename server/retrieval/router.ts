/**
 * Rules-only intent routing (no extra LLM call): question → which connectors to
 * hit, for which repos, over what window.
 */
import { normalizeIssueIds } from "../issueAliases.js";

export type Intent = "how_it_works" | "workflow_plan" | "evals" | "pipeline" | "insights_usage" | "issue_status" | "ci_health" | "trend" | "problems" | "merged_prs" | "linear_overview" | "general";

/** Server-computed charts a question can ask for. */
export type ChartKind = "prs_per_day" | "tickets_by_state" | "opened_vs_closed" | "ci_history" | "usage_trend" | "bff_health" | "assistant_usage" | "insights_topics" | "insights_daily" | "sentry_errors" | "evals_daily" | "eval_checks";

/** "overview" = narrative summary + key items; "direct" = short answer to a specific question. */
export type AnswerStyle = "overview" | "direct" | "plan" | "pipeline" | "explain";

export interface RetrievalPlan {
  intent: Intent;
  issueIds: string[];
  linearStates: string[];
  repos: string[];
  sinceDays: number;
  wantsChecks: boolean;
  wantsPosthog: boolean;
  /** Production errors from Sentry: asked for directly, or part of a "what went wrong" question. */
  wantsSentry: boolean;
  keywords: string[];
  style: AnswerStyle;
  charts: ChartKind[];
  /** A specific check the question names (e.g. "assistant-unit"), for CI history charts. */
  checkName: string | null;
}

const DEFAULT_WINDOW_DAYS = 14;
const MAX_WINDOW_DAYS = 30;
const MAX_ISSUE_IDS = 5;
const MAX_KEYWORDS = 8;

const ISSUE_ID = /\b([A-Z][A-Z0-9]{1,5}-\d{1,6})\b/gi;
const CI_WORDS = /\b(ci|checks?|builds?|passing|green|assistant-unit|smoke|parity-proof|help-proof|pipelines?|github actions)\b/i;
/** "What issues have we had?" means problems (bugs, failures, regressions), not "list tickets". */
const PROBLEM_WORDS = /\b(issues|problems?|bugs|defects?|incidents?|broken|breaking|regressions?|errors?|failures?|failing|went wrong|go wrong|blockers?|risks?|hotfix(es)?)\b/i;
const OVERVIEW_WORDS = /\b(overview|summary|summari[sz]e|recap|what happened|what's happened|what has happened|what's been happening|going on|this week|this month|lately|recently|update me|catch me up)\b/i;
const TREND_WORDS = /\b(trends?|trending|increasing|decreasing|over time|per week|week over week|rate|velocity)\b/i;
const MERGE_WORDS = /\b(merged?|shipped|pull requests?|prs?|delivery|released|landed)\b/i;
const LINEAR_WORDS = /\b(tickets?|bugs?|issues?|todo|backlog|in progress|in review|done|blocked|blocking|linear|defects?|status)\b/i;

/** Questions about Meridian Insights itself: "what have people been asking?", "how is the team using Insights?". */
const META_USAGE = [
  /\b(people|users?|team|everyone|anyone|folks|viewers?)\b[^.?]*\bask(ed|ing|s)?\b/i,
  /\b(questions?|queries)\b[^.?]*\b(asked|asking|people|users?|team|everyone|popular|common)\b/i,
  /\bmost (common|popular|frequent|asked)\b[^.?]*\b(questions?|queries|topics?)\b/i,
  /\b(using|use|usage of|used)\b[^.?]*\b(insights|this (tool|bot|app|chat))\b/i,
  /\b(insights|this (tool|bot|app|chat))\b[^.?]*\b(usage|used|adoption)\b/i,
];
/** Cursor SDK workflow questions (liquid-workflow) — live plan/eval for a ticket, not handbook "why plan vs signal". */
const WORKFLOW_PLAN = [
  /\bplan(s|ned)?\b[^.?]*\b(for|to fix)\b[^.?]*\b[A-Z][A-Z0-9]{1,5}-\d{1,6}\b/i,
  /\bwhat (does|will|would|is) (cursor|the agent)\b[^.?]*\b(plan|propose|fix|change|do)\b/i,
  /\b(cursor|agent|sdk|workflow)\b[^.?]*\bplan(s|ned|ning)?\b[^.?]*\b(for|to fix|LIQ-\d+)\b/i,
];
const EVAL_WORDS = /\b(evals?|evaluations?|eval (gate|harness|checks?|pass rate)|write[- ]gate|gates?)\b/i;
/** Onboarding / "how does it work / why did we" questions, answered from docs and decision records. */
const EXPLAIN = [
  /\bhow (does|do|should|would|is|are|can) (?!.*\b(tracking|going|doing)\b)[\w\s'./-]{2,80}?\b(work|works|working|set ?up|configured|secured|protected|verified|authenticated|handled|deployed|hosted|built|triggered|approved|gated|run|runs|fit together|connect|stored|start|relate)\b/i,
  /\bwhy (did|do|does|is|are|was|were|have|has|don'?t|doesn'?t|can'?t|isn'?t|not|should|can)\b/i,
  /\bwhy not\b/i,
  /\b(is|are) (the |our )?(eval harness|eval gate|deterministic eval|write[- ]gate|human write gate)\b/i,
  /\b(is|are) (the |our )?(eval harness|eval gate)\b[^.?]*\b(mcp|llm)\b/i,
  /\b(does|do|can)\b[^.?]{0,120}\b(signal|\/signal)\b[^.?]{0,120}\b(plan|implement|sdk|agent)\b/i,
  /\b(cursor skill|skills instead|liquid-workflow vs|sdk vs|grok vs|two repo|shared bff|mcp)\b/i,
  /\b(explain|walk me through|onboard(ing)?|i'?m new|new (here|to the team|to this)|where (do|should) i start|getting started|decision records?|adrs?|design decisions?|architecture|security model|threat model|write policy|kill switch(es)?)\b/i,
  /\bwhat('s| is| are) (our|the) (approach|policy|process|rationale|reasoning|security|design|guardrails?)\b/i,
  /\b(which|what) file\b/i,
  /\bwhere (does|do|is)\b[^.?]{0,80}\b(live|lives|file|code|function|handler|run|start)\b/i,
  /\b(new chat|product signal|bugbot|feature map|autocreatepr|write[- ]gate|specialist reviewers?|composer-2\.5|files sidebar)\b/i,
  /\b(who (merges|is allowed to merge|writes code)|what opens the pr|what starts the plan|what does bugbot do|which models)\b/i,
  /\b(grok or the sdk|grok versus|cursor sdk start|credentials live|kill switches)\b/i,
  /\bkick(?:s|ed|ing)?[- ]?off\b/i,
  /\bhow (is|does|do)\b[^.?]{0,120}\b(signal|\/signal)\b/i,
  /\bfacilitat/i,
  /\b(cursor )?sdk\b[^.?]{0,80}\b(workflow|facilitat)\b/i,
  /\bagent\.create\b/i,
  /\b(own|personal|their) (cursor )?(api )?key\b/i,
  /\bcursor (api )?key\b/i,
  /\benterprise\b/i,
  /\bwalk\b[^.?]{0,100}\b(path|signal|sdk|workflow|kickoff|kick[- ]off)\b/i,
  /\bsignal[- ]to[- ]sdk\b/i,
  /\b(path|signal|sdk|workflow)\b[^.?]{0,40}\bin full\b/i,
];
const NOT_EXPLAIN = /\bhow (many|often|much)\b|\btracking\b|\bthis week\b|\blast \d+ (days?|weeks?)\b/i;
/** A picture of a mechanism. Quantitative "per day" asks stay on the chart path. */
const QUANT_VIZ = /\b(per day|per week|how many|how much|breakdown|over time)\b/i;
const DIAGRAM_REQUEST =
  /\b(diagram|flowchart|flow-?chart)\b|\b(visuali[sz]e|draw|sketch)\b[^.?]{0,60}\b(flow|path|sequence|diagram|this|it|that)\b|\b(show|draw)\b[^.?]{0,40}\b(flow|diagram)\b/i;

export function isDiagramRequest(message: string): boolean {
  return DIAGRAM_REQUEST.test(message) && !QUANT_VIZ.test(message);
}

/** A follow-up like "visualise this" should retrieve the previous question's docs. */
export function questionForRetrieval(message: string, history: Array<{ role: string; content: string }>): string {
  const asked = normalizeQuestion(message);
  if (!isDiagramRequest(asked)) return asked;
  const prior = [...history].reverse().find((turn) => turn.role === "user" && turn.content.trim());
  if (!prior) return asked;
  const earlier = normalizeQuestion(prior.content);
  if (earlier.toLowerCase() === asked.toLowerCase()) return asked;
  return `${earlier}\n${asked}`;
}

const PIPELINE_WORDS = /\b(pipeline|timeline|journey|where is|how far (along|through)|progress of|stage|lifecycle)\b/i;

export const isInsightsUsageQuestion = (message: string) => META_USAGE.some((re) => re.test(message));

const SENTRY_WORDS = /\b(sentry|errors?|exceptions?|crash(es|ed|ing)?|erroring|breaking for users|user-facing|js errors?)\b/i;

const CHART_WORDS = /\b(charts?|graphs?|plot|visuali[sz]e|per day|per week|daily|weekly|over time|trends?|breakdown|by (status|state)|history|how often|each day|each week)\b/i;
const TICKET_NOUNS = /\b(tickets?|bugs?|issues?|defects?)\b/i;
const OPEN_CLOSE = /\b(open(ed|ing)?|creat(ed|ing)|new|clos(e|ed|ing)|resolv(e|ed|ing)|fix(ed|ing)?)\b/i;
const COMPARE = /\b(vs\.?|versus|than|faster|slower|rate|keeping up|outpac\w*|backlog growing)\b/i;
const CI_HISTORY = /\b(how often|fail(ed|s|ures?)?|pass rate|flaky|history|over time|trends?|per day|daily|this week|last \d+ (days?|weeks?))\b/i;
const PRODUCT_WORDS = /\b(usage|adoption|users?|traffic|page ?views?|visits?|engagement|posthog|product analytics|navigation|active|activity in the apps?|using the (product|apps?|ai assistant|assistant)|being used)\b/i;
const BFF_WORDS = /\b(bff|connect(ed|ion|ivity)?|disconnect(ed|s)?|offline|outage|backend status)\b/i;
const GOING = /\b(going up|going down|growing|dropping|increas\w*|decreas\w*|up or down|chang(e|ed|ing))\b/i;
/** CI named outright (not just "checks", which BFF questions also use). */
const EXPLICIT_CI = /\b(ci|builds?|assistant-unit|smoke|parity-proof|help-proof|pipelines?|github actions|workflow runs?)\b/i;
const CHECK_NAMES = ["assistant-unit", "parity-proof", "help-proof", "smoke", "build"];

function pickCharts(message: string, intent: Intent, linearStates: string[]): ChartKind[] {
  if (intent === "insights_usage") return ["insights_topics", "insights_daily"];
  if (intent === "evals") return ["evals_daily", "eval_checks"];
  if (intent === "workflow_plan" || intent === "pipeline") return [];
  const charts: ChartKind[] = [];
  const wantsChart = CHART_WORDS.test(message);
  if (MERGE_WORDS.test(message) && (wantsChart || /\bhow many\b/i.test(message))) charts.push("prs_per_day");
  if (TICKET_NOUNS.test(message) && (linearStates.length >= 2 || /\bby (status|state)\b|breakdown/i.test(message) || (wantsChart && intent === "linear_overview"))) {
    charts.push("tickets_by_state");
  }
  if (TICKET_NOUNS.test(message) && OPEN_CLOSE.test(message) && COMPARE.test(message)) charts.push("opened_vs_closed");
  const bffQuestion = BFF_WORDS.test(message);
  if ((intent === "ci_health" || CI_WORDS.test(message)) && CI_HISTORY.test(message) && (!bffQuestion || EXPLICIT_CI.test(message))) charts.push("ci_history");
  const usageAsk = PRODUCT_WORDS.test(message) && (wantsChart || GOING.test(message) || intent === "trend");
  // "AI Assistant usage" gets the assistant chart; other usage questions get general product activity.
  if (usageAsk) charts.push(/\b(ai )?assistant\b/i.test(message) ? "assistant_usage" : "usage_trend");
  if (SENTRY_WORDS.test(message) && (wantsChart || GOING.test(message) || /\b(more than|vs\.?|versus|compare|each app)\b/i.test(message))) charts.push("sentry_errors");
  if (BFF_WORDS.test(message) && (wantsChart || GOING.test(message) || /\bhow often|errors?|failing\b/i.test(message))) charts.push("bff_health");
  return charts;
}

const STATE_WORDS: Array<[RegExp, string]> = [
  [/\btodo\b/i, "Todo"],
  [/\bbacklog\b/i, "Backlog"],
  [/\bin progress\b/i, "In Progress"],
  [/\bin review\b/i, "In Review"],
  [/\bdone\b/i, "Done"],
];

const STOPWORDS = new Set(
  "a an and any are as at be been being by can could did do does for from had has have how i in is it its last me my of on or our show tell that the their them there these this those to was we were what whats when where which who why will with week weeks days day month about going there's what's issue issues problem problems code codebase base overview summary recently lately".split(
    " ",
  ),
);

function windowDays(lower: string): number {
  const explicit = lower.match(/\b(?:last|past)\s+(\d{1,3})\s+days?\b/);
  if (explicit) return Math.min(Math.max(Number(explicit[1]), 1), MAX_WINDOW_DAYS);
  const weeks = lower.match(/\b(?:last|past)\s+(\d{1,2}|two|three|four)\s+weeks?\b/);
  if (weeks) {
    const n = { two: 2, three: 3, four: 4 }[weeks[1] as "two"] ?? Number(weeks[1]);
    return Math.min(Math.max(n * 7, 1), MAX_WINDOW_DAYS);
  }
  if (/\b(this|last|past) week\b/.test(lower)) return 7;
  if (/\b(this|last|past) month\b/.test(lower)) return MAX_WINDOW_DAYS;
  if (/\b(today|yesterday)\b/.test(lower)) return 2;
  return DEFAULT_WINDOW_DAYS;
}

function pickRepos(lower: string, configured: string[]): string[] {
  const named = configured.filter((repo) => {
    const suffix = repo.split("/")[1]?.split("-").pop() ?? "";
    return suffix.length > 2 && new RegExp(`\\b${suffix}\\b`, "i").test(lower);
  });
  return named.length ? named : configured;
}

function extractKeywords(lower: string): string[] {
  const words = lower
    .replace(ISSUE_ID, " ")
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
  return [...new Set(words)].slice(0, MAX_KEYWORDS);
}

function classify(message: string, hasIssueIds: boolean, namesStates: boolean): Intent {
  if (isInsightsUsageQuestion(message)) return "insights_usage";
  // Before the workflow intents: "how does the eval gate work?" is about the design, not today's numbers.
  if (!hasIssueIds && !NOT_EXPLAIN.test(message) && (isDiagramRequest(message) || EXPLAIN.some((re) => re.test(message)))) return "how_it_works";
  if (WORKFLOW_PLAN.some((re) => re.test(message))) return "workflow_plan";
  if (EVAL_WORDS.test(message)) return "evals";
  if (hasIssueIds && PIPELINE_WORDS.test(message)) return "pipeline";
  if (hasIssueIds) return "issue_status";
  if (TREND_WORDS.test(message)) return "trend";
  if (CI_WORDS.test(message)) return "ci_health";
  // "bugs in Todo vs Done" is a status question, even though it says "bugs".
  if (namesStates) return "linear_overview";
  if (PROBLEM_WORDS.test(message)) return "problems";
  if (MERGE_WORDS.test(message)) return "merged_prs";
  if (LINEAR_WORDS.test(message)) return "linear_overview";
  return "general";
}

/** Live questions often misspell the two product names. Retrieval should still hit the handbook. */
export function normalizeQuestion(message: string): string {
  return message
    .replace(/\bsginal\b/gi, "signal")
    .replace(/\bgroq\b/gi, "Grok")
    .replace(/\bsignal[- ]to[- ]sdk\b/gi, "signal to SDK");
}

export function planRetrieval(message: string, configuredRepos: string[]): RetrievalPlan {
  const asked = normalizeQuestion(message);
  const lower = asked.toLowerCase();
  const issueIds = normalizeIssueIds([...asked.matchAll(ISSUE_ID)].map((m) => m[1].toUpperCase())).slice(0, MAX_ISSUE_IDS);
  const linearStates = STATE_WORDS.filter(([pattern]) => pattern.test(lower)).map(([, state]) => state);
  const intent = classify(asked, issueIds.length > 0, linearStates.length > 0);

  return {
    intent,
    issueIds,
    linearStates,
    repos: pickRepos(lower, configuredRepos),
    sinceDays: windowDays(lower),
    wantsChecks: intent === "ci_health" || intent === "problems" || intent === "general" || CI_WORDS.test(message),
    wantsSentry: intent === "problems" || SENTRY_WORDS.test(message),
    wantsPosthog: intent === "insights_usage" || intent === "trend" || PRODUCT_WORDS.test(message) || BFF_WORDS.test(message),
    keywords: extractKeywords(lower),
    style:
      intent === "how_it_works"
        ? "explain"
        : intent === "workflow_plan"
        ? "plan"
        : intent === "pipeline"
          ? "pipeline"
          : ["problems", "trend", "general", "insights_usage", "evals"].includes(intent) || OVERVIEW_WORDS.test(message)
            ? "overview"
            : "direct",
    charts: pickCharts(message, intent, linearStates),
    checkName: CHECK_NAMES.find((name) => new RegExp(`\\b${name}\\b`, "i").test(message)) ?? null,
  };
}
