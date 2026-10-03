/**
 * Confirmed Linear state changes ("Move KAN-18 to In Progress").
 *
 * Two steps, never one: `proposeTransition` only reads and returns a signed
 * token; `executeTransition` writes, and only for a valid token, re-checking
 * the ticket's team and current state first. Detection is rule-based — Grok
 * never decides to act.
 */
import type { Citation, ProposedAction, RetrievalMeta } from "../../shared/contracts.js";
import type { Config } from "../config.js";
import type { InsightAnswer } from "../insights.js";
import { errorCode, logEvent } from "../log.js";
import { graphql } from "../retrieval/linear.js";
import type { FetchLike } from "../retrieval/types.js";
import { normalizeIssueIds } from "../issueAliases.js";
import { createActionToken, verifyActionToken } from "./token.js";

const ISSUE_ID = /\b([A-Z][A-Z0-9]{1,5}-\d{1,6})\b/gi;
const MOVE_VERB = /\b(move|set|put|start|shift|transition|change|mark|bump|kick off)\b/i;
const STATES: Array<[RegExp, string]> = [
  [/\bin[\s-]?progress\b/i, "In Progress"],
  [/\bin[\s-]?review\b/i, "In Review"],
  [/\bto[\s-]?do\b/i, "Todo"],
  [/\bbacklog\b/i, "Backlog"],
  [/\bdone\b/i, "Done"],
  [/\bcancell?ed\b/i, "Canceled"],
];
const MAX_SUGGESTIONS = 3;
const ISSUE_FIELDS = "id identifier title url team { id key } state { name type }";

export interface TicketActionIntent {
  issueIds: string[];
  /** Requested state; null when the verb alone didn't say (e.g. "move KAN-18"). */
  targetState: string | null;
}

export interface IssueNode {
  id: string;
  identifier: string;
  title: string;
  url: string;
  team: { id: string; key: string };
  state: { name: string; type?: string };
}

export interface ActionDeps {
  fetch: FetchLike;
  now?: () => number;
  /** Who/where confirmed, for the audit comment. Defaults to the web app. */
  confirmedVia?: string;
}

export const WEB_CONFIRMATION = "from Meridian Insights (confirmed in the app)";

/** Rule-based: a move verb plus a ticket id or a state name. */
export function detectTicketAction(message: string): TicketActionIntent | null {
  if (!MOVE_VERB.test(message)) return null;
  const issueIds = normalizeIssueIds([...message.matchAll(ISSUE_ID)].map((m) => m[1].toUpperCase()));
  // "to in progress" should win over e.g. "tickets in Todo" earlier in the sentence.
  const toMatch = message.match(/\bto\s+(in[\s-]?progress|in[\s-]?review|to[\s-]?do|backlog|done|cancell?ed)\b/i);
  const phrase = toMatch?.[1] ?? message;
  const mentioned = STATES.find(([pattern]) => pattern.test(phrase))?.[1] ?? null;
  // "Start KAN-18" implies In Progress; a bare "start" ("where do I start?") is not a request to move anything.
  const targetState = mentioned ?? (issueIds.length && /\b(start|kick off)\b/i.test(message) ? "In Progress" : null);
  if (!issueIds.length && !targetState) return null;
  return { issueIds, targetState };
}

const meta = (itemCount: number): RetrievalMeta => ({
  connectors: ["linear"],
  connectorModes: { linear: "live" },
  window: "current state",
  truncated: false,
  itemCount,
});

export const citationFor = (issue: IssueNode, status = issue.state.name): Citation => ({
  id: `linear:${issue.identifier}`,
  kind: "linear_issue",
  title: `${issue.identifier} ${issue.title}`.slice(0, 120),
  url: issue.url,
  status,
});

export function answer(reply: string, citations: Citation[], relatedQuestions: string[], proposedAction?: ProposedAction): InsightAnswer {
  return { reply, citations, relatedQuestions, provider: "action", retrievalMeta: meta(citations.length), ...(proposedAction ? { proposedAction } : {}) };
}

export function inTeam(issue: IssueNode, config: Config): boolean {
  return config.linear.teamId ? issue.team.id === config.linear.teamId : issue.team.key.toUpperCase() === config.linear.teamKey.toUpperCase();
}

