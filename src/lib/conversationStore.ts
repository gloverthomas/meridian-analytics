/**
 * Per-browser chat history. Everyone shares one access code, so the server
 * can't tell viewers apart — history therefore lives only in this browser's
 * localStorage. Stored data is treated as untrusted: malformed records are
 * dropped on load, and answers still render through the safe markdown path.
 */
import type { ChartSpec, ChatResponse } from "../../shared/contracts";
import { sanitizeFlow } from "../../shared/flow";
import { sanitizeChart } from "./chart";

export type StoredEntry = { id: string; role: "user"; content: string } | { id: string; role: "assistant"; response: ChatResponse };

export interface Conversation {
  id: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  entries: StoredEntry[];
}

export const STORAGE_KEY = "liquid-insights:conversations:v1";
export const MAX_CONVERSATIONS = 50;
export const MAX_ENTRIES_PER_CONVERSATION = 40;
const MAX_TITLE_CHARS = 80;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function isResponse(v: unknown): v is ChatResponse {
  return (
    isObject(v) &&
    typeof v.reply === "string" &&
    Array.isArray(v.citations) &&
    v.citations.every((c) => isObject(c) && typeof c.id === "string" && typeof c.title === "string" && typeof c.url === "string") &&
    Array.isArray(v.relatedQuestions) &&
    typeof v.provider === "string" &&
    isObject(v.retrievalMeta) &&
    Array.isArray(v.retrievalMeta.connectors) &&
    isObject(v.retrievalMeta.connectorModes) &&
    typeof v.latencyMs === "number"
  );
}

function isProposal(v: unknown): boolean {
  return (
    isObject(v) &&
    (v.kind === "linear_transition" || v.kind === "workflow_implement") &&
    ["issueId", "issueTitle", "url", "fromState", "toState", "token"].every((k) => typeof v[k] === "string") &&
    typeof v.expiresAt === "number"
  );
}

const STEP_STATUSES = new Set(["done", "current", "pending", "failed", "skipped"]);

function isTimeline(v: unknown): boolean {
  return (
    isObject(v) &&
    ["issueId", "title", "url", "state"].every((k) => typeof v[k] === "string") &&
    Array.isArray(v.steps) &&
    v.steps.length <= 12 &&
    v.steps.every((st) => isObject(st) && typeof st.key === "string" && typeof st.label === "string" && typeof st.detail === "string" && STEP_STATUSES.has(st.status as string))
  );
}

/** Keeps valid proposals/charts/timelines/flows; drops malformed ones (the server re-validates tokens anyway). */
function sanitizeResponse(response: ChatResponse): ChatResponse {
  const { proposedAction, charts, timeline, diagram, ...rest } = response;
  const cleanCharts = Array.isArray(charts) ? charts.map(sanitizeChart).filter((c): c is ChartSpec => c !== null) : [];
  const cleanDiagram = sanitizeFlow(diagram);
  return {
    ...rest,
    ...(proposedAction !== undefined && isProposal(proposedAction) ? { proposedAction } : {}),
    ...(cleanCharts.length ? { charts: cleanCharts } : {}),
    ...(timeline !== undefined && isTimeline(timeline) ? { timeline } : {}),
    ...(cleanDiagram ? { diagram: cleanDiagram } : {}),
  };
}

function isEntry(v: unknown): v is StoredEntry {
  if (!isObject(v) || typeof v.id !== "string") return false;
  if (v.role === "user") return typeof v.content === "string";
  if (v.role === "assistant") return isResponse(v.response);
  return false;
}

function isConversation(v: unknown): v is Conversation {
  return (
    isObject(v) &&
    typeof v.id === "string" &&
    typeof v.title === "string" &&
    typeof v.createdAt === "number" &&
    typeof v.updatedAt === "number" &&
    Array.isArray(v.entries)
  );
}

export function deriveTitle(entries: StoredEntry[]): string {
  const first = entries.find((e) => e.role === "user");
  const text = first?.role === "user" ? first.content.replace(/\s+/g, " ").trim() : "";
  if (!text) return "New conversation";
  return text.length > MAX_TITLE_CHARS ? `${text.slice(0, MAX_TITLE_CHARS - 1).trimEnd()}…` : text;
}

/** Newest first, bounded. Returns a new array; never mutates. */
type Listed = { id: string; updatedAt: number };

export function upsertConversation<T extends Listed>(list: T[], conversation: T): T[] {
  const next = [conversation, ...list.filter((c) => c.id !== conversation.id)];
  return next.sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
}

export function removeConversation<T extends Listed>(list: T[], id: string): T[] {
  return list.filter((c) => c.id !== id);
}

export function parseConversations(raw: string | null): Conversation[] {
  if (!raw) return [];
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];
  return data
    .filter(isConversation)
    .map((c) => ({
      ...c,
      title: c.title.slice(0, MAX_TITLE_CHARS),
      entries: c.entries
        .filter(isEntry)
        .map((e) => (e.role === "assistant" ? { ...e, response: sanitizeResponse(e.response) } : e))
        .slice(-MAX_ENTRIES_PER_CONVERSATION),
    }))
    .filter((c) => c.entries.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_CONVERSATIONS);
}

/** Storage can be unavailable (private mode, blocked site data) — history then just isn't kept. */
export function loadConversations(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): Conversation[] {
  try {
    return parseConversations(storage?.getItem(STORAGE_KEY) ?? null);
  } catch {
    return [];
  }
}

export function saveConversations(list: Conversation[], storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): boolean {
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

/** "Just now" / "5m" / "3h" / "Yesterday" / "12 Sep". */
export function relativeTime(then: number, now = Date.now()): string {
  const minutes = Math.floor((now - then) / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  if (hours < 48) return "Yesterday";
  return new Date(then).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
