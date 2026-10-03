import type { ChatResponse } from "../../shared/contracts";

export function chatResponse(overrides: Partial<ChatResponse> = {}): ChatResponse {
  return {
    requestId: "req-1",
    reply: "**KAN-5 is In Progress.** [linear:KAN-5]\n- **PR:** merged [github:PR:o/core#5]",
    citations: [
      { id: "linear:KAN-5", kind: "linear_issue", title: "KAN-5 AI Assistant parity", url: "https://linear.app/x/KAN-5", status: "In Progress" },
      { id: "github:PR:o/core#5", kind: "github_pr", title: "core #5 Assistant rail", url: "https://github.com/o/core/pull/5", status: "merged" },
    ],
    relatedQuestions: ["Show CI checks", "What merged this week?", "Which tickets are In Review?"],
    provider: "grok:grok-4-fast-non-reasoning",
    retrievalMeta: { connectors: ["linear", "github"], connectorModes: { linear: "live", github: "live" }, window: "last 14 days", truncated: false, itemCount: 9 },
    latencyMs: 2300,
    ...overrides,
  };
}

export function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