export async function fetchIssue(identifier: string, apiKey: string, fetch: FetchLike): Promise<IssueNode | null> {
  const { data, errors } = await graphql<{ issue: IssueNode | null }>({ apiKey, fetch }, `query Issue($id: String!) { issue(id: $id) { ${ISSUE_FIELDS} } }`, { id: identifier });
  if (!data && errors.length && !JSON.stringify(errors).toLowerCase().includes("not found")) throw new Error("linear_graphql_error");
  return data?.issue ?? null;
}

async function suggestTickets(config: Config, apiKey: string, fetch: FetchLike, target: string): Promise<string[]> {
  const filter = config.linear.teamId ? { team: { id: { eq: config.linear.teamId } } } : { team: { key: { eq: config.linear.teamKey } } };
  const { data } = await graphql<{ issues: { nodes: IssueNode[] } }>(
    { apiKey, fetch },
    `query Candidates($filter: IssueFilter) { issues(filter: $filter, first: 50, orderBy: updatedAt) { nodes { ${ISSUE_FIELDS} } } }`,
    { filter: { ...filter, state: { type: { in: ["unstarted", "backlog"] } } } },
  );
  return (data?.issues.nodes ?? []).slice(0, MAX_SUGGESTIONS).map((issue) => `Move ${issue.identifier} to ${target}`);
}

export async function proposeTransition(intent: TicketActionIntent, config: Config, deps: ActionDeps): Promise<InsightAnswer> {
  const writeKey = config.actions.linearApiKey;
  const secret = config.actions.secret;
  const allowed = config.actions.allowedStates;
  const readKey = config.linear.apiKey ?? writeKey;

  if (!writeKey || !secret) {
    return answer(
      "**Moving tickets isn't switched on for this deployment yet.** An admin needs to add a Linear API key with write access (`LINEAR_ACTIONS_API_KEY`). Until then I can only read Linear.",
      [],
      ["Which tickets are in Todo?", "What's the status of KAN-5?", "Which tickets are still in progress?"],
    );
  }

  const target = intent.targetState && allowed.includes(intent.targetState) ? intent.targetState : null;
  if (!target) {
    const asked = intent.targetState ? ` to ${intent.targetState}` : "";
    return answer(
      `**I can't move tickets${asked} from here.** I can move a ticket to **${allowed.join(" or ")}** after you confirm. Try "Move KAN-18 to ${allowed[0]}".`,
      [],
      readKey ? await suggestTickets(config, readKey, deps.fetch, allowed[0]).catch(() => []) : [],
    );
  }

  if (intent.issueIds.length !== 1) {
    const lead = intent.issueIds.length
      ? `**One ticket at a time, please.** Which one should I move to ${target}?`
      : `**Yes. Tell me which ticket to move to ${target}**, for example "Move KAN-18 to ${target}". I'll show you a confirm button before anything changes in Linear.`;
    const suggestions = intent.issueIds.length
      ? intent.issueIds.slice(0, MAX_SUGGESTIONS).map((id) => `Move ${id} to ${target}`)
      : readKey
        ? await suggestTickets(config, readKey, deps.fetch, target).catch(() => [])
        : [];
    return answer(lead, [], suggestions);
  }

  const identifier = intent.issueIds[0];
  const issue = readKey ? await fetchIssue(identifier, readKey, deps.fetch) : null;
  if (!issue) return answer(`**I couldn't find ${identifier} in Linear.** Check the ticket id and try again.`, [], []);
  if (!inTeam(issue, config)) {
    return answer(`**${identifier} isn't in the ${config.linear.teamKey} team,** so I can't move it from here.`, [citationFor(issue)], []);
  }
  if (issue.state.name === target) {
    return answer(`**${identifier} is already ${target}.** [linear:${identifier}]`, [citationFor(issue)], [`What's the status of ${identifier}?`]);
  }

  const { token, expiresAt } = createActionToken({ issueId: identifier, toState: target }, secret, (deps.now ?? Date.now)());
  return answer(
    `**Ready to move ${identifier} from ${issue.state.name} to ${target}.** [linear:${identifier}]\n- **What happens:** the ticket changes state in Linear and gets an audit comment. If the Linear webhook is connected, this starts the Cursor workflow (plan → eval → your approval before any PR).\n- **Nothing changes until you confirm below.**`,
    [citationFor(issue)],
    [],
    { kind: "linear_transition", issueId: identifier, issueTitle: issue.title, url: issue.url, fromState: issue.state.name, toState: target, token, expiresAt },
  );
}

