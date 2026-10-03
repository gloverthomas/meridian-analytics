import { loadConfig, type Config } from "../server/config.js";
import type { GrokClient, GrokMessage } from "../server/grok/client.js";
import type { FetchLike } from "../server/retrieval/types.js";

export const DEMO_TOKEN = "test-demo-token-0123456789";

export function makeConfig(env: Record<string, string | undefined> = {}): Config {
  return loadConfig({ NODE_ENV: "test", LIQUID_BFF_DEMO_TOKEN: DEMO_TOKEN, ...env });
}

export interface RecordedCall {
  url: string;
  init?: RequestInit;
}

type Route = (url: string, init?: RequestInit) => Response | Promise<Response> | undefined;

/** A fetch double that dispatches on URL and records every call. Unmatched → throws. */
export function mockFetch(...routes: Route[]): FetchLike & { calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];
  const fn = (async (input: string, init?: RequestInit) => {
    calls.push({ url: input, init });
    for (const route of routes) {
      const res = await route(input, init);
      if (res) return res;
    }
    throw new Error(`unmocked_fetch ${input}`);
  }) as FetchLike & { calls: RecordedCall[] };
  fn.calls = calls;
  return fn;
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

export function fakeGrok(...replies: Array<string | Error>): GrokClient & { calls: GrokMessage[][] } {
  const calls: GrokMessage[][] = [];
  let i = 0;
  return {
    model: "grok-test",
    calls,
    async complete(messages) {
      calls.push(messages);
      const next = replies[Math.min(i++, replies.length - 1)];
      if (next instanceof Error) throw next;
      return next;
    },
  };
}

export function postJson(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost:5173${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${DEMO_TOKEN}`, ...headers },
    body: JSON.stringify(body),
  });
}

export function get(path: string, headers: Record<string, string> = { Authorization: `Bearer ${DEMO_TOKEN}` }): Request {
  return new Request(`http://localhost:5173${path}`, { headers });
}
