/**
 * One question → one answer, shared by every channel (web JSON, web stream,
 * Slack): answers, records the anonymous question-log event and logs.
 */
import { HISTORY_MAX_TURNS, type ChatResponse, type ChatTurn } from "../shared/contracts.js";
import { isHelpQuestion } from "../shared/askCatalog.js";
import { detectTicketAction } from "./actions/linearTransition.js";
import type { Config } from "./config.js";
import type { GrokClient } from "./grok/client.js";
import { answerQuestion } from "./insights.js";
import { logEvent } from "./log.js";
import { planRetrieval, questionForRetrieval } from "./retrieval/router.js";
import type { FetchLike } from "./retrieval/types.js";
import { recordQuestion, type QuestionChannel, type QuestionRecord } from "./telemetry.js";

export const HISTORY_TURN_MAX_CHARS = 1_500;

export interface ChatTurnDeps {
  config: Config;
  fetch: FetchLike;
  grok: GrokClient | null;
  now: () => number;
}

export interface ChatTurnInput {
  message: string;
  history: ChatTurn[];
  /** Anonymous id for the question log (never a name, cookie or Slack id). */
  viewerId: string;
  channel: QuestionChannel;
  requestId: string;
  onReplyDelta?: (text: string) => void;
}

export function sanitizeHistory(value: unknown): ChatTurn[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((turn): turn is ChatTurn => Boolean(turn) && (turn.role === "user" || turn.role === "assistant") && typeof turn.content === "string")
    .map((turn) => ({ role: turn.role, content: turn.content.slice(0, HISTORY_TURN_MAX_CHARS) }))
    .slice(-HISTORY_MAX_TURNS);
}

/** Throws (after recording the failure) when answering fails. */
export async function runChatTurn(input: ChatTurnInput, deps: ChatTurnDeps): Promise<Omit<ChatResponse, "requestId">> {
  const { config, fetch, grok, now } = deps;
  const { message, history, viewerId, channel, requestId, onReplyDelta } = input;
  const started = now();
  const action = detectTicketAction(message);
  const help = isHelpQuestion(message);
  const plan = planRetrieval(questionForRetrieval(message, history), config.github.repos);
  const record = (answer: Omit<QuestionRecord, "topic" | "style" | "charts" | "windowDays" | "channel">): Promise<void> =>
    recordQuestion(config, fetch, viewerId, {
      topic: action ? "ticket_move" : help ? "help" : plan.intent,
      style: action ? "action" : help ? "direct" : plan.style,
      charts: action || help ? [] : plan.charts,
      windowDays: plan.sinceDays,
      channel,
      ...answer,
    });

  let answer: Awaited<ReturnType<typeof answerQuestion>>;
  try {
    answer = await answerQuestion(message, history, config, { fetch, grok, now, requestId, onReplyDelta, channel });
  } catch (error) {
    await record({ sources: [], answerType: "none", outcome: "error", latencyMs: now() - started, citationCount: 0 });
    throw error;
  }
  const latencyMs = now() - started;
  const answerType = answer.provider.startsWith("grok:") ? "grok" : (answer.provider as "fixture" | "digest" | "action");
  await record({
    sources: Object.entries(answer.retrievalMeta.connectorModes)
      .filter(([, mode]) => mode !== "unavailable")
      .map(([c]) => c),
    answerType,
    outcome: answerType === "digest" && !help ? "fallback" : "answered",
    latencyMs,
    citationCount: answer.citations.length,
  });
  logEvent("insights_chat", {
    requestId,
    provider: answer.provider,
    connectors: answer.retrievalMeta.connectors,
    connectorModes: answer.retrievalMeta.connectorModes,
    itemCount: answer.retrievalMeta.itemCount,
    truncated: answer.retrievalMeta.truncated,
    messageLength: message.length,
    latencyMs,
    streamed: Boolean(onReplyDelta),
    channel,
  });
  return { ...answer, latencyMs };
}