export class ActionError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
  ) {
    super(code);
  }
}

/** Performs a confirmed move. Throws ActionError with an HTTP status for anything it refuses. */
export async function executeTransition(token: unknown, config: Config, deps: ActionDeps): Promise<InsightAnswer> {
  const writeKey = config.actions.linearApiKey;
  const secret = config.actions.secret;
  if (!writeKey || !secret) throw new ActionError(503, "actions_not_configured");

  const check = verifyActionToken(token, secret, (deps.now ?? Date.now)());
  if (!check.ok) throw new ActionError(check.reason === "expired" ? 410 : 400, check.reason === "expired" ? "confirmation_expired" : "invalid_confirmation");
  if (check.claim.action !== "linear_transition") throw new ActionError(400, "invalid_confirmation");
  const { issueId, toState } = check.claim;
  if (!config.actions.allowedStates.includes(toState)) throw new ActionError(403, "state_not_allowed");

  const issue = await fetchIssue(issueId, writeKey, deps.fetch);
  if (!issue) throw new ActionError(404, "issue_not_found");
  if (!inTeam(issue, config)) throw new ActionError(403, "issue_outside_team");
  const fromState = issue.state.name;
  if (fromState === toState) {
    return answer(`**${issueId} was already ${toState}**, so nothing changed. [linear:${issueId}]`, [citationFor(issue)], [`What's the status of ${issueId}?`]);
  }

  await moveIssue(issue, toState, writeKey, deps.fetch, `Moved from **${fromState}** to **${toState}** ${deps.confirmedVia ?? WEB_CONFIRMATION}.`);
  logEvent("linear_transition", { status: `${issueId}:${fromState}->${toState}` });

  return answer(
    `**Moved ${issueId} to ${toState}.** It was ${fromState}. [linear:${issueId}]\n- **Audit:** a comment recording this change was added to the ticket.\n- **Next:** if the Linear webhook is connected, the Cursor workflow picks it up (plan → eval → your approval before any PR).`,
    [citationFor(issue, toState)],
    [`What's the status of ${issueId}?`, "Which tickets are still in progress?", "What merged this week?"],
  );
}

/**
 * Moves an issue to a named state in its own team, then leaves an audit comment
 * (best effort — the move already happened). Throws ActionError on refusal.
 */
export async function moveIssue(issue: IssueNode, toState: string, writeKey: string, fetch: FetchLike, auditBody: string): Promise<void> {
  const states = await graphql<{ workflowStates: { nodes: Array<{ id: string; name: string }> } }>(
    { apiKey: writeKey, fetch },
    `query State($filter: WorkflowStateFilter) { workflowStates(filter: $filter) { nodes { id name } } }`,
    { filter: { team: { id: { eq: issue.team.id } }, name: { eq: toState } } },
  );
  const stateId = states.data?.workflowStates.nodes[0]?.id;
  if (!stateId) throw new ActionError(422, "state_not_in_team");

  const updated = await graphql<{ issueUpdate: { success: boolean; issue: { state: { name: string } } | null } }>(
    { apiKey: writeKey, fetch },
    `mutation Move($id: String!, $stateId: String!) { issueUpdate(id: $id, input: { stateId: $stateId }) { success issue { state { name } } } }`,
    { id: issue.id, stateId },
  );
  if (!updated.data?.issueUpdate.success) throw new ActionError(502, "linear_update_failed");

  await graphql(
    { apiKey: writeKey, fetch },
    `mutation Audit($input: CommentCreateInput!) { commentCreate(input: $input) { success } }`,
    { input: { issueId: issue.id, body: auditBody } },
  ).catch((error: unknown) => logEvent("linear_audit_comment_failed", { error: errorCode(error) }));
}
