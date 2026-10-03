/**
 * "Approve & implement" for a Cursor plan. Proposal (read-only) → signed token →
 * on confirm: record the human approval with liquid-workflow, then move the
 * ticket to In Review, which the workflow's Linear webhook treats as "implement".
 * The workflow still enforces its own eval, CI and write gates.
 */
import type { ProposedAction } from "../../shared/contracts.js";
import type { Config } from "../config.js";
import type { InsightAnswer } from "../insights.js";
import { logEvent } from "../log.js";
import { approveImplement } from "../retrieval/workflow.js";
import type { FetchLike } from "../retrieval/types.js";
import { ActionError, answer, citationFor, fetchIssue, inTeam, moveIssue, WEB_CONFIRMATION } from "./linearTransition.js";
import { createActionToken, verifyActionToken } from "./token.js";

/** The state liquid-workflow's IMPLEMENT_STATES listens for. */
export const IMPLEMENT_STATE = "In Review";
const READY_STATES = new Set(["In Progress", "Todo"]);

interface Deps {
  fetch: FetchLike;
  now?: () => number;
  confirmedVia?: string;
}

function ready(config: Config): { writeKey: string; secret: string; workflowToken: string } | null {
  const { linearApiKey: writeKey, secret } = config.actions;
  const workflowToken = config.workflow.token;
  return writeKey && secret && workflowToken ? { writeKey, secret, workflowToken } : null;
}

/** Returns a confirmable proposal, or null when it doesn't apply (not configured, wrong state, other team). */
export async function proposeImplement(issueId: string, config: Config, deps: Deps): Promise<ProposedAction | null> {
  const keys = ready(config);
  const readKey = config.linear.apiKey ?? keys?.writeKey;
  if (!keys || !readKey) return null;
  const issue = await fetchIssue(issueId, readKey, deps.fetch);
  if (!issue || !inTeam(issue, config) || !READY_STATES.has(issue.state.name)) return null;
  const { token, expiresAt } = createActionToken({ issueId, toState: IMPLEMENT_STATE, action: "workflow_implement" }, keys.secret, (deps.now ?? Date.now)());
  return {
    kind: "workflow_implement",
    issueId,
    issueTitle: issue.title,
    url: issue.url,
    fromState: issue.state.name,
    toState: IMPLEMENT_STATE,
    token,
    expiresAt,
  };
}

export async function executeImplement(token: unknown, config: Config, deps: Deps): Promise<InsightAnswer> {
  const keys = ready(config);
  if (!keys) throw new ActionError(503, "actions_not_configured");
  const check = verifyActionToken(token, keys.secret, (deps.now ?? Date.now)());
  if (!check.ok) throw new ActionError(check.reason === "expired" ? 410 : 400, check.reason === "expired" ? "confirmation_expired" : "invalid_confirmation");
  if (check.claim.action !== "workflow_implement" || check.claim.toState !== IMPLEMENT_STATE) throw new ActionError(400, "invalid_confirmation");
  const { issueId } = check.claim;

  const issue = await fetchIssue(issueId, keys.writeKey, deps.fetch);
  if (!issue) throw new ActionError(404, "issue_not_found");
  if (!inTeam(issue, config)) throw new ActionError(403, "issue_outside_team");
  if (issue.state.name === IMPLEMENT_STATE) {
    return answer(`**${issueId} is already In Review**, so implementation was already requested. [linear:${issueId}]`, [citationFor(issue)], [`Where is ${issueId} in the pipeline?`]);
  }

  // 1) Human approval, recorded by the workflow's write-gate (actor: liquid-insights).
  const approval = await approveImplement(issueId, `Approved ${deps.confirmedVia ?? WEB_CONFIRMATION}.`, {
    baseUrl: config.workflow.baseUrl,
    token: keys.workflowToken,
    fetch: deps.fetch,
  }).catch((error: unknown) => {
    throw new ActionError(502, error instanceof Error && /_(401|403)$/.test(error.message) ? "workflow_auth_failed" : "workflow_unavailable");
  });

  // 2) In Review → the workflow's Linear webhook starts the implement run.
  const fromState = issue.state.name;
  await moveIssue(issue, IMPLEMENT_STATE, keys.writeKey, deps.fetch, `Cursor plan **approved** and moved from **${fromState}** to **${IMPLEMENT_STATE}** ${deps.confirmedVia ?? WEB_CONFIRMATION}. The workflow will start implementation after its eval and CI gates.`);
  logEvent("workflow_implement_requested", { status: `${issueId}:${fromState}->${IMPLEMENT_STATE}` });

  return answer(
    `**Approved the Cursor plan for ${issueId} and moved it to In Review.** [linear:${issueId}]\n- **Approval:** recorded with the workflow${approval.expiresAt ? ` (valid until ${approval.expiresAt.slice(0, 16).replace("T", " ")} UTC)` : ""}.\n- **Next:** the workflow starts the implement run after its eval and CI gates; PRs still need a human to merge.\n- **Audit:** a comment recording this was added to the ticket.`,
    [citationFor(issue, IMPLEMENT_STATE)],
    [`Where is ${issueId} in the pipeline?`, "How are our evals tracking?", `What's the Cursor plan for ${issueId}?`],
  );
}
