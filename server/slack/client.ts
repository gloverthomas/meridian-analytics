/** The few Slack Web API calls the bot needs. The bot token never leaves the server. */
import type { FetchLike } from "../retrieval/types.js";

const SLACK_API = "https://slack.com/api";
const SLACK_TIMEOUT_MS = 8_000;

export interface SlackDeps {
  token: string;
  fetch: FetchLike;
}

export interface SlackMessage {
  text: string;
  blocks?: unknown[];
}

export interface ThreadMessage {
  user?: string;
  bot_id?: string;
  text?: string;
  ts: string;
}

/** Form-encoded (every Web API method accepts it; some read methods ignore JSON bodies). Objects are JSON-encoded. */
function formBody(body: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined) continue;
    params.set(key, typeof value === "object" ? JSON.stringify(value) : String(value));
  }
  return params.toString();
}

async function call<T>(method: string, body: Record<string, unknown>, deps: SlackDeps): Promise<T> {
  const res = await deps.fetch(`${SLACK_API}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${deps.token}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: formBody(body),
    signal: AbortSignal.timeout(SLACK_TIMEOUT_MS),
  });
  const data = (await res.json().catch(() => ({ ok: false, error: `http_${res.status}` }))) as T & { ok: boolean; error?: string };
  if (!data.ok) throw new Error(`slack_${method}_${data.error ?? "failed"}`);
  return data;
}

export const postMessage = (channel: string, threadTs: string | undefined, message: SlackMessage, deps: SlackDeps) =>
  call<{ ts: string }>("chat.postMessage", { channel, thread_ts: threadTs, unfurl_links: false, unfurl_media: false, ...message }, deps).then((r) => r.ts);

export const updateMessage = (channel: string, ts: string, message: SlackMessage, deps: SlackDeps) =>
  call("chat.update", { channel, ts, ...message }, deps).then(() => undefined);

export const postEphemeral = (channel: string, user: string, threadTs: string | undefined, text: string, deps: SlackDeps) =>
  call("chat.postEphemeral", { channel, user, text, ...(threadTs ? { thread_ts: threadTs } : {}) }, deps).then(() => undefined);

export const threadReplies = (channel: string, threadTs: string, deps: SlackDeps) =>
  call<{ messages?: ThreadMessage[] }>("conversations.replies", { channel, ts: threadTs, limit: 20 }, deps).then((r) => r.messages ?? []);

export const userName = (user: string, deps: SlackDeps) =>
  call<{ user?: { real_name?: string; name?: string } }>("users.info", { user }, deps)
    .then((r) => r.user?.real_name || r.user?.name || user)
    .catch(() => user);
