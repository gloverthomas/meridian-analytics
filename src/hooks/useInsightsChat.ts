/**
 * Chat actions. Entries live in the conversation store; every request writes
 * back to the conversation it was sent from (by id), so a reply still lands
 * if the viewer has switched to another chat in the meantime.
 */
import { useCallback, useEffect, useRef } from "react";
import { HISTORY_MAX_TURNS, MESSAGE_MAX_CHARS, MESSAGE_MIN_CHARS, type ChatTurn } from "../../shared/contracts";
import { api, ApiRequestError, describeError } from "../lib/api";
import type { ConversationsApi, ThreadEntry } from "./useConversations";

export type { ThreadEntry } from "./useConversations";

type Store = Pick<ConversationsApi, "entriesOf" | "update" | "isPending" | "setPending" | "stepsOf" | "setSteps" | "streamOf" | "appendStream" | "clearStream">;

export interface InsightsChat {
  entries: ThreadEntry[];
  isSending: boolean;
  /** What the server is doing for the in-flight question, when known. */
  progress: string[] | undefined;
  /** The answer as it's being written (streamed), before it's validated and cited. */
  streaming: string | undefined;
  send: (message: string) => Promise<void>;
  retry: (message: string) => Promise<void>;
  /** Runs a proposed ticket move. Resolves to an error message to show inline, or null on success. */
  confirmAction: (entryId: string) => Promise<string | null>;
  dismissAction: (entryId: string) => void;
}

let counter = 0;
const nextId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${++counter}`;

export function isValidMessage(message: string): boolean {
  const length = message.trim().length;
  return length >= MESSAGE_MIN_CHARS && length <= MESSAGE_MAX_CHARS;
}

/** Last N user/assistant turns in wire format; errors are not part of history. */
export function toHistory(entries: ThreadEntry[]): ChatTurn[] {
  return entries
    .flatMap((entry): ChatTurn[] => {
      if (entry.role === "user") return [{ role: "user", content: entry.content }];
      if (entry.role === "assistant") return [{ role: "assistant", content: entry.response.reply }];
      return [];
    })
    .slice(-HISTORY_MAX_TURNS);
}

/** In-flight requests live for the page lifetime, keyed by conversation — not by what's on screen. */
const inFlight = new Map<string, AbortController>();

export function abortConversation(id: string): void {
  inFlight.get(id)?.abort();
  inFlight.delete(id);
}

export function useInsightsChat(orgId: string | undefined, conversationId: string, store: Store): InsightsChat {
  const storeRef = useRef(store);
  useEffect(() => {
    storeRef.current = store;
  });

  const ask = useCallback(
    async (id: string, message: string, history: ChatTurn[]) => {
      const controller = new AbortController();
      inFlight.set(id, controller);
      storeRef.current.setPending(id, true);
      // Cheap, rule-based preview of the real work; the loading card falls back to generic steps without it.
      storeRef.current.setSteps(id, undefined);
      api
        .progress(message)
        .then((steps) => {
          if (storeRef.current.isPending(id)) storeRef.current.setSteps(id, steps);
        })
        .catch(() => undefined);
      // Coalesce streamed fragments to at most one render per frame.
      let buffered = "";
      let frame = 0;
      const flush = () => {
        frame = 0;
        if (buffered && !controller.signal.aborted) storeRef.current.appendStream(id, buffered);
        buffered = "";
      };
      const onDelta = (text: string) => {
        buffered += text;
        if (!frame) frame = requestAnimationFrame(flush);
      };
      try {
        const response = await api.chatStream({ message, history, orgId }, onDelta, controller.signal);
        storeRef.current.update(id, (prev) => [...prev, { id: nextId("a"), role: "assistant", response }]);
      } catch (error) {
        if (controller.signal.aborted) return;
        storeRef.current.update(id, (prev) => [...prev, { id: nextId("e"), role: "error", message: describeError(error), retryOf: message }]);
      } finally {
        if (frame) cancelAnimationFrame(frame);
        if (inFlight.get(id) === controller) inFlight.delete(id);
        storeRef.current.setPending(id, false);
        storeRef.current.setSteps(id, undefined);
        storeRef.current.clearStream(id);
      }
    },
    [orgId],
  );

  const send = useCallback(
    async (raw: string) => {
      const message = raw.trim();
      const id = conversationId;
      if (!isValidMessage(message) || storeRef.current.isPending(id)) return;
      const history = toHistory(storeRef.current.entriesOf(id));
      storeRef.current.update(id, (prev) => [...prev, { id: nextId("u"), role: "user", content: message }]);
      await ask(id, message, history);
    },
    [ask, conversationId],
  );

  const retry = useCallback(
    async (message: string) => {
      const id = conversationId;
      if (storeRef.current.isPending(id)) return;
      // Drop the trailing error card (if any), keep the user's bubble, re-ask.
      const kept = storeRef.current.entriesOf(id).filter((entry, i, all) => !(i === all.length - 1 && entry.role === "error"));
      storeRef.current.update(id, () => kept);
      await ask(id, message, toHistory(kept.slice(0, -1)));
    },
    [ask, conversationId],
  );

  /** Removes a proposal from its answer so its buttons can't be used again. */
  const clearProposal = useCallback((id: string, entryId: string) => {
    storeRef.current.update(id, (prev) =>
      prev.map((e) => {
        if (e.id !== entryId || e.role !== "assistant" || !e.response.proposedAction) return e;
        const { proposedAction: _used, ...response } = e.response;
        void _used;
        return { ...e, response };
      }),
    );
  }, []);

  const dismissAction = useCallback((entryId: string) => clearProposal(conversationId, entryId), [clearProposal, conversationId]);

  const confirmAction = useCallback(
    async (entryId: string) => {
      const id = conversationId;
      const entry = storeRef.current.entriesOf(id).find((e) => e.id === entryId);
      const proposal = entry?.role === "assistant" ? entry.response.proposedAction : undefined;
      if (!proposal || storeRef.current.isPending(id)) return null;
      storeRef.current.setPending(id, true);
      try {
        const response = proposal.kind === "workflow_implement" ? await api.confirmImplement(proposal.token) : await api.confirmTransition(proposal.token);
        clearProposal(id, entryId);
        storeRef.current.update(id, (prev) => [...prev, { id: nextId("a"), role: "assistant", response }]);
        return null;
      } catch (error) {
        // An expired or refused confirmation can't reuse its token: retire the card and
        // offer "Try again", which asks afresh and yields a new proposal.
        if (error instanceof ApiRequestError && [400, 403, 404, 410].includes(error.status)) {
          clearProposal(id, entryId);
          const retryOf = proposal.kind === "workflow_implement" ? `What's the Cursor plan for ${proposal.issueId}?` : `Move ${proposal.issueId} to ${proposal.toState}`;
          storeRef.current.update(id, (prev) => [...prev, { id: nextId("e"), role: "error", message: describeError(error), retryOf }]);
          return null;
        }
        return describeError(error);
      } finally {
        storeRef.current.setPending(id, false);
      }
    },
    [clearProposal, conversationId],
  );

  return {
    entries: store.entriesOf(conversationId),
    isSending: store.isPending(conversationId),
    progress: store.stepsOf(conversationId),
    streaming: store.streamOf(conversationId),
    send,
    retry,
    confirmAction,
    dismissAction,
  };
}
