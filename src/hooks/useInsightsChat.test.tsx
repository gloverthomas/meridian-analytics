import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { STORAGE_KEY } from "../lib/conversationStore";
import { chatResponse, jsonRes } from "../test/fixtures";
import { useConversations, type ThreadEntry } from "./useConversations";
import { abortConversation, isValidMessage, toHistory, useInsightsChat } from "./useInsightsChat";

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  // Progress steps are a side request; answer it here so fetchMock only sees chat calls.
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) =>
    String(input).includes("/insights/progress") ? Promise.resolve(jsonRes({ requestId: "r", steps: ["Reading KAN-5 in Linear…"] })) : fetchMock(input, init),
  );
  localStorage.clear();
});
afterEach(() => vi.unstubAllGlobals());

function useHarness() {
  const store = useConversations();
  const chat = useInsightsChat("org_liquid_coffee", store.activeId, store);
  return { store, chat };
}

describe("useInsightsChat + useConversations", () => {
  it("sends with history, stores the thread, and persists it", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes(chatResponse())).mockResolvedValueOnce(jsonRes(chatResponse({ reply: "second" })));
    const { result } = renderHook(useHarness);

    await act(() => result.current.chat.send("  What's up with KAN-5?  "));
    expect(result.current.chat.entries.map((e) => e.role)).toEqual(["user", "assistant"]);
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]!.body))).toEqual({ message: "What's up with KAN-5?", history: [], orgId: "org_liquid_coffee" });

    await act(() => result.current.chat.send("And CI?"));
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]!.body)).history).toEqual([
      { role: "user", content: "What's up with KAN-5?" },
      { role: "assistant", content: chatResponse().reply },
    ]);

    expect(result.current.store.conversations).toHaveLength(1);
    expect(result.current.store.conversations[0].title).toBe("What's up with KAN-5?");
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].entries).toHaveLength(4));
  });

  it("delivers a reply to its own conversation after the viewer switches away", async () => {
    let resolve!: (res: Response) => void;
    fetchMock.mockImplementationOnce(() => new Promise((r) => (resolve = r)));
    const { result } = renderHook(useHarness);
    const first = result.current.store.activeId;

    let pending!: Promise<void>;
    act(() => {
      pending = result.current.chat.send("slow question");
    });
    expect(result.current.chat.isSending).toBe(true);

    act(() => result.current.store.startNew());
    expect(result.current.chat.entries).toEqual([]);
    expect(result.current.chat.isSending).toBe(false);

    await act(async () => {
      resolve(jsonRes(chatResponse({ reply: "late answer" })));
      await pending;
    });
    const original = result.current.store.entriesOf(first);
    expect(original.map((e) => e.role)).toEqual(["user", "assistant"]);
    expect(result.current.store.isPending(first)).toBe(false);
  });

  it("ignores invalid messages and doesn't create a conversation", async () => {
    const { result } = renderHook(useHarness);
    await act(() => result.current.chat.send(" x "));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(result.current.store.conversations).toEqual([]);
  });

  it("shows a friendly error (not persisted) and retries", async () => {
    fetchMock.mockResolvedValueOnce(jsonRes({ requestId: "r", error: "rate_limit_exceeded" }, 429)).mockResolvedValueOnce(jsonRes(chatResponse()));
    const { result } = renderHook(useHarness);

    await act(() => result.current.chat.send("status of KAN-5"));
    const error = result.current.chat.entries.at(-1)!;
    expect(error.role === "error" && error.message).toMatch(/faster than we can answer/);
    await waitFor(() => expect(JSON.parse(localStorage.getItem(STORAGE_KEY)!)[0].entries.map((e: ThreadEntry) => e.role)).toEqual(["user"]));

    await act(() => result.current.chat.retry("status of KAN-5"));
    expect(result.current.chat.entries.map((e) => e.role)).toEqual(["user", "assistant"]);
  });

  it("maps network failures; delete aborts and removes the conversation", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));
    const { result } = renderHook(useHarness);
    await act(() => result.current.chat.send("hello there"));
    const last = result.current.chat.entries.at(-1)!;
    expect(last.role === "error" && last.message).toMatch(/Can't reach/);

    const id = result.current.store.activeId;
    act(() => {
      abortConversation(id);
      result.current.store.remove(id);
    });
    expect(result.current.store.conversations).toEqual([]);
    expect(result.current.store.activeId).not.toBe(id);
  });

  it("drops a reply silently when its conversation was deleted mid-request", async () => {
    fetchMock.mockImplementationOnce((_u, init) => new Promise((_r, reject) => init!.signal!.addEventListener("abort", () => reject(new DOMException("x", "AbortError")))));
    const { result } = renderHook(useHarness);
    const id = result.current.store.activeId;
    let pending!: Promise<void>;
    act(() => {
      pending = result.current.chat.send("going away");
    });
    await act(async () => {
      abortConversation(id);
      result.current.store.remove(id);
      await pending;
    });
    expect(result.current.store.conversations).toEqual([]);
  });

  it("restores saved conversations on load", () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify([{ id: "c1", title: "Saved", createdAt: 1, updatedAt: 2, entries: [{ id: "u", role: "user", content: "hi" }] }]),
    );
    const { result } = renderHook(useHarness);
    expect(result.current.store.conversations.map((c) => c.title)).toEqual(["Saved"]);
    act(() => result.current.store.select("c1"));
    expect(result.current.chat.entries).toHaveLength(1);
  });
});

describe("helpers", () => {
  it("validates length bounds", () => {
    expect(isValidMessage("a")).toBe(false);
    expect(isValidMessage("ok")).toBe(true);
    expect(isValidMessage("x".repeat(2001))).toBe(false);
  });

  it("builds history from the last turns, skipping errors", () => {
    const entries: ThreadEntry[] = [
      ...Array.from({ length: 4 }, (_, i): ThreadEntry => ({ id: `u${i}`, role: "user", content: `q${i}` })),
      { id: "e", role: "error", message: "x", retryOf: "q" },
      { id: "a", role: "assistant", response: chatResponse({ reply: "r" }) },
      ...Array.from({ length: 3 }, (_, i): ThreadEntry => ({ id: `v${i}`, role: "user", content: `z${i}` })),
    ];
    const history = toHistory(entries);
    expect(history).toHaveLength(6);
    expect(history.some((t) => t.content === "x")).toBe(false);
    expect(history.at(-1)).toEqual({ role: "user", content: "z2" });
  });
});
