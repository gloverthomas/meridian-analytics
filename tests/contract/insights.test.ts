/** Chat orchestration with a mocked Grok client (CI never calls xAI). */
import { beforeEach, describe, expect, it } from "vitest";
import { createXaiClient } from "../../server/grok/client.js";
import { answerQuestion, digestAnswer } from "../../server/insights.js";
import { retrievalCache } from "../../server/retrieval/cache.js";
import { fakeGrok, jsonResponse, makeConfig, mockFetch } from "../helpers.js";

const CORE_PR5 = "github:PR:gloverthomas/meridian-saas-core#5";
const config = makeConfig();
const noFetch = mockFetch();

beforeEach(() => retrievalCache.clear());

describe("answerQuestion", () => {
  it("returns Grok's synthesis with only retrieved citations", async () => {
    const grok = fakeGrok(
      JSON.stringify({
        reply: "**KAN-5 is In Progress.** [linear:KAN-5] See [github:PR:nope#1].",
        citations: ["linear:KAN-5", CORE_PR5, "linear:KAN-1000"],
        relatedQuestions: ["q1", "q2", "q3"],
      }),
    );
    const answer = await answerQuestion("What's going on with KAN-5?", [{ role: "user", content: "hi" }], config, { fetch: noFetch, grok });

    expect(answer.provider).toBe("grok:grok-test");
    expect(answer.reply).toBe("**KAN-5 is In Progress.** [linear:KAN-5] See .");
    expect(answer.citations.map((c) => c.id)).toEqual(["linear:KAN-5", CORE_PR5]);
    expect(answer.relatedQuestions).toEqual(["q1", "q2", "q3"]);

    const sent = grok.calls[0];
    expect(sent[0].role).toBe("system");
    expect(sent[1]).toEqual({ role: "user", content: "hi" });
    expect(sent.at(-1)!.content).toContain("[linear:KAN-5]");
    expect(sent.at(-1)!.content).toContain("QUESTION: What's going on with KAN-5?");
  });

  it("repairs invalid JSON once", async () => {
    const grok = fakeGrok("totally not json", JSON.stringify({ reply: "fixed", citations: [] }));
    const answer = await answerQuestion("status of KAN-5", [], config, { fetch: noFetch, grok });
    expect(grok.calls).toHaveLength(2);
    expect(answer.reply).toBe("fixed");
    // Contract: at least one citation when retrieval returned data.
    expect(answer.citations.length).toBeGreaterThan(0);
    expect(answer.relatedQuestions).toHaveLength(3);
  });

  it("falls back to the sample answer when Grok fails in sample mode", async () => {
    const grok = fakeGrok(new Error("xai_503"));
    const answer = await answerQuestion("What's going on with KAN-5?", [], config, { fetch: noFetch, grok });
    expect(answer.provider).toBe("fixture");
    expect(answer.citations.map((c) => c.id)).toContain("linear:KAN-5");
  });

  it("serves fixtures without a key, per intent", async () => {
    for (const q of ["Is assistant-unit passing on Core and Reporting main?", "What merged recently?", "Which tickets are in Todo?", "Are assistant failures increasing?"]) {
      const answer = await answerQuestion(q, [], config, { fetch: noFetch, grok: null });
      expect(answer.provider, q).toBe("fixture");
      expect(answer.citations.length, q).toBeGreaterThan(0);
    }
  });

  it("uses the digest when the fixture's sources were not retrieved", async () => {
    const answer = await answerQuestion("What's going on with KAN-17?", [], config, { fetch: noFetch, grok: null });
    expect(answer.provider).toBe("digest");
    expect(answer.reply).toContain("Grok isn't connected");
    expect(answer.citations[0].id).toBe("linear:KAN-17");
  });

  it("uses the digest (not fixtures) when data is live", async () => {
    const live = makeConfig({ GITHUB_TOKEN: "gh_test", LIQUID_INSIGHTS_ALLOW_FIXTURES: "false" });
    const fetch = mockFetch((url) =>
      url.includes("/check-runs")
        ? jsonResponse({ check_runs: [{ name: "build", status: "completed", conclusion: "success", html_url: "https://g/1", head_sha: "abcdef0", completed_at: "2026-09-25T00:00:00Z" }] })
        : jsonResponse([]),
    );
    const answer = await answerQuestion("Is the build passing?", [], live, { fetch, grok: fakeGrok(new Error("timeout")) });
    expect(answer.provider).toBe("digest");
    expect(answer.reply).toContain("didn't respond");
  });

  it("digest handles empty retrieval", () => {
    expect(digestAnswer([], "failed").reply).toContain("couldn't find anything");
  });
});

describe("createXaiClient", () => {
  it("calls xAI with JSON mode and retries without it on 400", async () => {
    const fetch = mockFetch((_url, init) => {
      const body = JSON.parse(String(init?.body));
      return body.response_format ? jsonResponse({ error: "bad" }, 400) : jsonResponse({ choices: [{ message: { content: " {\"reply\":\"x\"} " } }] });
    });
    const client = createXaiClient({ apiKey: "xai-test", model: "grok-x", timeoutMs: 1000, fetch });
    expect(await client.complete([{ role: "user", content: "hi" }])).toBe('{"reply":"x"}');
    expect(fetch.calls).toHaveLength(2);
    expect(fetch.calls[0].url).toBe("https://api.x.ai/v1/chat/completions");
    expect((fetch.calls[0].init!.headers as Record<string, string>).Authorization).toBe("Bearer xai-test");
  });

  it("propagates server errors and empty replies", async () => {
    const failing = createXaiClient({ apiKey: "k", model: "m", timeoutMs: 1000, fetch: mockFetch(() => jsonResponse({}, 503)) });
    await expect(failing.complete([])).rejects.toThrow("xai_503");
    const empty = createXaiClient({ apiKey: "k", model: "m", timeoutMs: 1000, fetch: mockFetch(() => jsonResponse({ choices: [] })) });
    await expect(empty.complete([])).rejects.toThrow("xai_empty_reply");
  });
});
