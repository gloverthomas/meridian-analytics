/** Linear GraphQL connector (read-only). Normalises issues into citable items. */
import { clip } from "./redact.js";
import { CONNECTOR_TIMEOUT_MS, type FetchLike, type RetrievedItem } from "./types.js";

const LINEAR_GRAPHQL_URL = "https://api.linear.app/graphql";
const RECENT_LIMIT = 50;
const COMMENT_LIMIT = 5;
const DESCRIPTION_CHARS = 700;
const COMMENT_CHARS = 280;

export interface LinearIssueNode {
  identifier: string;
  title: string;
  url: string;
  priorityLabel?: string | null;
  updatedAt: string;
  state?: { name: string; type?: string } | null;
  assignee?: { displayName: string } | null;
  labels?: { nodes: Array<{ name: string }> } | null;
  description?: string | null;
  comments?: { nodes: Array<{ body: string; createdAt: string; user?: { displayName: string } | null }> } | null;
}

export interface LinearDeps {
  apiKey: string;
  fetch: FetchLike;
  teamId: string | null;
  teamKey: string;
}

const SUMMARY_FIELDS = `identifier title url priorityLabel updatedAt
  state { name type } assignee { displayName } labels { nodes { name } }`;

const DETAIL_FIELDS = `${SUMMARY_FIELDS} description
  comments(first: ${COMMENT_LIMIT}, orderBy: createdAt) { nodes { body createdAt user { displayName } } }`;

export async function graphql<T>(deps: Pick<LinearDeps, "apiKey" | "fetch">, query: string, variables: Record<string, unknown>): Promise<{ data: T | null; errors: unknown[] }> {
  const res = await deps.fetch(LINEAR_GRAPHQL_URL, {
    method: "POST",
    headers: { Authorization: deps.apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
    signal: AbortSignal.timeout(CONNECTOR_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`linear_${res.status}`);
  const body = (await res.json()) as { data?: T | null; errors?: unknown[] };
  return { data: body.data ?? null, errors: body.errors ?? [] };
}

/** Fetches specific issues by identifier in one aliased query; unknown ids are skipped. */
export async function fetchLinearIssues(ids: string[], deps: LinearDeps): Promise<LinearIssueNode[]> {
  if (!ids.length) return [];
  const vars = ids.map((_, i) => `$i${i}: String!`).join(", ");
  const fields = ids.map((_, i) => `i${i}: issue(id: $i${i}) { ${DETAIL_FIELDS} }`).join("\n");
  const variables = Object.fromEntries(ids.map((id, i) => [`i${i}`, id]));
  const { data, errors } = await graphql<Record<string, LinearIssueNode | null>>(deps, `query Issues(${vars}) { ${fields} }`, variables);
  // Partial data is normal when an id doesn't exist; only a total failure is an error.
  if (!data) {
    if (errors.length) throw new Error("linear_graphql_error");
    return [];
  }
  return Object.values(data).filter((node): node is LinearIssueNode => Boolean(node));
}

export async function fetchLinearRecent(deps: LinearDeps): Promise<LinearIssueNode[]> {
  const filter = deps.teamId ? { team: { id: { eq: deps.teamId } } } : { team: { key: { eq: deps.teamKey } } };
  const query = `query Recent($filter: IssueFilter, $first: Int!) {
    issues(filter: $filter, first: $first, orderBy: updatedAt) { nodes { ${SUMMARY_FIELDS} } }
  }`;
  const { data, errors } = await graphql<{ issues: { nodes: LinearIssueNode[] } }>(deps, query, { filter, first: RECENT_LIMIT });
  if (!data?.issues) throw new Error(errors.length ? "linear_graphql_error" : "linear_empty_response");
  return data.issues.nodes;
}

export function normalizeLinearIssue(node: LinearIssueNode): RetrievedItem {
  const id = `linear:${node.identifier}`;
  const state = node.state?.name ?? "Unknown";
  const labels = node.labels?.nodes.map((l) => l.name).join(", ");
  const meta = [
    `state: ${state}`,
    labels ? `labels: ${labels}` : null,
    node.priorityLabel ? `priority: ${node.priorityLabel}` : null,
    node.assignee ? `assignee: ${node.assignee.displayName}` : "unassigned",
    `updated: ${node.updatedAt.slice(0, 10)}`,
  ]
    .filter(Boolean)
    .join(" · ");

  const lines = [`[${id}] ${node.identifier} "${clip(node.title, 160)}" — ${meta}`];
  if (node.description) lines.push(`  Description: ${clip(node.description, DESCRIPTION_CHARS)}`);
  for (const comment of node.comments?.nodes ?? []) {
    const who = comment.user?.displayName ?? "someone";
    lines.push(`  Comment (${who}, ${comment.createdAt.slice(0, 10)}): ${clip(comment.body, COMMENT_CHARS)}`);
  }

  return {
    connector: "linear",
    citation: { id, kind: "linear_issue", title: `${node.identifier} ${clip(node.title, 90)}`, url: node.url, status: state },
    text: lines.join("\n"),
    updatedAt: node.updatedAt,
    mentions: [node.identifier.toUpperCase()],
    labels: node.labels?.nodes.map((l) => l.name) ?? [],
  };
}

/** Minimal shape for "opened vs closed" charts: when each ticket was created and completed. */
export interface LinearActivityNode {
  identifier: string;
  createdAt: string;
  completedAt: string | null;
  labels?: { nodes: Array<{ name: string }> } | null;
}

const ACTIVITY_LIMIT = 100;

/** Tickets created OR completed since `sinceIso`, for trend charts (not packed into Grok's context). */
export async function fetchLinearActivity(sinceIso: string, deps: LinearDeps): Promise<LinearActivityNode[]> {
  const team = deps.teamId ? { team: { id: { eq: deps.teamId } } } : { team: { key: { eq: deps.teamKey } } };
  const filter = { ...team, or: [{ createdAt: { gte: sinceIso } }, { completedAt: { gte: sinceIso } }] };
  const query = `query Activity($filter: IssueFilter, $first: Int!) {
    issues(filter: $filter, first: $first) { nodes { identifier createdAt completedAt labels { nodes { name } } } }
  }`;
  const { data, errors } = await graphql<{ issues: { nodes: LinearActivityNode[] } }>(deps, query, { filter, first: ACTIVITY_LIMIT });
  if (!data?.issues) throw new Error(errors.length ? "linear_graphql_error" : "linear_empty_response");
  return data.issues.nodes;
}


export interface LinearIssueHistory {
  identifier: string;
  title: string;
  url: string;
  createdAt: string;
  completedAt: string | null;
  canceledAt: string | null;
  state: { name: string; type?: string } | null;
  history: { nodes: Array<{ createdAt: string; fromState: { name: string } | null; toState: { name: string } | null }> };
}

/** One issue with its state-change history, for the pipeline tracker. */
export async function fetchIssueHistory(identifier: string, deps: Pick<LinearDeps, "apiKey" | "fetch">): Promise<LinearIssueHistory | null> {
  const query = `query History($id: String!) { issue(id: $id) {
    identifier title url createdAt completedAt canceledAt state { name type }
    history(first: 50) { nodes { createdAt fromState { name } toState { name } } }
  } }`;
  const { data, errors } = await graphql<{ issue: LinearIssueHistory | null }>(deps, query, { id: identifier });
  if (!data && errors.length && !JSON.stringify(errors).toLowerCase().includes("not found")) throw new Error("linear_graphql_error");
  return data?.issue ?? null;
}
