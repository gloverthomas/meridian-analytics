/**
 * Contract tests: mocked Linear GraphQL + GitHub REST → normalised retrieval
 * bundle. Asserts request shape, citation ids, and the context budget.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { TtlCache } from "../../server/retrieval/cache.js";
import { runRetrieval } from "../../server/retrieval/index.js";
import { fetchLinearIssues, normalizeLinearIssue, type LinearIssueNode } from "../../server/retrieval/linear.js";
import { latestPerCheck, normalizePull, type GithubCheckRun, type GithubPull } from "../../server/retrieval/github.js";
import { CONTEXT_CHAR_BUDGET } from "../../server/retrieval/rank.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import { jsonResponse, makeConfig, mockFetch } from "../helpers.js";

const NOW = Date.parse("2026-09-25T06:00:00Z");
const CORE = "gloverthomas/meridian-saas-core";
const REPORTING = "gloverthomas/meridian-saas-reporting";

const LIQ_24: LinearIssueNode = {
  identifier: "KAN-5",
  title: "AI Assistant parity",
  url: "https://linear.app/liquid/issue/KAN-5",
  priorityLabel: "Urgent",
  updatedAt: "2026-09-24T10:00:00Z",
  state: { name: "In Progress" },
  assignee: { displayName: "Tom Glover" },
  labels: { nodes: [{ name: "assistant" }] },
  description: "Reporting BFF lacks POST /api/v1/assistant/chat. Contact tom@example.com",
  comments: { nodes: [{ body: "token ghp_abcdefghijklmnopqrstuvwxyz0123 leaked", createdAt: "2026-09-24T11:00:00Z", user: { displayName: "Ana" } }] },
};

const LIQ_16: LinearIssueNode = { ...LIQ_24, identifier: "KAN-17", title: "Help centre parity", url: "https://linear.app/liquid/issue/KAN-17", description: null, comments: null };

function pull(number: number, title: string, mergedAt: string | null, repoUrl?: string): GithubPull {
  return {
    number,
    title,
    html_url: `https://github.com/x/pull/${number}`,
    state: mergedAt ? "closed" : "open",
    merged_at: mergedAt,
    updated_at: mergedAt ?? "2026-09-24T00:00:00Z",
    user: { login: "gloverthomas" },
    body: null,
    repository_url: repoUrl,
  };
}

const CHECKS: GithubCheckRun[] = [
  { name: "assistant-unit", status: "completed", conclusion: "failure", html_url: "https://github.com/c/1", head_sha: "dca645f3b1e2", completed_at: "2026-09-25T04:00:00Z" },
  { name: "assistant-unit", status: "completed", conclusion: "success", html_url: "https://github.com/c/2", head_sha: "dca645f3b1e2", completed_at: "2026-09-25T05:00:00Z" },
  { name: "build", status: "in_progress", conclusion: null, html_url: "https://github.com/c/3", head_sha: "dca645f3b1e2", completed_at: null, started_at: "2026-09-25T05:30:00Z" },
];

function linearRoute(url: string, init?: RequestInit) {
  if (!url.startsWith("https://api.linear.app/graphql")) return undefined;
  const { query } = JSON.parse(String(init?.body)) as { query: string };
  if (query.includes("issues(filter")) return jsonResponse({ data: { issues: { nodes: [LIQ_16, LIQ_24] } } });
  return jsonResponse({ data: { i0: LIQ_24 } });
}

function githubRoute(url: string) {
  if (!url.startsWith("https://api.github.com")) return undefined;
  if (url.includes("/search/issues")) {
    return jsonResponse({ items: [{ ...pull(5, "feat(KAN-5): AI Assistant chrome", null, `https://api.github.com/repos/${REPORTING}`), pull_request: { merged_at: null } }] });
  }
  if (url.includes("/check-runs")) return jsonResponse({ check_runs: CHECKS });
  if (url.includes(`/repos/${CORE}/pulls`)) {
    return jsonResponse([pull(5, "feat(KAN-5): AI Assistant rail", "2026-09-25T03:28:00Z"), pull(1, "ancient", "2026-06-01T00:00:00Z")]);
  }
  if (url.includes(`/repos/${REPORTING}/pulls`)) return jsonResponse([pull(2, "fix(KAN-17): Help centre", "2026-09-24T10:58:00Z")]);
  return undefined;
}

const LIVE_ENV = { LINEAR_API_KEY: "lin_test", GITHUB_TOKEN: "gh_test" };

describe("Linear connector", () => {
  it("sends the API key and aliased issue query, and normalises + redacts", async () => {
    const fetch = mockFetch(linearRoute);
    const nodes = await fetchLinearIssues(["KAN-5"], { apiKey: "lin_test", fetch, teamId: null, teamKey: "KAN" });
    const init = fetch.calls[0].init!;
    expect((init.headers as Record<string, string>).Authorization).toBe("lin_test");
    expect(JSON.parse(String(init.body)).variables).toEqual({ i0: "KAN-5" });

    const item = normalizeLinearIssue(nodes[0]);
    expect(item.citation).toMatchObject({ id: "linear:KAN-5", status: "In Progress", url: LIQ_24.url });
    expect(item.text.startsWith("[linear:KAN-5]")).toBe(true);
    expect(item.text).toContain("[email]");
    expect(item.text).toContain("[secret]");
    expect(item.text).not.toContain("tom@example.com");
  });

  it("throws on HTTP errors and total GraphQL failure, tolerates unknown ids", async () => {
    const deps = { apiKey: "k", teamId: null, teamKey: "KAN" };
    await expect(fetchLinearIssues(["KAN-1"], { ...deps, fetch: mockFetch(() => jsonResponse({}, 401)) })).rejects.toThrow("linear_401");
    await expect(fetchLinearIssues(["KAN-1"], { ...deps, fetch: mockFetch(() => jsonResponse({ errors: [{ message: "boom" }] })) })).rejects.toThrow("linear_graphql_error");
    const partial = await fetchLinearIssues(["KAN-1"], { ...deps, fetch: mockFetch(() => jsonResponse({ data: { i0: null }, errors: [{ message: "Entity not found" }] })) });
    expect(partial).toEqual([]);
    expect(await fetchLinearIssues([], { ...deps, fetch: mockFetch() })).toEqual([]);
  });
});

describe("GitHub connector", () => {
  it("keeps the latest run per check and normalises ids", () => {
    const latest = latestPerCheck(CHECKS);
    expect(latest.map((r) => [r.name, r.conclusion])).toEqual([
      ["assistant-unit", "success"],
      ["build", null],
    ]);
  });

  it("builds stable PR ids and extracts ticket mentions", () => {
    const item = normalizePull(CORE, pull(5, "feat(KAN-5): AI Assistant rail", "2026-09-25T03:28:00Z"));
    expect(item.citation.id).toBe(`github:PR:${CORE}#5`);
    expect(item.citation.status).toBe("merged");
    expect(item.mentions).toEqual(["KAN-5"]);
  });
});

describe("runRetrieval (live, mocked)", () => {
  let cache: TtlCache;
  beforeEach(() => {
    cache = new TtlCache(() => NOW);
  });

  it("golden: KAN-5 question yields the expected citation ids within budget", async () => {
    const fetch = mockFetch(linearRoute, githubRoute);
    const config = makeConfig(LIVE_ENV);
    const plan = planRetrieval("What's the status of KAN-5 and are there PRs?", config.github.repos);
    const outcome = await runRetrieval(plan, config, { fetch, cache, now: () => NOW });

    const ids = outcome.items.map((i) => i.citation.id);
    expect(ids.slice(0, 3)).toEqual(expect.arrayContaining(["linear:KAN-5", `github:PR:${CORE}#5`, `github:PR:${REPORTING}#5`]));
    expect(ids).not.toContain(`github:PR:${CORE}#1`); // outside the 14-day window
    expect(outcome.context.length).toBeLessThanOrEqual(CONTEXT_CHAR_BUDGET);
    expect(outcome.meta.connectorModes).toEqual({ linear: "live", github: "live" });

    const searchCall = fetch.calls.find((c) => c.url.includes("/search/issues"))!;
    expect(decodeURIComponent(searchCall.url)).toContain(`"KAN-5" is:pr repo:${CORE} repo:${REPORTING}`);
    expect((searchCall.init!.headers as Record<string, string>).Authorization).toBe("Bearer gh_test");
  });

  it("caches connector calls between turns", async () => {
    const fetch = mockFetch(linearRoute, githubRoute);
    const config = makeConfig(LIVE_ENV);
    const plan = planRetrieval("Is assistant-unit passing?", config.github.repos);
    await runRetrieval(plan, config, { fetch, cache, now: () => NOW });
    const first = fetch.calls.length;
    await runRetrieval(plan, config, { fetch, cache, now: () => NOW });
    expect(fetch.calls.length).toBe(first);
  });

  it("marks a failing configured connector unavailable instead of using samples", async () => {
    const fetch = mockFetch(githubRoute, () => jsonResponse({}, 500));
    const config = makeConfig(LIVE_ENV);
    const outcome = await runRetrieval(planRetrieval("status of KAN-5", config.github.repos), config, { fetch, cache, now: () => NOW });
    expect(outcome.meta.connectorModes.linear).toBe("unavailable");
    expect(outcome.items.some((i) => i.connector === "linear")).toBe(false);
    expect(outcome.items.length).toBeGreaterThan(0);
  });

  it("uses sample data without keys, and nothing when fixtures are disabled", async () => {
    const fetch = mockFetch();
    const sample = await runRetrieval(planRetrieval("Are assistant failures increasing?", makeConfig().github.repos), makeConfig(), { fetch, cache });
    expect(sample.meta.connectorModes).toEqual({ linear: "sample", github: "sample", posthog: "sample" });
    // Every sample item is tagged inline, right after its citation id, exactly once.
    for (const item of sample.items) {
      expect(item.text.startsWith(`[${item.citation.id}]`)).toBe(true);
      expect(item.text.match(/SAMPLE DATA/g)).toHaveLength(1);
    }
    expect(fetch.calls).toHaveLength(0);

    const off = makeConfig({ LIQUID_INSIGHTS_ALLOW_FIXTURES: "false" });
    const none = await runRetrieval(planRetrieval("status of KAN-5", off.github.repos), off, { fetch, cache });
    expect(none.items).toEqual([]);
    expect(none.meta.connectorModes).toEqual({ linear: "unavailable", github: "unavailable" });
  });
});

describe("linearCounts", () => {
  it("tallies states overall and per label, deduping ids", async () => {
    const { linearCounts } = await import("../../server/retrieval/index.js");
    const mk = (id: string, state: string, labels: string[]) => normalizeLinearIssue({ ...LIQ_16, identifier: id, state: { name: state }, labels: { nodes: labels.map((name) => ({ name })) } });
    const text = linearCounts([mk("KAN-1", "Done", ["Bug"]), mk("KAN-2", "Done", ["Bug"]), mk("KAN-3", "In Progress", ["Bug"]), mk("KAN-5", "Todo", []), mk("KAN-1", "Done", ["Bug"])])!;
    expect(text).toContain("over the 4 most recently updated");
    expect(text).toContain("All issues by state: Done 2, In Progress 1, Todo 1");
    expect(text).toContain('Label "Bug" by state: Done 2, In Progress 1 (KAN-1, KAN-2, KAN-3)');
    expect(linearCounts([])).toBeNull();
  });
});

describe("githubCounts", () => {
  it("counts merged PRs per repo inside the window and lists open ones", async () => {
    const { githubCounts } = await import("../../server/retrieval/index.js");
    const items = [
      normalizePull(REPORTING, pull(10, "a", "2026-09-25T00:00:00Z")),
      normalizePull(REPORTING, pull(9, "b", "2026-09-24T00:00:00Z")),
      normalizePull(REPORTING, pull(10, "a", "2026-09-25T00:00:00Z")),
      normalizePull(REPORTING, pull(1, "old", "2026-08-01T00:00:00Z")),
      normalizePull(REPORTING, pull(4, "wip", null)),
    ];
    const text = githubCounts(items, 7, NOW)!;
    expect(text).toContain(`${REPORTING}: merged in last 7 days 2 (#10, #9); open PRs retrieved 1 (#4)`);
    expect(githubCounts([], 7, NOW)).toBeNull();
  });
});
