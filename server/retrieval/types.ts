import type { Citation, ConnectorId, ConnectorMode } from "../../shared/contracts.js";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

/** One normalised, citable unit of retrieval context. */
export interface RetrievedItem {
  connector: ConnectorId;
  citation: Citation;
  /** Pre-truncated text block handed to Grok; always starts with `[citation.id]`. */
  text: string;
  /** ISO timestamp used for recency ranking. */
  updatedAt: string | null;
  /** Identifiers this item is "about" (e.g. KAN-5), for exact-match boosting. */
  mentions: string[];
  /** Linear labels, used for computed counts (never sent separately to the browser). */
  labels?: string[];
}

export interface ConnectorResult {
  connector: ConnectorId;
  mode: ConnectorMode;
  fetchedAt: string;
  items: RetrievedItem[];
}

export const CONNECTOR_TIMEOUT_MS = 5_000;
