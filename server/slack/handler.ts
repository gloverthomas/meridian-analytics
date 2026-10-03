/**
 * Meridian Insights in Slack. Every request is verified with Slack's signing
 * secret, acknowledged immediately (Slack needs a reply within 3 s), and the
 * real work runs in the background (`waitUntil` on Vercel):
 *
 * - @mention or DM → a "⏳" reply in the thread, updated as Grok writes, then
 *   replaced with the cited answer (same pipeline as the web app).
 * - Follow-up buttons ask that question in the thread.
 * - Approve / Move buttons run the same signed, 5-minute confirmations as the
 *   web app, but only for Slack users listed in SLACK_APPROVER_IDS.
 */
import { HISTORY_MAX_TURNS, MESSAGE_MAX_CHARS, MESSAGE_MIN_CHARS, type ChatTurn } from "../../shared/contracts.js";
import { ActionError, executeTransition } from "../actions/linearTransition.js";
import { executeImplement } from "../actions/workflowImplement.js";
import { HISTORY_TURN_MAX_CHARS, runChatTurn, type ChatTurnDeps } from "../chatTurn.js";
import { errorCode, logEvent } from "../log.js";
import { progressSteps } from "../progress.js";
import { anonymousViewerId } from "../telemetry.js";
import { postEphemeral, postMessage, threadReplies, updateMessage, userName, type SlackDeps } from "./client.js";
import { ACTION_IDS, formatAnswer, formatPartial, PROPOSAL_BLOCK_ID } from "./format.js";
import { verifySlackSignature } from "./verify.js";

const MAX_SLACK_BODY_BYTES = 64 * 1024;
const STREAM_UPDATE_MS = 1_200;
const SEEN_TTL_MS = 10 * 60_000;

export interface SlackHandlerDeps extends ChatTurnDeps {
  waitUntil: (work: Promise<unknown>) => void;
}

interface Ask {
  channel: string;
  user: string;
  team: string;
  text: string;
  /** Thread to answer in; undefined = top level (DMs). */
  replyThread: string | undefined;
  /** Existing thread whose earlier turns are context. */
  historyThread: string | undefined;
  excludeTs?: string;
  askedBy?: boolean;
}

interface SlackBlock {
  block_id?: string;
}

interface InteractionMessage {
  ts: string;
  thread_ts?: string;
  text?: string;
  blocks?: SlackBlock[];
}

/** The parts of a block_actions payload we use (everything is re-checked; nothing is trusted beyond the signature). */
interface BlockActionsPayload {
  type?: string;
  user?: { id?: string; team_id?: string };
  team?: { id?: string };
  channel?: { id?: string };
  message?: InteractionMessage;
  actions?: Array<{ action_id?: string; value?: string }>;
}

