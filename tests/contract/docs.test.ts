/** "How does it work / why did we…": docs connector, ranking, channel rules and the answer path. */
import { beforeEach, describe, expect, it } from "vitest";
import { runDocsQuestion } from "../../server/docsQuestions.js";
import { answerQuestion } from "../../server/insights.js";
import { retrievalCache, TtlCache } from "../../server/retrieval/cache.js";
import { CODE_HEADER_PATHS, DOC_PATHS, leadingComment, loadDocCorpus, PUBLISHED_MARKER, rankSections, slugify, splitMarkdown, type DocSection } from "../../server/retrieval/docs.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import { detectTicketAction } from "../../server/actions/linearTransition.js";
import { queryTokens } from "../../server/retrieval/docs.js";
import { toMrkdwn } from "../../server/slack/format.js";
import { fakeGrok, jsonResponse, makeConfig, mockFetch } from "../helpers.js";

beforeEach(() => retrievalCache.clear());

const WRITE_POLICY = `# Write policy (agents vs humans)

Agents open PRs only.

## Human path

1. Human moves to In Progress.

\`\`\`bash
## not a heading inside a fence
\`\`\`

## Panic

Set WORKFLOW_ENABLED=false.
`;

const DECISION = `# 0003 — Plans are scored by a deterministic rubric

## Decision

The eval harness scores plans with fixed checks, not an LLM judge.

## Alternatives considered

LLM-as-judge was rejected for non-determinism.
`;

const ACCESS_TS = `/**
 * Access policy for the control plane. Every route that reads plans needs a
 * bearer token; webhooks are signature-checked and fail closed.
 */
import { createHash } from "node:crypto";
export const SECRET = "not-this";
`;

function fakeSources(opts: { linearDocs?: object[]; openSecurity?: object[]; merged?: object[] } = {}) {
  const searches: string[] = [];
  const fetch = mockFetch((url, init) => {
    if (url.startsWith("https://api.github.com/search/issues")) {
      const q = decodeURIComponent(new URL(url).searchParams.get("q") ?? "");
      searches.push(q);
      return jsonResponse({ items: q.includes("is:open") ? (opts.openSecurity ?? []) : (opts.merged ?? []) });
    }
    if (url.startsWith("https://api.github.com/repos/")) {
      const path = new URL(url).pathname;
      if (path.endsWith("/contents/docs/decisions")) {
        return path.includes("liquid-workflow")
          ? jsonResponse([
              { name: "0003-deterministic-eval-harness.md", type: "file", path: "docs/decisions/0003-deterministic-eval-harness.md" },
              { name: "notes.txt", type: "file", path: "docs/decisions/notes.txt" },
            ])
          : new Response("{}", { status: 404 });
      }
      if (path.endsWith("liquid-workflow/contents/WRITE-POLICY.md")) return new Response(WRITE_POLICY);
      if (path.endsWith("0003-deterministic-eval-harness.md")) return new Response(DECISION);
      if (path.endsWith("liquid-workflow/contents/src/access.ts")) return new Response(ACCESS_TS);
      return new Response("not found", { status: 404 });
    }
    if (url.startsWith("https://api.linear.app/graphql")) {
      expect(String(init?.body)).toContain("documents");
      return jsonResponse({ data: { documents: { nodes: opts.linearDocs ?? [] } } });
    }
    return undefined;
  });
  return { fetch, searches };
}

describe("docs parsing", () => {
  it("splits by ## headings, ignoring headings inside code fences", () => {
    const { title, sections } = splitMarkdown(WRITE_POLICY);
    expect(title).toBe("Write policy (agents vs humans)");
    expect(sections.map((s) => s.heading)).toEqual(["", "Human path", "Panic"]);
    expect(sections[1].body).toContain("## not a heading inside a fence");
  });

  it("slugifies like GitHub anchors and reads only the leading design comment", () => {
    expect(slugify("0003 — Plans are scored: by a rubric!")).toBe("0003--plans-are-scored-by-a-rubric");
    const comment = leadingComment(ACCESS_TS)!;
    expect(comment).toContain("Access policy for the control plane");
    expect(comment).not.toContain("not-this");
    expect(leadingComment("export const x = 1;")).toBeNull();
  });

  it("only reads allowlisted paths", () => {
    const all = [...DOC_PATHS.map((d) => d.path), ...CODE_HEADER_PATHS.map((d) => d.path)];
    expect(all.some((p) => /\.env|config\.ts$|secret/i.test(p))).toBe(false);
  });
});

