import { describe, expect, it } from "vitest";
import { createApp } from "../../server/app.js";
import { progressSteps } from "../../server/progress.js";
import { makeConfig, mockFetch, postJson } from "../helpers.js";

const LIVE = makeConfig({ XAI_API_KEY: "xai-test", LINEAR_API_KEY: "lin", GITHUB_TOKEN: "gh", POSTHOG_PERSONAL_API_KEY: "phx", POSTHOG_PROJECT_ID: "1" });

describe("progressSteps", () => {
  it("names the ticket, the PR search and Grok for a status question", () => {
    expect(progressSteps("What's the status of KAN-5 and are there PRs?", LIVE)).toEqual([
      "Reading KAN-5 in Linear…",
      "Checking GitHub merged PRs and PRs mentioning KAN-5…",
      "Ranking the most relevant sources…",
      "Asking Grok to write it up…",
    ]);
  });

  it("includes CI history, PostHog and the charts only when the question needs them", () => {
    const ci = progressSteps("How often has assistant-unit failed over the last 2 weeks?", LIVE);
    expect(ci).toContain("Checking GitHub merged PRs, CI checks and assistant-unit run history…");
    expect(ci).toContain("Building a chart: CI results over time…");
    expect(ci.some((s) => s.includes("PostHog"))).toBe(false);

    const usage = progressSteps("Is AI Assistant usage going up?", LIVE);
    expect(usage).toContain("Pulling product analytics from PostHog…");
    expect(usage).toContain("Building a chart: AI Assistant messages…");
  });

  it("describes ticket moves without retrieval or Grok", () => {
    expect(progressSteps("Move KAN-18 to In Progress", LIVE)).toEqual(["Looking up KAN-18 in Linear…", "Checking its current status…", "Preparing a confirmation…"]);
    expect(progressSteps("can we move tickets to in progress?", LIVE)[0]).toBe("Checking which tickets can be moved…");
  });

  it("flags sample data and a missing Grok key honestly", () => {
    const steps = progressSteps("What's the status of KAN-5?", makeConfig());
    expect(steps[0]).toBe("Reading KAN-5 in Linear (sample data)…");
    expect(steps.at(-1)).toBe("Putting the answer together…");
  });

  it("is served by an authenticated endpoint that validates the message", async () => {
    const app = createApp({ config: LIVE, grok: null, fetch: mockFetch() });
    const ctx = { ip: "1.1.1.1", requestId: "r", path: "/api/v1/insights/progress" };
    const ok = await app(postJson(ctx.path, { message: "Move KAN-18 to In Progress" }), ctx);
    expect((await ok.json()).steps[0]).toBe("Looking up KAN-18 in Linear…");
    expect((await app(postJson(ctx.path, { message: "x" }), ctx)).status).toBe(400);
    expect((await app(postJson(ctx.path, { message: "hello" }, { Authorization: "" }), ctx)).status).toBe(401);
  });
});
