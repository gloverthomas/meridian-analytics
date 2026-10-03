/** xAI Grok chat-completions client behind a small interface so tests (and CI) can inject a fake. */
import type { FetchLike } from "../retrieval/types.js";

export interface GrokMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface GrokClient {
  readonly model: string;
  complete(messages: GrokMessage[]): Promise<string>;
  /** Same as complete(), but calls onDelta with each content fragment as it arrives. */
  stream?(messages: GrokMessage[], onDelta: (text: string) => void): Promise<string>;
}

export interface XaiClientOptions {
  apiKey: string;
  model: string;
  timeoutMs: number;
  fetch: FetchLike;
}

const XAI_CHAT_URL = "https://api.x.ai/v1/chat/completions";
const TEMPERATURE = 0.2;
const MAX_TOKENS = 2_800;

export function createXaiClient(options: XaiClientOptions): GrokClient {
  async function request(messages: GrokMessage[], jsonMode: boolean): Promise<string> {
    const body: Record<string, unknown> = { model: options.model, messages, temperature: TEMPERATURE, max_tokens: MAX_TOKENS };
    if (jsonMode) body.response_format = { type: "json_object" };

    const res = await options.fetch(XAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!res.ok) throw new Error(`xai_${res.status}`);
    const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) throw new Error("xai_empty_reply");
    return content;
  }

  /** OpenAI-style SSE: `data: {"choices":[{"delta":{"content":"…"}}]}` lines, ending with `data: [DONE]`. */
  async function streamRequest(messages: GrokMessage[], jsonMode: boolean, onDelta: (text: string) => void): Promise<string> {
    const body: Record<string, unknown> = { model: options.model, messages, temperature: TEMPERATURE, max_tokens: MAX_TOKENS, stream: true };
    if (jsonMode) body.response_format = { type: "json_object" };
    const res = await options.fetch(XAI_CHAT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json", Accept: "text/event-stream" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(options.timeoutMs),
    });
    if (!res.ok) throw new Error(`xai_${res.status}`);
    if (!res.body) throw new Error("xai_empty_reply");

    const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
    let pending = "";
    let content = "";
    const handleLine = (line: string) => {
      const data = line.startsWith("data:") ? line.slice(5).trim() : "";
      if (!data || data === "[DONE]") return;
      try {
        const piece = (JSON.parse(data) as { choices?: Array<{ delta?: { content?: string } }> }).choices?.[0]?.delta?.content;
        if (piece) {
          content += piece;
          onDelta(piece);
        }
      } catch {
        // Ignore keep-alives and malformed frames; the final parse validates the whole answer.
      }
    };
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      pending += value;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      lines.forEach(handleLine);
    }
    handleLine(pending);
    if (!content.trim()) throw new Error("xai_empty_reply");
    return content.trim();
  }

  // Some models reject response_format; retry once without it. Timeouts/5xx propagate.
  const withJsonFallback = async (run: (jsonMode: boolean) => Promise<string>): Promise<string> => {
    try {
      return await run(true);
    } catch (error) {
      if (error instanceof Error && /^xai_(400|422)$/.test(error.message)) return run(false);
      throw error;
    }
  };

  return {
    model: options.model,
    complete: (messages) => withJsonFallback((jsonMode) => request(messages, jsonMode)),
    stream: (messages, onDelta) => withJsonFallback((jsonMode) => streamRequest(messages, jsonMode, onDelta)),
  };
}
