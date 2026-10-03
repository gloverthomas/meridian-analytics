/**
 * Human-readable progress steps for a question, derived from the same rules
 * the real request uses (no network). The UI shows them while it waits, so
 * the loading state says what's actually happening.
 */
import { isHelpQuestion } from "../shared/askCatalog.js";
import { detectTicketAction } from "./actions/linearTransition.js";
import type { Config } from "./config.js";
import { planRetrieval, type ChartKind } from "./retrieval/router.js";

const CHART_NAMES: Record<ChartKind, string> = {
  prs_per_day: "PRs merged per day",
  tickets_by_state: "tickets by status",
  opened_vs_closed: "opened vs closed",
  ci_history: "CI results over time",
  usage_trend: "product activity",
  bff_health: "BFF connection health",
  assistant_usage: "AI Assistant messages",
  insights_topics: "questions by topic",
  insights_daily: "questions per day",
  sentry_errors: "Sentry events per day",
  evals_daily: "evals passed vs failed per day",
  eval_checks: "most-failed eval checks",
};

function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items.at(-1)}`;
}

export function progressSteps(message: string, config: Config): string[] {
  if (isHelpQuestion(message)) return ["Listing what Insights can answer…"];
  const action = detectTicketAction(message);
  if (action) {
    return action.issueIds.length === 1
      ? [`Looking up ${action.issueIds[0]} in Linear…`, "Checking its current status…", "Preparing a confirmation…"]
      : ["Checking which tickets can be moved…", "Finding suggestions in Linear…"];
  }

  const plan = planRetrieval(message, config.github.repos);
  const grokStep = config.xai.apiKey ? "Asking Grok to write it up…" : "Putting the answer together…";
  const id = plan.issueIds[0];
  if (plan.intent === "how_it_works") {
    return [
      "Reading the docs and decision records across the four repos…",
      "Checking Linear docs and merged PRs for the reasoning…",
      "Ranking the most relevant sections…",
      config.xai.apiKey ? "Asking Grok to explain it…" : "Putting the answer together…",
    ];
  }
  if (plan.intent === "workflow_plan") {
    return [
      `Finding the latest Cursor plan run${id ? ` for ${id}` : ""} in liquid-workflow…`,
      "Reading the plan transcript and its eval checklist…",
      "Checking whether it's ready to approve…",
      config.xai.apiKey ? "Asking Grok to summarise the plan…" : "Putting the answer together…",
    ];
  }
  if (plan.intent === "evals") {
    return ["Reading eval reports from liquid-workflow…", "Building 2 charts: evals passed vs failed per day and most-failed eval checks…", grokStep];
  }
  if (plan.intent === "pipeline" && id) {
    return [`Reading ${id}'s history in Linear…`, "Checking Cursor runs, evals and approvals…", `Finding PRs that mention ${id}…`, "Drawing the pipeline…", grokStep];
  }
  if (plan.intent === "insights_usage") {
    return [
      "Reading the Insights question log from PostHog (topics only, no question text)…",
      "Building 2 charts: questions by topic and questions per day…",
      config.xai.apiKey ? "Asking Grok to write it up…" : "Putting the answer together…",
    ];
  }
  const sample = (configured: boolean) => (configured || !config.allowFixtures ? "" : " (sample data)");
  const steps: string[] = [];

  const linear = plan.issueIds.length ? `Reading ${list(plan.issueIds)} in Linear` : "Reading recent Linear tickets";
  steps.push(`${linear}${plan.charts.includes("opened_vs_closed") ? " and when they were opened and closed" : ""}${sample(Boolean(config.linear.apiKey))}…`);

  const github = ["merged PRs"];
  if (plan.issueIds.length) github.push(`PRs mentioning ${list(plan.issueIds)}`);
  if (plan.wantsChecks) github.push("CI checks");
  if (plan.charts.includes("ci_history")) github.push(`${plan.checkName ?? "CI"} run history`);
  steps.push(`Checking GitHub ${list(github)}${sample(Boolean(config.github.token))}…`);

  if (plan.wantsSentry && config.sentry.token) steps.push(`Checking Sentry for ${config.sentry.environment} errors in Core and Reporting…`);
  if (plan.wantsPosthog) steps.push(`Pulling product analytics from PostHog${sample(Boolean(config.posthog.apiKey && config.posthog.projectId))}…`);

  steps.push("Ranking the most relevant sources…");

  if (plan.charts.length) {
    const names = plan.charts.map((c) => CHART_NAMES[c]);
    steps.push(`Building ${plan.charts.length === 1 ? "a chart" : `${plan.charts.length} charts`}: ${list(names)}…`);
  }

  steps.push(config.xai.apiKey ? "Asking Grok to write it up…" : "Putting the answer together…");
  return steps;
}