describe("loadDocCorpus", () => {
  it("reads markdown, decision records and design comments, skipping missing files and published mirrors", async () => {
    const { fetch } = fakeSources({
      linearDocs: [
        { slugId: "abc123", title: "On-call runbook", url: "https://linear.app/doc/abc123", content: "## Paging\nPage the owner.", updatedAt: "2026-09-20T00:00:00Z" },
        {
          slugId: "mirror1",
          title: "0003 mirror",
          url: "https://linear.app/doc/mirror1",
          content: `${PUBLISHED_MARKER} [meridian-analytics/docs/handbook/00-start-here.md](https://github.com/gloverthomas/meridian-analytics/blob/main/docs/handbook/00-start-here.md). Edit it there; changes sync here automatically. · sync abcdef1234\n## Decision\nCopy.`,
          updatedAt: "2026-09-20T00:00:00Z",
        },
        {
          slugId: "manual1",
          title: "11 interview",
          url: "https://linear.app/doc/manual1",
          content: `${PUBLISHED_MARKER} meridian-analytics/docs/handbook/11.md · manual sync\n## SDK stops\nHumans merge.`,
          updatedAt: "2026-09-20T00:00:00Z",
        },
      ],
    });
    const corpus = await loadDocCorpus({ githubToken: "gh", linearApiKey: "lin", fetch });
    const ids = corpus.map((s) => s.id);
    expect(ids).toContain("docs:liquid-workflow/WRITE-POLICY.md#human-path");
    expect(ids).toContain("docs:liquid-workflow/docs/decisions/0003-deterministic-eval-harness.md#decision");
    expect(ids).toContain("docs:liquid-workflow/src/access.ts");
    expect(ids).toContain("docs:linear/abc123#paging");
    expect(ids.some((id) => id.includes("mirror1") || id.includes("notes.txt"))).toBe(false);
    expect(ids).toContain("docs:linear/manual1#sdk-stops");
    const decision = corpus.find((s) => s.id.endsWith("#decision"))!;
    expect(decision).toMatchObject({ isDecision: true, url: "https://github.com/gloverthomas/liquid-workflow/blob/main/docs/decisions/0003-deterministic-eval-harness.md#decision" });
  });

  it("throws when nothing at all can be read", async () => {
    const fetch = mockFetch(() => new Response("down", { status: 503 }));
    await expect(loadDocCorpus({ githubToken: null, linearApiKey: null, fetch })).rejects.toThrow("docs_unavailable");
  });
});

describe("rankSections", () => {
  const section = (id: string, heading: string, body: string, isDecision = false): DocSection => ({ id, source: "x", title: "T", heading, url: "https://x", body, updatedAt: null, isDecision });
  const corpus = [
    section("a", "Eval harness", "Deterministic rubric scores the plan.", false),
    section("b", "Decision", "We chose a deterministic eval harness over an LLM judge.", true),
    section("c", "Tunnel", "Cloudflare tunnel on a Mac."),
  ];

  it("ranks by relevance, favouring decision records for why-questions", () => {
    expect(rankSections("why a deterministic eval harness?", corpus).map((s) => s.id)).toEqual(["b", "a"]);
    expect(rankSections("how does the tunnel work?", corpus).map((s) => s.id)).toEqual(["c"]);
    expect(rankSections("the and how", corpus)).toEqual([]);
  });
});

describe("runDocsQuestion", () => {
  const config = makeConfig({ GITHUB_TOKEN: "gh", LINEAR_API_KEY: "lin" });
  const openPr = { number: 9, title: "Lock down token exposure", html_url: "https://github.com/gloverthomas/liquid-workflow/pull/9", state: "open", merged_at: null, updated_at: "2026-09-25T00:00:00Z", user: null, repository_url: "https://api.github.com/repos/gloverthomas/liquid-workflow" };

  it("includes open security PRs on the web", async () => {
    const { fetch, searches } = fakeSources({ openSecurity: [openPr] });
    const out = await runDocsQuestion("How is the workflow API secured with tokens?", config, fetch, "web", new TtlCache());
    expect(searches.some((q) => q.includes("is:open"))).toBe(true);
    expect(out.items.map((i) => i.citation.id)).toContain("github:PR:gloverthomas/liquid-workflow#9");
    expect(out.context).toContain("SECURITY IN FLIGHT: 1 open PR");
  });

  it("never searches or includes open security work from Slack, and says why", async () => {
    const { fetch, searches } = fakeSources({ openSecurity: [openPr] });
    const out = await runDocsQuestion("How is the workflow API secured with tokens?", config, fetch, "slack", new TtlCache());
    expect(searches.some((q) => q.includes("is:open"))).toBe(false);
    expect(out.items.map((i) => i.citation.id)).not.toContain("github:PR:gloverthomas/liquid-workflow#9");
    expect(out.context).toContain("only discussed in the Meridian Insights web app");
  });

  it("flags when no decision record explains a why-question", async () => {
    const { fetch } = fakeSources();
    const out = await runDocsQuestion("Why do we page the owner?", config, fetch, "web", new TtlCache());
    expect(out.context).toContain("RATIONALE: no decision record matched");
  });
});

