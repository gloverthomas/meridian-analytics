/**
 * Single source of truth for every conversation in this browser: entries,
 * which one is on screen, and which are waiting on an answer. Requests write
 * into their own conversation by id, so switching chats mid-answer never
 * loses the reply.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deriveTitle,
  loadConversations,
  MAX_ENTRIES_PER_CONVERSATION,
  removeConversation,
  saveConversations,
  upsertConversation,
  type Conversation,
  type StoredEntry,
} from "../lib/conversationStore";

export type ThreadEntry = StoredEntry | { id: string; role: "error"; message: string; retryOf: string };

/** In memory a conversation may also hold transient error cards; those are never persisted. */
export interface LiveConversation extends Omit<Conversation, "entries"> {
  entries: ThreadEntry[];
}

export interface ConversationsApi {
  conversations: LiveConversation[];
  /** Always set; an id with no record yet is a fresh, unsaved conversation. */
  activeId: string;
  entriesOf: (id: string) => ThreadEntry[];
  isPending: (id: string) => boolean;
  startNew: () => void;
  select: (id: string) => void;
  remove: (id: string) => void;
  update: (id: string, change: (prev: ThreadEntry[]) => ThreadEntry[]) => void;
  setPending: (id: string, pending: boolean) => void;
  /** Progress steps for an in-flight question (what's actually being fetched). */
  stepsOf: (id: string) => string[] | undefined;
  setSteps: (id: string, steps: string[] | undefined) => void;
  /** Answer text streamed so far for an in-flight question (not yet validated or cited). */
  streamOf: (id: string) => string | undefined;
  appendStream: (id: string, text: string) => void;
  clearStream: (id: string) => void;
}

const newId = () => `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

const persistable = (list: LiveConversation[]): Conversation[] =>
  list
    .map((c) => ({ ...c, entries: c.entries.filter((e): e is StoredEntry => e.role !== "error").slice(-MAX_ENTRIES_PER_CONVERSATION) }))
    .filter((c) => c.entries.length > 0);

export function useConversations(now: () => number = Date.now): ConversationsApi {
  const [conversations, setConversations] = useState<LiveConversation[]>(() => loadConversations());
  const [activeId, setActiveId] = useState<string>(newId);
  const [pending, setPendingIds] = useState<ReadonlySet<string>>(() => new Set());
  const [steps, setStepsMap] = useState<ReadonlyMap<string, string[]>>(() => new Map());
  const [streams, setStreams] = useState<ReadonlyMap<string, string>>(() => new Map());
  // Mirror for synchronous reads inside async callbacks (history for the next request).
  const listRef = useRef(conversations);

  useEffect(() => {
    saveConversations(persistable(conversations));
  }, [conversations]);

  const commit = useCallback((next: LiveConversation[]) => {
    listRef.current = next;
    setConversations(next);
  }, []);

  const entriesOf = useCallback((id: string) => listRef.current.find((c) => c.id === id)?.entries ?? [], []);

  const update = useCallback(
    (id: string, change: (prev: ThreadEntry[]) => ThreadEntry[]) => {
      const list = listRef.current;
      const existing = list.find((c) => c.id === id);
      const entries = change(existing?.entries ?? []);
      if (!existing && !entries.length) return;
      const at = now();
      const title = existing?.title ?? deriveTitle(entries.filter((e): e is StoredEntry => e.role !== "error"));
      commit(upsertConversation(list, { id, title, createdAt: existing?.createdAt ?? at, updatedAt: at, entries }));
    },
    [commit, now],
  );

  const remove = useCallback(
    (id: string) => {
      commit(removeConversation(listRef.current, id));
      setActiveId((current) => (current === id ? newId() : current));
    },
    [commit],
  );

  const setPending = useCallback((id: string, isOn: boolean) => {
    setPendingIds((prev) => {
      const next = new Set(prev);
      if (isOn) next.add(id);
      else next.delete(id);
      return next;
    });
  }, []);

  const setSteps = useCallback((id: string, next: string[] | undefined) => {
    setStepsMap((prev) => {
      const copy = new Map(prev);
      if (next?.length) copy.set(id, next);
      else copy.delete(id);
      return copy;
    });
  }, []);

  const appendStream = useCallback((id: string, text: string) => {
    setStreams((prev) => new Map(prev).set(id, (prev.get(id) ?? "") + text));
  }, []);

  const clearStream = useCallback((id: string) => {
    setStreams((prev) => {
      if (!prev.has(id)) return prev;
      const copy = new Map(prev);
      copy.delete(id);
      return copy;
    });
  }, []);

  return {
    conversations,
    activeId,
    entriesOf,
    isPending: (id) => pending.has(id),
    startNew: useCallback(() => setActiveId(newId()), []),
    select: useCallback((id: string) => setActiveId(id), []),
    remove,
    update,
    setPending,
    stepsOf: (id) => steps.get(id),
    setSteps,
    streamOf: (id) => streams.get(id),
    appendStream,
    clearStream,
  };
}
