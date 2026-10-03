/**
 * Same-origin API client. Auth is handled outside the bundle: the Vite proxy
 * adds the demo bearer in dev; hosted deploys use an HttpOnly session cookie.
 */
import type { ApiError, ChatRequest, ChatResponse, ChatStreamEvent, Organisation, SuggestedPrompt } from "../../shared/contracts";

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly requestId?: string,
  ) {
    super(code);
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      ...init,
      credentials: "same-origin",
      headers: { Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError(0, "network_error");
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as (T & Partial<ApiError>) | null;
  if (!res.ok) throw new ApiRequestError(res.status, body?.error ?? `http_${res.status}`, body?.requestId);
  if (body === null) throw new ApiRequestError(res.status, "invalid_response");
  return body;
}

/** Reads NDJSON events, calling onDelta for reply text; resolves with the final validated answer. */
async function readAnswerStream(res: Response, onDelta: (text: string) => void): Promise<ChatResponse> {
  if (!res.body) throw new ApiRequestError(res.status, "invalid_response");
  const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
  let pending = "";
  const handle = (line: string): ChatResponse | null => {
    if (!line.trim()) return null;
    let event: ChatStreamEvent;
    try {
      event = JSON.parse(line) as ChatStreamEvent;
    } catch {
      throw new ApiRequestError(res.status, "invalid_response");
    }
    if (event.type === "delta") onDelta(event.text);
    if (event.type === "error") throw new ApiRequestError(500, event.error, event.requestId);
    return event.type === "done" ? event.response : null;
  };
  for (;;) {
    let chunk: ReadableStreamReadResult<string>;
    try {
      chunk = await reader.read();
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") throw error;
      throw new ApiRequestError(0, "network_error");
    }
    if (chunk.done) break;
    pending += chunk.value;
    const lines = pending.split("\n");
    pending = lines.pop() ?? "";
    for (const line of lines) {
      const done = handle(line);
      if (done) return done;
    }
  }
  const last = handle(pending);
  if (last) return last;
  // The stream ended without an answer (connection dropped mid-answer).
  throw new ApiRequestError(0, "network_error");
}

/** Streams an answer. Errors before streaming (401, 429, 400…) come back as normal JSON errors. */
async function chatStream(body: ChatRequest, onDelta: (text: string) => void, signal?: AbortSignal): Promise<ChatResponse> {
  let res: Response;
  try {
    res = await fetch("/api/v1/insights/chat/stream", {
      method: "POST",
      body: JSON.stringify(body),
      signal,
      credentials: "same-origin",
      headers: { Accept: "application/x-ndjson, application/json", "Content-Type": "application/json" },
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw new ApiRequestError(0, "network_error");
  }
  if (res.ok && res.headers.get("Content-Type")?.includes("ndjson")) return readAnswerStream(res, onDelta);
  const json = (await res.json().catch(() => null)) as (ChatResponse & Partial<ApiError>) | null;
  if (!res.ok) throw new ApiRequestError(res.status, json?.error ?? `http_${res.status}`, json?.requestId);
  if (json === null) throw new ApiRequestError(res.status, "invalid_response");
  return json;
}

export const api = {
  organisation: () => request<Organisation>("/api/v1/organisation"),
  orgs: () => request<{ orgs: Organisation[] }>("/api/v1/orgs").then((r) => r.orgs),
  suggestedPrompts: () => request<{ prompts: SuggestedPrompt[] }>("/api/v1/suggested-prompts").then((r) => r.prompts),
  chat: (body: ChatRequest, signal?: AbortSignal) => request<ChatResponse>("/api/v1/insights/chat", { method: "POST", body: JSON.stringify(body), signal }),
  chatStream,
  progress: (message: string) => request<{ steps: string[] }>("/api/v1/insights/progress", { method: "POST", body: JSON.stringify({ message }) }).then((r) => r.steps),
  confirmTransition: (token: string) => request<ChatResponse>("/api/v1/actions/linear-transition", { method: "POST", body: JSON.stringify({ token }) }),
  confirmImplement: (token: string) => request<ChatResponse>("/api/v1/actions/workflow-implement", { method: "POST", body: JSON.stringify({ token }) }),
  createSession: (accessCode: string) => request<void>("/api/v1/session", { method: "POST", body: JSON.stringify({ accessCode }) }),
  endSession: () => request<void>("/api/v1/session", { method: "DELETE" }),
};

/** Maps API errors to copy a business reader can act on — never raw server detail. */
export function describeError(error: unknown): string {
  if (!(error instanceof ApiRequestError)) return "Something went wrong. Please try again.";
  switch (error.code) {
    case "network_error":
      return "Can't reach the Insights service. Check your connection and try again.";
    case "rate_limit_exceeded":
      return "You're asking faster than we can answer. Wait a minute and try again.";
    case "unauthorized":
      return "Your session has expired. Reload the page to sign in again.";
    case "invalid_message":
      return "Questions need to be between 2 and 2,000 characters.";
    case "confirmation_expired":
      return "That confirmation expired. Ask again to get a fresh one.";
    case "issue_outside_team":
    case "state_not_allowed":
      return "That move isn't allowed from here.";
    case "workflow_unavailable":
      return "The Cursor workflow service didn't respond. It may be stopped; try again once it's running.";
    case "workflow_auth_failed":
      return "Insights couldn't authenticate with the workflow service. Check WORKFLOW_API_TOKEN.";
    case "actions_not_configured":
      return "Moving tickets isn't switched on for this deployment.";
    default:
      return "Insights couldn't answer that right now. Please try again.";
  }
}