describe("how-it-works answers", () => {
  it("routes explanatory questions, not stats or ticket questions", () => {
    for (const q of ["How does the human write gate work?", "Why did we build a deterministic eval harness?", "I'm new, where do I start?", "How are webhooks verified?"]) {
      expect(planRetrieval(q, []).intent, q).toBe("how_it_works");
    }
    expect(planRetrieval("How are our evals tracking?", []).intent).toBe("evals");
    expect(planRetrieval("Why did KAN-5 fail?", []).intent).toBe("issue_status");
    expect(planRetrieval("How many PRs merged this week?", []).intent).toBe("merged_prs");
  });

  it("answers with doc citations kept and rendered in Slack", async () => {
    const { fetch } = fakeSources();
    const id = "docs:liquid-workflow/docs/decisions/0003-deterministic-eval-harness.md#decision";
    const grok = fakeGrok(JSON.stringify({ reply: `**Plans are scored by fixed checks.** [${id}] [docs:made/up.md]`, citations: [id], relatedQuestions: ["a", "b", "c"] }));
    const answer = await answerQuestion("Why did we build a deterministic eval harness?", [], makeConfig({ GITHUB_TOKEN: "gh" }), { fetch, grok, channel: "web" });
    expect(answer.reply).toBe(`**Plans are scored by fixed checks.** [${id}]`);
    expect(answer.citations[0]).toMatchObject({ id, kind: "doc", status: "decision record" });
    expect(grok.calls[0].at(-1)!.content).toContain("ANSWER STYLE: explain");
    expect(toMrkdwn(answer.reply, answer.citations)).toContain("|[1]>");
  });

  it("doesn't mistake onboarding questions for ticket moves", () => {
    expect(detectTicketAction("I'm new, where do I start?")).toBeNull();
    expect(detectTicketAction("Start KAN-18")).toEqual({ issueIds: ["KAN-18"], targetState: "In Progress" });
    expect(planRetrieval("I'm new, where do I start?", []).intent).toBe("how_it_works");
  });

  it("expands question words to the words the docs use", () => {
    expect(queryTokens("How is the workflow API secured?")).toEqual(expect.arrayContaining(["workflow", "api", "secured", "security", "token", "auth", "access", "control", "plane"]));
  });

  it("draws a flow from the docs when the model omits one, and keeps a model flow when it is valid", async () => {
    const body = `# Write policy

## Human path

How the human write gate works, as a sequence.

1. Reporting posts the signal
2. Workflow opens a Todo
3. A human moves it to In Progress
`;
    const fetch = mockFetch((url) => {
      const path = new URL(url).pathname;
      if (url.includes("/search/issues")) return jsonResponse({ items: [] });
      if (path.endsWith("/liquid-workflow/contents/WRITE-POLICY.md")) return new Response(body);
      if (url.startsWith("https://api.linear.app/graphql")) return jsonResponse({ data: { documents: { nodes: [] } } });
      return new Response("not found", { status: 404 });
    });
    const config = makeConfig({ GITHUB_TOKEN: "gh", LINEAR_API_KEY: "lin" });
    const omitted = fakeGrok(JSON.stringify({ reply: "**A human starts the plan.**", citations: [], relatedQuestions: ["Can you visualise this with a diagram?"] }));
    const fromDocs = await answerQuestion("How does the human write gate work?", [], config, { fetch, grok: omitted, channel: "web", cache: new TtlCache() });
    expect(omitted.calls[0].at(-1)!.content).toContain("DIAGRAM:");
    expect(fromDocs.diagram?.nodes.map((node) => node.label)).toEqual([
      "Reporting posts the signal",
      "Workflow opens a Todo",
      "A human moves it to In Progress",
    ]);

    const modelFlow = {
      title: "Write gate",
      nodes: [
        { id: "n1", label: "Plan" },
        { id: "n2", label: "Approve" },
      ],
      edges: [{ from: "n1", to: "n2" }],
    };
    const supplied = fakeGrok(JSON.stringify({ reply: "**Approve, then implement.**", citations: [], diagram: modelFlow }));
    const fromModel = await answerQuestion("Can you visualise this with a diagram?", [{ role: "user", content: "How does the human write gate work?" }], config, {
      fetch,
      grok: supplied,
      channel: "web",
      cache: new TtlCache(),
    });
    expect(fromModel.diagram).toEqual(modelFlow);
    expect(supplied.calls[0].map((message) => message.content).join("\n")).toContain("How does the human write gate work?");
  });

  it("says so when no docs match", async () => {
    const { fetch } = fakeSources();
    const answer = await answerQuestion("How does the quantum flux capacitor work?", [], makeConfig({ GITHUB_TOKEN: "gh" }), { fetch, grok: fakeGrok("{}") });
    expect(answer.reply).toContain("couldn't find docs that cover that");
  });
});
