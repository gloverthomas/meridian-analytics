import { describe, expect, it } from "vitest";
import { chatResponse } from "../test/fixtures";
import {
  deriveTitle,
  loadConversations,
  MAX_CONVERSATIONS,
  MAX_ENTRIES_PER_CONVERSATION,
  parseConversations,
  relativeTime,
  removeConversation,
  saveConversations,
  STORAGE_KEY,
  upsertConversation,
  type Conversation,
} from "./conversationStore";

const conv = (id: string, updatedAt: number, extra: Partial<Conversation> = {}): Conversation => ({
  id,
  title: id,
  createdAt: updatedAt,
  updatedAt,
  entries: [{ id: `${id}-u`, role: "user", content: "hello" }],
  ...extra,
});

describe("conversationStore", () => {
  it("derives a clipped title from the first question", () => {
    expect(deriveTitle([{ id: "1", role: "user", content: "  What   merged\nthis week?  " }])).toBe("What merged this week?");
    expect(deriveTitle([{ id: "1", role: "user", content: "x".repeat(120) }])).toHaveLength(80);
    expect(deriveTitle([])).toBe("New conversation");
  });

  it("upserts newest-first without mutating, capped", () => {
    const list = [conv("a", 1), conv("b", 2)];
    const next = upsertConversation(list, conv("a", 3));
    expect(next.map((c) => c.id)).toEqual(["a", "b"]);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
    const many = Array.from({ length: MAX_CONVERSATIONS + 5 }, (_, i) => conv(`c${i}`, i)).reduce(upsertConversation, [] as Conversation[]);
    expect(many).toHaveLength(MAX_CONVERSATIONS);
    expect(removeConversation(next, "a").map((c) => c.id)).toEqual(["b"]);
  });

  it("drops malformed or tampered records on load", () => {
    const good = conv("ok", 5, { entries: [{ id: "u", role: "user", content: "q" }, { id: "a", role: "assistant", response: chatResponse() }] });
    const raw = JSON.stringify([
      good,
      { id: "no-entries", title: "x", createdAt: 1, updatedAt: 1, entries: [] },
      { id: 42, title: "bad id" },
      conv("bad-entries", 4, { entries: [{ id: "x", role: "system", content: "<script>" }, { id: "y", role: "assistant", response: { reply: 1 } }] as never }),
      "string",
    ]);
    const parsed = parseConversations(raw);
    expect(parsed.map((c) => c.id)).toEqual(["ok"]);
    expect(parsed[0].entries).toHaveLength(2);
    expect(parseConversations("{not json")).toEqual([]);
    expect(parseConversations('{"a":1}')).toEqual([]);
    expect(parseConversations(null)).toEqual([]);
  });

  it("caps entries per conversation on load", () => {
    const entries = Array.from({ length: MAX_ENTRIES_PER_CONVERSATION + 10 }, (_, i) => ({ id: `u${i}`, role: "user" as const, content: `q${i}` }));
    expect(parseConversations(JSON.stringify([conv("big", 1, { entries })]))[0].entries).toHaveLength(MAX_ENTRIES_PER_CONVERSATION);
  });

  it("survives unavailable storage", () => {
    const broken = {
      getItem: () => {
        throw new Error("SecurityError");
      },
      setItem: () => {
        throw new Error("QuotaExceeded");
      },
    };
    expect(loadConversations(broken)).toEqual([]);
    expect(saveConversations([conv("a", 1)], broken)).toBe(false);
    const mem = new Map<string, string>();
    const ok = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
    expect(saveConversations([conv("a", 1)], ok)).toBe(true);
    expect(loadConversations(ok).map((c) => c.id)).toEqual(["a"]);
    expect(mem.has(STORAGE_KEY)).toBe(true);
  });

  it("formats relative times", () => {
    const now = Date.parse("2026-09-25T12:00:00Z");
    expect(relativeTime(now - 10_000, now)).toBe("Just now");
    expect(relativeTime(now - 5 * 60_000, now)).toBe("5m");
    expect(relativeTime(now - 3 * 3_600_000, now)).toBe("3h");
    expect(relativeTime(now - 30 * 3_600_000, now)).toBe("Yesterday");
    expect(relativeTime(now - 10 * 86_400_000, now)).toMatch(/15/);
  });

  it("keeps valid action proposals and strips malformed ones", () => {
    const action = { kind: "linear_transition", issueId: "KAN-18", issueTitle: "t", url: "https://x", fromState: "Todo", toState: "In Progress", token: "tok", expiresAt: 1 };
    const withAction = (proposedAction: unknown) =>
      conv("c", 1, { entries: [{ id: "a", role: "assistant", response: { ...chatResponse(), proposedAction } as never }] });
    const [good] = parseConversations(JSON.stringify([withAction(action)]));
    expect(good.entries[0].role === "assistant" && good.entries[0].response.proposedAction).toEqual(action);
    const [bad] = parseConversations(JSON.stringify([withAction({ kind: "rm -rf", token: 1 })]));
    expect(bad.entries[0].role === "assistant" && bad.entries[0].response.proposedAction).toBeUndefined();
  });

  it("keeps workflow_implement proposals and valid timelines, drops malformed timelines", () => {
    const action = { kind: "workflow_implement", issueId: "KAN-5", issueTitle: "t", url: "https://x", fromState: "Todo", toState: "In Review", token: "tok", expiresAt: 1 };
    const timeline = { issueId: "KAN-5", title: "t", url: "https://x", state: "Todo", steps: [{ key: "signal", label: "Triage", status: "done", at: null, detail: "d", url: null }] };
    const withParts = (extra: object) => conv("c", 1, { entries: [{ id: "a", role: "assistant", response: { ...chatResponse(), ...extra } as never }] });
    const [good] = parseConversations(JSON.stringify([withParts({ proposedAction: action, timeline })]));
    const res = good.entries[0].role === "assistant" ? good.entries[0].response : null;
    expect(res?.proposedAction).toEqual(action);
    expect(res?.timeline).toEqual(timeline);
    const [bad] = parseConversations(JSON.stringify([withParts({ timeline: { ...timeline, steps: [{ key: "x", status: "exploded" }] } })]));
    expect(bad.entries[0].role === "assistant" && bad.entries[0].response.timeline).toBeUndefined();
  });

  it("keeps a valid flow and drops a malformed one", () => {
    const diagram = {
      title: "Signal to SDK",
      nodes: [
        { id: "n1", label: "Reporting posts /signal" },
        { id: "n2", label: "Workflow opens a Todo" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };
    const withParts = (extra: object) => conv("c", 1, { entries: [{ id: "a", role: "assistant", response: { ...chatResponse(), ...extra } as never }] });
    const [good] = parseConversations(JSON.stringify([withParts({ diagram })]));
    expect(good.entries[0].role === "assistant" && good.entries[0].response.diagram).toEqual(diagram);
    const [bad] = parseConversations(JSON.stringify([withParts({ diagram: { title: "x", nodes: [{ id: "nope", label: "a" }] } })]));
    expect(bad.entries[0].role === "assistant" && bad.entries[0].response.diagram).toBeUndefined();
  });
});
