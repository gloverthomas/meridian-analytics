import { describe, expect, it } from "vitest";
import { ASK_CATALOG, isHelpQuestion } from "../../shared/askCatalog.js";
import { answerQuestion } from "../../server/insights.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import { detectTicketAction } from "../../server/actions/linearTransition.js";
import { makeConfig, mockFetch } from "../helpers.js";

const REPOS = ["gloverthomas/meridian-saas-core", "gloverthomas/meridian-saas-reporting"];

describe("isHelpQuestion", () => {
  it("matches help-style questions only", () => {
    for (const q of ["What can I ask?", "what can you do", "help", "?", "What questions can I ask here?", "How do I use this?"]) expect(isHelpQuestion(q)).toBe(true);
    for (const q of ["Can you help me with KAN-5?", "What can we do about failing CI?", "What merged this week?"]) expect(isHelpQuestion(q)).toBe(false);
  });
});

describe("ASK_CATALOG", () => {
  it("every example routes somewhere specific (not the generic fallback)", () => {
    for (const topic of ASK_CATALOG) {
      for (const q of topic.examples) {
        const plan = planRetrieval(q, REPOS);
        const routed = detectTicketAction(q) !== null || plan.intent !== "general" || plan.wantsPosthog;
        expect(routed, q).toBe(true);
      }
    }
  });
});

describe("help answer", () => {
  it("answers deterministically without calling any connector", async () => {
    const fetch = mockFetch();
    const answer = await answerQuestion("What can I ask?", [], makeConfig({ LINEAR_API_KEY: "lin", XAI_API_KEY: "xai" }), { fetch, grok: null });
    expect(answer.provider).toBe("digest");
    expect(answer.reply).toContain("Cursor workflow");
    expect(fetch.calls).toHaveLength(0);
  });
});
