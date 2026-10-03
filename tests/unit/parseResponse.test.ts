import { describe, expect, it } from "vitest";
import { parseGrokResponse } from "../../server/grok/parseResponse.js";

const known = new Set(["linear:KAN-5", "github:PR:gloverthomas/meridian-saas-core#5"]);

describe("parseGrokResponse", () => {
  it("parses a well-formed JSON answer", () => {
    const raw = JSON.stringify({
      reply: "**KAN-5 is In Progress** [linear:KAN-5]",
      citations: ["linear:KAN-5"],
      relatedQuestions: ["a", "b", "c", "d"],
    });
    const parsed = parseGrokResponse(raw, known);
    expect(parsed).toEqual({
      reply: "**KAN-5 is In Progress** [linear:KAN-5]",
      citationIds: ["linear:KAN-5"],
      relatedQuestions: ["a", "b", "c"],
      diagram: null,
    });
  });

  it("keeps a usable flow and drops a malformed one without failing the answer", () => {
    const good = JSON.stringify({
      reply: "The signal opens a ticket, then a human starts the plan.",
      diagram: {
        title: "Signal to SDK",
        nodes: [
          { id: "n1", label: "Reporting posts /signal" },
          { id: "N2", label: "`Workflow` opens a Todo" },
        ],
        edges: [{ from: "n1", to: "n2" }],
      },
    });
    expect(parseGrokResponse(good, known)?.diagram).toEqual({
      title: "Signal to SDK",
      nodes: [
        { id: "n1", label: "Reporting posts /signal" },
        { id: "n2", label: "Workflow opens a Todo" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    });
    const bad = JSON.stringify({ reply: "Still an answer.", diagram: { title: "Broken", nodes: [{ id: "n1", label: "only one" }] } });
    expect(parseGrokResponse(bad, known)?.diagram).toBeNull();
    expect(parseGrokResponse(bad, known)?.reply).toBe("Still an answer.");
  });

  it("strips markdown fences", () => {
    const raw = '```json\n{"reply":"ok","citations":[],"relatedQuestions":[]}\n```';
    expect(parseGrokResponse(raw, known)?.reply).toBe("ok");
  });

  it("recovers a JSON object wrapped in prose", () => {
    const raw = 'Sure! Here you go: {"reply":"ok","citations":[]} Hope that helps.';
    expect(parseGrokResponse(raw, known)?.reply).toBe("ok");
  });

  it("returns null for malformed output", () => {
    expect(parseGrokResponse("not json at all", known)).toBeNull();
    expect(parseGrokResponse("{broken", known)).toBeNull();
    expect(parseGrokResponse("[1,2]", known)).toBeNull();
    expect(parseGrokResponse('{"reply":"   "}', known)).toBeNull();
  });

  it("drops hallucinated citation ids from the list and the reply text", () => {
    const raw = JSON.stringify({
      reply: "Fixed in [github:PR:gloverthomas/meridian-saas-core#99] and tracked in [linear:KAN-5]",
      citations: ["linear:KAN-1000", { id: "[github:PR:gloverthomas/meridian-saas-core#5]" }, 42],
    });
    const parsed = parseGrokResponse(raw, known);
    expect(parsed?.reply).toBe("Fixed in and tracked in [linear:KAN-5]");
    expect(parsed?.citationIds).toEqual(["linear:KAN-5", "github:PR:gloverthomas/meridian-saas-core#5"]);
  });

  it("ignores non-string related questions", () => {
    const raw = JSON.stringify({ reply: "ok", relatedQuestions: ["  one  ", 2, null, ""] });
    expect(parseGrokResponse(raw, known)?.relatedQuestions).toEqual(["one"]);
  });
});
