import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { rankSections, splitMarkdown, type DocSection } from "../../server/retrieval/docs.js";

const markdown = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../../docs/handbook/28-codebase-file-walk.md"), "utf8");

function sections(): DocSection[] {
  const { title, sections: parts } = splitMarkdown(markdown);
  return parts.map(({ heading, body }) => ({
    id: heading,
    source: "handbook/28-codebase-file-walk.md",
    title,
    heading,
    url: "https://example.test/28",
    body,
    updatedAt: null,
    isDecision: false,
  }));
}

describe("codebase file walk ranking", () => {
  const corpus = sections();

  it("puts the matching section first for the starter questions", () => {
    const cases: Array<[string, string]> = [
      ["Where does Reporting New chat live in the code?", "Where does New chat live in the code"],
      ["Does the product signal start a Cursor SDK plan?", "Does the product signal start a Cursor SDK plan"],
      ["Who is allowed to merge?", "Who is allowed to merge"],
      ["What does BugBot do on an open PR?", "What does BugBot do"],
      ["Where do credentials live for the workflow?", "Where do credentials live"],
      ["Is the eval harness an MCP?", "Is the eval an MCP"],
      ["Which models does the planner use, and who writes code?", "Which models and who writes code"],
      ["How is the signal kick off the SDK workflow?", "How the signal kick off starts the SDK workflow"],
      ["How is the sginal kick off the SDK workflow?", "How the signal kick off starts the SDK workflow"],
      ["Walk the signal-to-SDK path in full", "Walk the signal to SDK path in full"],
      ["How does the Cursor SDK facilitate the workflow?", "How does the Cursor SDK facilitate the workflow"],
      ["Does every engineer use their own Cursor key?", "Does every engineer use their own Cursor key"],
      ["What would we need to do to ensure this is ready for enterprise?", "What would we need to be enterprise ready"],
    ];
    for (const [question, heading] of cases) {
      const top = rankSections(question, corpus, 3);
      expect(top[0]?.heading, question).toBe(heading);
    }
  });
});
