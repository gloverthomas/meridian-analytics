/** Streamed answers: reply extraction, the xAI SSE client, and the NDJSON chat endpoint. */
import { beforeEach, describe, expect, it } from "vitest";
import type { ChatStreamEvent } from "../../shared/contracts.js";
import { createApp } from "../../server/app.js";
import { createXaiClient, type GrokClient } from "../../server/grok/client.js";
import { createReplyExtractor } from "../../server/grok/replyStream.js";
import { retrievalCache } from "../../server/retrieval/cache.js";
import { makeConfig, mockFetch, postJson } from "../helpers.js";

beforeEach(() => retrievalCache.clear());

const ctx = (path: string) => ({ ip: "9.9.9.9", requestId: "req-stream", path });

function feed(chunks: string[]): string {
  const extractor = createReplyExtractor();
  return chunks.map((c) => extractor.push(c)).join("");
}

describe("createReplyExtractor", () => {
  const json = JSON.stringify({ reply: 'He said "hi"\n- **KAN-5** café ✓ \\ done', citations: ["linear:KAN-5"], relatedQuestions: ["a"] });

  it("decodes the reply, whatever the chunking", () => {
    const expected = 'He said "hi"\n- **KAN-5** café ✓ \\ done';
    expect(feed([json])).toBe(expected);
    expect(feed(json.split(""))).toBe(expected);
    for (const size of [2, 3, 5, 7]) {
      const chunks = json.match(new RegExp(`[\\s\\S]{1,${size}}`, "g"))!;
      expect(feed(chunks), `chunk size ${size}`).toBe(expected);
    }
  });

  it("handles \\u escapes split across chunks and ignores fields after the reply", () => {
    expect(feed(['{"reply":"caf', "\\u00", 'e9!","citations":["x"]}'])).toBe("café!");
  });

  it("finds the key even when it's split, and yields nothing without one", () => {
    expect(feed(['{"rep', 'ly" : "ok"}'])).toBe("ok");
    expect(feed(['{"citations":[]}'])).toBe("");
  });
});

function sse(frames: string[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      for (const f of frames) controller.enqueue(enc.encode(f));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

describe("xAI streaming client", () => {
  it("parses SSE frames split mid-line and reports each fragment", async () => {
    const frame = (content: string) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}\n\n`;
    const all = frame('{"reply":"Hel') + frame('lo"}') + ": keep-alive\n\n" + "data: [DONE]\n\n";
    const fetch = mockFetch((_url, init) => {
      expect(JSON.parse(String(init?.body))).toMatchObject({ stream: true, response_format: { type: "json_object" } });
      return sse([all.slice(0, 17), all.slice(17, 60), all.slice(60)]);
    });
    const client = createXaiClient({ apiKey: "k", model: "m", timeoutMs: 1_000, fetch });
    const pieces: string[] = [];
    await expect(client.stream!([{ role: "user", content: "q" }], (t) => pieces.push(t))).resolves.toBe('{"reply":"Hello"}');
    expect(pieces).toEqual(['{"reply":"Hel', 'lo"}']);
  });

  it("retries without JSON mode on 400, and fails on an empty stream", async () => {
    let calls = 0;
    const fetch = mockFetch(() => (++calls === 1 ? new Response("{}", { status: 400 }) : sse(["data: [DONE]\n\n"])));
    const client = createXaiClient({ apiKey: "k", model: "m", timeoutMs: 1_000, fetch });
    await expect(client.stream!([{ role: "user", content: "q" }], () => undefined)).rejects.toThrow("xai_empty_reply");
    expect(calls).toBe(2);
  });
});

/** A Grok double that streams its reply in small pieces. */
function streamingGrok(reply: object | string): GrokClient & { streamed: number } {
  const text = typeof reply === "string" ? reply : JSON.stringify(reply);
  const grok = {
    model: "grok-test",
    streamed: 0,
    complete: async () => text,
    async stream(_messages: unknown, onDelta: (t: string) => void) {
      grok.streamed += 1;
      for (let i = 0; i < text.length; i += 4) onDelta(text.slice(i, i + 4));
      return text;
    },
  };
  return grok;
}

async function readEvents(res: Response): Promise<ChatStreamEvent[]> {
  const text = await res.text();
  return text.trim().split("\n").map((line) => JSON.parse(line) as ChatStreamEvent);
}

describe("POST /api/v1/insights/chat/stream", () => {
  const path = "/api/v1/insights/chat/stream";

  it("streams the reply, then a done event whose answer matches the JSON route", async () => {
    const grok = streamingGrok({ reply: "**KAN-5 is In Progress.** [linear:KAN-5]", citations: ["linear:KAN-5"], relatedQuestions: ["a", "b", "c"] });
    const app = createApp({ config: makeConfig(), fetch: mockFetch(), grok });
    const res = await app(postJson(path, { message: "What's going on with KAN-5?" }), ctx(path));
    expect(res.headers.get("Content-Type")).toContain("application/x-ndjson");

    const events = await readEvents(res);
    const deltas = events.filter((e) => e.type === "delta").map((e) => (e as { text: string }).text);
    const done = events.at(-1);
    expect(grok.streamed).toBe(1);
    expect(deltas.length).toBeGreaterThan(3);
    expect(deltas.join("")).toBe("**KAN-5 is In Progress.** [linear:KAN-5]");
    expect(done).toMatchObject({ type: "done", response: { requestId: "req-stream", provider: "grok:grok-test", citations: [{ id: "linear:KAN-5" }] } });
  });

  it("answers without deltas when there's nothing to stream (help)", async () => {
    const app = createApp({ config: makeConfig(), fetch: mockFetch(), grok: streamingGrok("{}") });
    const events = await readEvents(await app(postJson(path, { message: "What can I ask?" }), ctx(path)));
    expect(events.map((e) => e.type)).toEqual(["done"]);
  });

  it("rejects bad input with a normal JSON error before streaming", async () => {
    const app = createApp({ config: makeConfig(), fetch: mockFetch(), grok: null });
    const res = await app(postJson(path, { message: "x" }), ctx(path));
    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: "invalid_message" });
  });

  it("ends with an error event (no internals) when answering fails", async () => {
    const app = createApp({ config: { ...makeConfig(), github: null as never }, fetch: mockFetch(), grok: null });
    const events = await readEvents(await app(postJson(path, { message: "hello there" }), ctx(path)));
    expect(events).toEqual([{ type: "error", error: "internal_error", requestId: "req-stream" }]);
  });
});