const ok = () => new Response(null, { status: 200 });
const text = (status: number, body: string) => new Response(body, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

/** "<@U123> what's <https://x|this>? &amp;" → "what's this? &" */
export function cleanSlackText(raw: string): string {
  return raw
    .replace(/<@[UW][A-Z0-9]+(\|[^>]*)?>/g, "")
    .replace(/<(?:https?|mailto):[^|>]+\|([^>]+)>/g, "$1")
    .replace(/<((?:https?|mailto):[^>]+)>/g, "$1")
    .replace(/<#[A-Z0-9]+\|([^>]*)>/g, "#$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

async function readRaw(request: Request): Promise<string | null> {
  const declared = Number.parseInt(request.headers.get("content-length") ?? "", 10);
  if (Number.isFinite(declared) && declared > MAX_SLACK_BODY_BYTES) return null;
  const raw = await request.text();
  return new TextEncoder().encode(raw).length > MAX_SLACK_BODY_BYTES ? null : raw;
}

const ACTION_ERRORS: Record<string, string> = {
  confirmation_expired: "That confirmation expired (they last 5 minutes). Ask again for a fresh one.",
  invalid_confirmation: "That button isn't valid any more. Ask again for a fresh one.",
  issue_outside_team: "That ticket isn't in the configured Linear team.",
  state_not_allowed: "That move isn't allowed from Insights.",
  issue_not_found: "I couldn't find that ticket in Linear.",
  workflow_unavailable: "The Cursor workflow service didn't respond. Nothing was changed; try again once it's running.",
  workflow_auth_failed: "Insights couldn't authenticate with the workflow service. Nothing was changed.",
  actions_not_configured: "Ticket actions aren't switched on for this deployment.",
};

export function createSlackHandlers(deps: SlackHandlerDeps) {
  const { config } = deps;
  const slack: SlackDeps = { token: config.slack.botToken ?? "", fetch: deps.fetch };
  const seen = new Map<string, number>();
  const formatOpts = { publicUrl: config.slack.publicUrl, actionsEnabled: config.slack.approverIds.length > 0 };

  /** Slack retries events it thinks we missed; answer each event once per instance. */
  function firstTime(eventId: string): boolean {
    const now = deps.now();
    for (const [id, at] of seen) if (now - at > SEEN_TTL_MS) seen.delete(id);
    if (seen.has(eventId)) return false;
    seen.set(eventId, now);
    return true;
  }

  async function verified(request: Request): Promise<string | Response> {
    const raw = await readRaw(request);
    if (raw === null) return text(413, "request_too_large");
    if (!config.slack.signingSecret || !verifySlackSignature(raw, request.headers, config.slack.signingSecret, deps.now())) {
      logEvent("slack_signature_rejected", {});
      return text(401, "invalid_signature");
    }
    return raw;
  }

  async function threadHistory(channel: string, threadTs: string, excludeTs: string | undefined): Promise<ChatTurn[]> {
    const messages = await threadReplies(channel, threadTs, slack).catch(() => []);
    return messages
      .filter((m) => m.ts !== excludeTs && m.text)
      .map((m): ChatTurn => (m.bot_id ? { role: "assistant", content: m.text! } : { role: "user", content: cleanSlackText(m.text!) }))
      .filter((turn) => turn.content.length > 0)
      .map((turn) => ({ ...turn, content: turn.content.slice(0, HISTORY_TURN_MAX_CHARS) }))
      .slice(-HISTORY_MAX_TURNS);
  }

  async function answerInSlack(ask: Ask, requestId: string): Promise<void> {
    const question = ask.text.length >= MESSAGE_MIN_CHARS ? ask.text.slice(0, MESSAGE_MAX_CHARS) : "What can I ask?";
    const header = ask.askedBy ? `<@${ask.user}> asked: _${question}_\n` : "";
    let placeholder: string;
    try {
      placeholder = await postMessage(ask.channel, ask.replyThread, { text: `${header}⏳ ${progressSteps(question, config)[0] ?? "Looking into it…"}` }, slack);
    } catch (error) {
      logEvent("slack_post_failed", { requestId, error: errorCode(error) });
      return;
    }

    // Stream: update the placeholder at most every STREAM_UPDATE_MS, one update at a time.
    let written = "";
    let lastUpdate = 0;
    let updating: Promise<void> = Promise.resolve();
    const onReplyDelta = (delta: string) => {
      written += delta;
      const now = deps.now();
      if (now - lastUpdate < STREAM_UPDATE_MS) return;
      lastUpdate = now;
      const snapshot = `${header}${formatPartial(written)}`;
      updating = updating.then(() => updateMessage(ask.channel, placeholder, { text: snapshot }, slack).catch(() => undefined));
    };

    try {
      const history = ask.historyThread ? await threadHistory(ask.channel, ask.historyThread, ask.excludeTs) : [];
      const answer = await runChatTurn(
        { message: question, history, viewerId: anonymousViewerId(`slack:${ask.team}:${ask.user}`), channel: "slack", requestId, onReplyDelta },
        deps,
      );
      await updating;
      const rendered = formatAnswer(answer, { ...formatOpts, ...(ask.askedBy ? { askedBy: { user: ask.user, question } } : {}) });
      await updateMessage(ask.channel, placeholder, rendered, slack);
    } catch (error) {
      logEvent("slack_answer_failed", { requestId, error: errorCode(error) });
      await updating;
      await updateMessage(
        ask.channel,
        placeholder,
        { text: `${header}Sorry, I couldn't answer that right now. Try again, or ask in <${config.slack.publicUrl}|Meridian Insights>.` },
        slack,
      ).catch(() => undefined);
    }
  }

  async function events(request: Request, requestId: string): Promise<Response> {
    const raw = await verified(request);
    if (raw instanceof Response) return raw;
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return text(400, "invalid_json");
    }
    if (body.type === "url_verification" && typeof body.challenge === "string") return text(200, body.challenge);
    if (body.type !== "event_callback" || typeof body.event_id !== "string") return ok();
    if (request.headers.has("x-slack-retry-num") || !firstTime(body.event_id)) return ok();

    const event = (body.event ?? {}) as Record<string, string | undefined>;
    const team = typeof body.team_id === "string" ? body.team_id : "unknown";
    const fromHuman = !event.bot_id && !event.subtype && typeof event.user === "string" && typeof event.channel === "string" && typeof event.ts === "string";
    const isMention = event.type === "app_mention";
    const isDm = event.type === "message" && event.channel_type === "im";
    if (!fromHuman || !(isMention || isDm)) return ok();

    const threadTs = event.thread_ts;
    deps.waitUntil(
      answerInSlack(
        {
          channel: event.channel!,
          user: event.user!,
          team,
          text: cleanSlackText(event.text ?? ""),
          // Channels: always answer in a thread. DMs: reply inline unless already in a thread.
          replyThread: threadTs ?? (isDm ? undefined : event.ts),
          historyThread: threadTs,
          excludeTs: event.ts,
        },
        requestId,
      ),
    );
    return ok();
  }

  /** Replaces the proposal's buttons with a one-line outcome, so they can't be pressed twice. */
  async function retireButtons(channel: string, message: InteractionMessage, note: string): Promise<void> {
    const blocks = (message.blocks ?? []).filter((b) => b.block_id !== PROPOSAL_BLOCK_ID);
    await updateMessage(channel, message.ts, { text: message.text ?? "Meridian Insights", blocks: [...blocks, { type: "context", elements: [{ type: "mrkdwn", text: note }] }] }, slack).catch(
      () => undefined,
    );
  }

  async function runAction(user: string, channel: string, message: InteractionMessage, value: string, requestId: string): Promise<void> {
    const threadTs = message.thread_ts ?? message.ts;
    let parsed: { k?: string; t?: string };
    try {
      parsed = JSON.parse(value) as { k?: string; t?: string };
    } catch {
      parsed = {};
    }
    const run = parsed.k === "workflow_implement" ? executeImplement : parsed.k === "linear_transition" ? executeTransition : null;
    if (!run || typeof parsed.t !== "string") return;

    // Display names go into a Linear comment: keep them to plain name characters.
    const name = (await userName(user, slack)).replace(/[^\p{L}\p{N} .'-]/gu, "").slice(0, 60) || user;
    try {
      const result = await run(parsed.t, config, { fetch: deps.fetch, now: deps.now, confirmedVia: `from Slack by ${name} (confirmed with a button)` });
      await retireButtons(channel, message, `✅ Confirmed by <@${user}>`);
      await postMessage(channel, threadTs, formatAnswer(result, { ...formatOpts, actionsEnabled: false }), slack);
      logEvent("slack_action_confirmed", { requestId, action: parsed.k });
    } catch (error) {
      const code = error instanceof ActionError ? error.code : "internal_error";
      logEvent("slack_action_failed", { requestId, error: code });
      if (code === "confirmation_expired" || code === "invalid_confirmation") await retireButtons(channel, message, "⌛ This confirmation expired. Ask again for a fresh one.");
      await postEphemeral(channel, user, threadTs, ACTION_ERRORS[code] ?? "That didn't work, and nothing was changed. Try again from Meridian Insights.", slack).catch(() => undefined);
    }
  }

  async function interactions(request: Request, requestId: string): Promise<Response> {
    const raw = await verified(request);
    if (raw instanceof Response) return raw;
    let payload: BlockActionsPayload;
    try {
      payload = JSON.parse(new URLSearchParams(raw).get("payload") ?? "") as BlockActionsPayload;
    } catch {
      return text(400, "invalid_payload");
    }
    const action = payload.actions?.[0];
    const user = payload.user?.id ?? "";
    const channel = payload.channel?.id ?? "";
    const message = payload.message;
    const team = payload.team?.id ?? payload.user?.team_id ?? "unknown";
    if (payload.type !== "block_actions" || !action || !message?.ts) return ok();
    if (!channel || !user || typeof action.action_id !== "string") return ok();

    if (action.action_id.startsWith(ACTION_IDS.ask) && typeof action.value === "string") {
      const isDm = channel.startsWith("D");
      const threadTs: string | undefined = message.thread_ts ?? (isDm ? undefined : message.ts);
      deps.waitUntil(answerInSlack({ channel, user, team, text: action.value, replyThread: threadTs, historyThread: threadTs, askedBy: true }, requestId));
      return ok();
    }

    const isApprover = config.slack.approverIds.includes(user);
    if (action.action_id === ACTION_IDS.approve || action.action_id === ACTION_IDS.cancel) {
      if (!isApprover) {
        logEvent("slack_action_denied", { requestId });
        deps.waitUntil(postEphemeral(channel, user, message.thread_ts ?? message.ts, "Only approvers can confirm or cancel ticket actions from Slack.", slack).catch(() => undefined));
        return ok();
      }
      if (action.action_id === ACTION_IDS.cancel) {
        deps.waitUntil(retireButtons(channel, message, `Cancelled by <@${user}>. Nothing changed.`));
        return ok();
      }
      deps.waitUntil(runAction(user, channel, message, action.value ?? "", requestId));
    }
    return ok();
  }

  return { events, interactions };
}
