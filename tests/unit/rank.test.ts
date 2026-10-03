import { describe, expect, it } from "vitest";
import { dedupe, packContext, rankItems } from "../../server/retrieval/rank.js";
import { planRetrieval } from "../../server/retrieval/router.js";
import type { RetrievedItem } from "../../server/retrieval/types.js";

const NOW = Date.parse("2026-09-25T00:00:00Z");

function item(id: string, kind: RetrievedItem["citation"]["kind"], text: string, extra: Partial<RetrievedItem> = {}): RetrievedItem {
  return {
    connector: kind.startsWith("linear") ? "linear" : "github",
    citation: { id, kind, title: id, url: `https://example.test/${id}` },
    text: `[${id}] ${text}`,
    updatedAt: "2026-09-24T00:00:00Z",
    mentions: [],
    ...extra,
  };
}

describe("rankItems", () => {
  it("puts exact ticket matches first", () => {
    const plan = planRetrieval("status of KAN-5", ["o/core"]);
    const ranked = rankItems([item("linear:KAN-1", "linear_issue", "other"), item("linear:KAN-5", "linear_issue", "hero", { mentions: ["KAN-5"] })], plan, NOW);
    expect(ranked[0].citation.id).toBe("linear:KAN-5");
  });

  it("boosts checks for CI questions and penalises unmerged PRs for merge questions", () => {
    const ci = planRetrieval("is the build failing", ["o/core"]);
    const rankedCi = rankItems([item("github:PR:o/core#1", "github_pr", "pr"), item("github:check:o/core@a:build", "github_check", "check")], ci, NOW);
    expect(rankedCi[0].citation.kind).toBe("github_check");

    const merged = planRetrieval("what merged", ["o/core"]);
    const open = item("github:PR:o/core#2", "github_pr", "open");
    open.citation.status = "open";
    const done = item("github:PR:o/core#3", "github_pr", "done", { updatedAt: "2026-09-01T00:00:00Z" });
    done.citation.status = "merged";
    expect(rankItems([open, done], merged, NOW)[0].citation.id).toBe("github:PR:o/core#3");
  });

  it("filters toward requested Linear states", () => {
    const plan = planRetrieval("which tickets are in todo", ["o/core"]);
    const todo = item("linear:KAN-2", "linear_issue", "a", { updatedAt: "2026-08-01T00:00:00Z" });
    todo.citation.status = "Todo";
    const done = item("linear:KAN-3", "linear_issue", "b");
    done.citation.status = "Done";
    expect(rankItems([done, todo], plan, NOW)[0].citation.id).toBe("linear:KAN-2");
  });

  it("dedupes by id keeping the richer text", () => {
    const short = item("linear:KAN-5", "linear_issue", "short");
    const long = item("linear:KAN-5", "linear_issue", "much longer detail text");
    expect(dedupe([short, long])).toEqual([long]);
  });
});

describe("packContext", () => {
  it("respects the character budget and keeps citation ids on partial items", () => {
    const items = Array.from({ length: 5 }, (_, i) => item(`linear:KAN-${i}`, "linear_issue", "x".repeat(400)));
    const packed = packContext(items, 1_000);
    expect(packed.context.length).toBeLessThanOrEqual(1_000);
    expect(packed.truncated).toBe(true);
    expect(packed.included.map((i) => i.citation.id)).toEqual(["linear:KAN-0", "linear:KAN-1"]);
    expect(packed.context.split("\n").every((line) => line.startsWith("[linear:"))).toBe(true);
  });

  it("includes a partial item when enough room remains", () => {
    const items = [item("a:1", "linear_issue", "y".repeat(500)), item("a:2", "linear_issue", "z".repeat(500))];
    const packed = packContext(items, 800);
    expect(packed.included).toHaveLength(2);
    expect(packed.context.endsWith("…")).toBe(true);
  });

  it("is not truncated when everything fits", () => {
    const packed = packContext([item("a:1", "linear_issue", "small")], 1_000);
    expect(packed.truncated).toBe(false);
  });
});

describe("problems ranking", () => {
  it("lifts bugs, failed checks and fix PRs inside the window; sinks stale items", () => {
    const plan = planRetrieval("What issues have we had this week?", ["o/core"]);
    const bug = item("linear:KAN-2", "linear_issue", "bug", { labels: ["Bug"], updatedAt: "2026-09-23T00:00:00Z" });
    const failed = item("github:check:o/core@a:build", "github_check", "check", { updatedAt: "2026-09-24T00:00:00Z" });
    failed.citation.status = "failure";
    const fix = item("github:PR:o/core#3", "github_pr", "pr", { updatedAt: "2026-09-24T00:00:00Z" });
    fix.citation.title = "fix: broken deep link";
    const stale = item("linear:KAN-1", "linear_issue", "old", { labels: ["Bug"], updatedAt: "2026-08-01T00:00:00Z" });
    const plain = item("linear:KAN-6", "linear_issue", "chore", { updatedAt: "2026-09-24T00:00:00Z" });
    const ranked = rankItems([plain, stale, fix, bug, failed], plan, NOW).map((i) => i.citation.id);
    expect(ranked[0]).toBe("github:check:o/core@a:build");
    expect(ranked.indexOf("linear:KAN-2")).toBeLessThan(ranked.indexOf("linear:KAN-6"));
    expect(ranked.at(-1)).toBe("linear:KAN-1");
  });
});

