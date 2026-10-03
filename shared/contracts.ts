/**
 * Wire contract between the Insights UI and the BFF. Shared by both sides so
 * the browser and server can never drift on field names.
 */

export type ConnectorId = "linear" | "github" | "posthog" | "sentry" | "github_search" | "workflow" | "docs";

export type CitationKind = "linear_issue" | "github_pr" | "github_check" | "posthog_insight" | "sentry_issue" | "workflow_run" | "doc";

export interface Citation {
  /** Stable retrieval id, e.g. `linear:KAN-5` or `github:PR:owner/repo#10`. */
  id: string;
  kind: CitationKind;
  title: string;
  url: string;
  /** Short status text shown on the chip, e.g. "In Progress", "merged", "success". */
  status?: string;
}

export interface ChatTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  message: string;
  history?: ChatTurn[];
  orgId?: string;
}

/** "live" = real API call, "sample" = fixture data, "unavailable" = not configured or the call failed. */
export type ConnectorMode = "live" | "sample" | "unavailable";

export interface RetrievalMeta {
  connectors: ConnectorId[];
  connectorModes: Partial<Record<ConnectorId, ConnectorMode>>;
  /** Human-readable window, e.g. "last 14 days". */
  window: string;
  truncated: boolean;
  itemCount: number;
}

export type Provider = `grok:${string}` | "fixture" | "digest" | "action";

/**
 * A change the viewer must confirm with a click. Nothing happens until the
 * UI posts `token` to the action endpoint.
 */
export interface ProposedAction {
  /** linear_transition: move a ticket. workflow_implement: approve the Cursor plan + move to In Review. */
  kind: "linear_transition" | "workflow_implement";
  issueId: string;
  issueTitle: string;
  url: string;
  fromState: string;
  toState: string;
  token: string;
  expiresAt: number;
}

/** Colour *roles*; the UI maps them to validated tokens (categorical blue/orange, status green/red). */
export type ChartColor = "series1" | "series2" | "good" | "critical";

export interface ChartSeries {
  key: string;
  name: string;
  color: ChartColor;
  /** One value per category, same order as `categories`. */
  values: number[];
}

/**
 * A server-computed chart. Numbers never come from the model, so they always
 * match the cited sources. "grouped" = side-by-side columns, "stacked" = one column split,
 * "ranked" = one series as horizontal bars, longest first (for long category names).
 */
export interface ChartSpec {
  id: string;
  kind: "grouped" | "stacked" | "ranked";
  title: string;
  /** Window + source note, e.g. "Last 7 days · merged PRs on GitHub". */
  subtitle: string;
  categories: string[];
  series: ChartSeries[];
  /** Unit for tooltips/table, e.g. "PRs", "tickets", "runs". */
  unit: string;
  /** True when drawn from sample data rather than live connectors. */
  sample: boolean;
}

export const MAX_CHART_CATEGORIES = 31;
export const MAX_CHART_SERIES = 4;

/** One stage of a ticket's journey through the Cursor workflow (pipeline tracker). */
export interface TimelineStep {
  key: "signal" | "planning" | "eval" | "approval" | "implement" | "pr" | "merged" | "done";
  label: string;
  status: "done" | "current" | "pending" | "failed" | "skipped";
  /** ISO time the stage happened, when known. */
  at: string | null;
  detail: string;
  url: string | null;
}

export interface PipelineTimeline {
  issueId: string;
  title: string;
  url: string;
  state: string;
  steps: TimelineStep[];
}

/** A flow drawn beside a knowledge answer. Labels are short stage names, not counts. */
export interface FlowDiagram {
  title: string;
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ from: string; to: string }>;
}

export interface ChatResponse {
  requestId: string;
  reply: string;
  citations: Citation[];
  relatedQuestions: string[];
  provider: Provider;
  retrievalMeta: RetrievalMeta;
  latencyMs: number;
  proposedAction?: ProposedAction;
  charts?: ChartSpec[];
  timeline?: PipelineTimeline;
  /** Mechanism flow for a how-it-works answer. Absent when the sources are not a sequence. */
  diagram?: FlowDiagram;
}

export interface Organisation {
  id: string;
  name: string;
  role: string;
}

export interface SuggestedPrompt {
  id: string;
  label: string;
  query: string;
}

export interface ApiError {
  requestId: string;
  error: string;
  message?: string;
}

export const MESSAGE_MIN_CHARS = 2;
export const MESSAGE_MAX_CHARS = 2000;
export const HISTORY_MAX_TURNS = 6;

/** Events on POST /api/v1/insights/chat/stream (one JSON object per line). */
export type ChatStreamEvent =
  | { type: "delta"; text: string }
  | { type: "done"; response: ChatResponse }
  | { type: "error"; error: string; requestId: string };
