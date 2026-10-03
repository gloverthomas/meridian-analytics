import { describe, expect, it } from "vitest";
import { buildCharts, ciHistory, describeChart, makeBuckets, openedVsClosed, prsPerDay, ticketsByState } from "../../server/charts.js";
import { normalizeLinearIssue } from "../../server/retrieval/linear.js";
import { normalizePull } from "../../server/retrieval/github.js";
import { planRetrieval } from "../../server/retrieval/router.js";

// Fri 25 Sep 2026, 14:00 in Sydney (04:00 UTC).
const NOW = Date.parse("2026-09-25T04:00:00Z");
const TZ = "Australia/Sydney";
const CORE = "gloverthomas/meridian-saas-core";
const REPORTING = "gloverthomas/meridian-saas-reporting";

const pr = (repo: string, n: number, mergedAt: string | null) =>
  normalizePull(repo, { number: n, title: `pr ${n}`, html_url: "https://g", state: mergedAt ? "closed" : "open", merged_at: mergedAt, updated_at: mergedAt ?? "2026-09-25T00:00:00Z", user: null });

const issue = (id: string, state: string, labels: string[] = []) =>
  normalizeLinearIssue({ identifier: id, title: id, url: "https://l", updatedAt: "2026-09-24T00:00:00Z", state: { name: state }, labels: { nodes: labels.map((name) => ({ name })) } });

describe("makeBuckets", () => {
  it("buckets by local day in the configured time zone", () => {
    const b = makeBuckets(7, NOW, TZ);
    expect(b.unit).toBe("day");
    expect(b.labels).toHaveLength(7);
    expect(b.labels.at(-1)).toMatch(/Fri 25/);
    // 22:58 UTC on the 24th is 08:58 on Fri 25 in Sydney.
    expect(b.indexOf("2026-09-24T22:58:00Z")).toBe(6);
    expect(b.indexOf("2026-09-10T00:00:00Z")).toBe(-1);
    expect(b.indexOf(null)).toBe(-1);
  });

  it("switches to weeks past 14 days", () => {
    const b = makeBuckets(28, NOW, TZ);
    expect(b.unit).toBe("week");
    expect(b.labels).toHaveLength(4);
    expect(b.indexOf("2026-09-24T00:00:00Z")).toBe(3);
    expect(b.indexOf("2026-08-01T00:00:00Z")).toBe(-1);
  });
});

describe("chart builders", () => {
  it("counts merged PRs per day per repo, ignoring open PRs", () => {
    const items = [pr(CORE, 1, "2026-09-25T02:00:00Z"), pr(CORE, 2, "2026-09-25T03:00:00Z"), pr(REPORTING, 3, "2026-09-24T01:00:00Z"), pr(REPORTING, 4, null)];
    const chart = prsPerDay(items, [CORE, REPORTING], 7, NOW, TZ, false)!;
    expect(chart.series.map((s) => [s.name, s.values.reduce((a, v) => a + v, 0)])).toEqual([
      ["Core", 2],
      ["Reporting", 1],
    ]);
    expect(chart.series.map((s) => s.color)).toEqual(["series1", "series2"]);
    expect(prsPerDay([], [CORE], 7, NOW, TZ, false)).toBeNull();
  });

  it("stacks tickets by status, splitting bugs when labels exist", () => {
    const chart = ticketsByState([issue("KAN-1", "Done", ["Bug"]), issue("KAN-2", "Done"), issue("KAN-3", "Todo"), issue("KAN-5", "Blocked")], false)!;
    expect(chart.categories).toEqual(["Todo", "Done", "Blocked"]);
    expect(chart.series.map((s) => [s.name, s.values])).toEqual([
      ["Bugs", [0, 1, 0]],
      ["Other tickets", [1, 1, 1]],
    ]);
    expect(ticketsByState([issue("KAN-1", "Done")], true)!.series.map((s) => s.name)).toEqual(["Tickets"]);
    expect(ticketsByState([], false)).toBeNull();
  });

  it("compares opened vs closed per week, optionally bugs only", () => {
    const activity = [
      { identifier: "A", createdAt: "2026-09-24T00:00:00Z", completedAt: "2026-09-25T00:00:00Z", labels: { nodes: [{ name: "Bug" }] } },
      { identifier: "B", createdAt: "2026-09-24T00:00:00Z", completedAt: null, labels: { nodes: [] } },
    ];
    const all = openedVsClosed(activity, 7, NOW, TZ, false, false)!;
    expect(all.categories).toHaveLength(4);
    expect(all.series.map((s) => s.values.reduce((a, v) => a + v, 0))).toEqual([2, 1]);
    expect(describeChart(all)).toContain("COMPARISON (use this; do not recompute): Opened 2 is MORE than Closed 1, difference 1.");
    const bugs = openedVsClosed(activity, 7, NOW, TZ, true, false)!;
    expect(describeChart(bugs)).toContain("Opened 1 is EQUAL to Closed 1");
    expect(bugs.title).toMatch(/^Bugs/);
    expect(bugs.series.map((s) => s.values.reduce((a, v) => a + v, 0))).toEqual([1, 1]);
  });

  it("counts passed vs failed, per job when a check is named", () => {
    const runs = [
      { repo: CORE, createdAt: "2026-09-25T01:00:00Z", conclusion: "success", jobConclusion: "success" },
      { repo: CORE, createdAt: "2026-09-25T02:00:00Z", conclusion: "failure", jobConclusion: "success" },
      { repo: REPORTING, createdAt: "2026-09-24T02:00:00Z", conclusion: "failure", jobConclusion: "failure" },
      { repo: REPORTING, createdAt: "2026-09-24T03:00:00Z", conclusion: null, jobConclusion: null },
    ];
    const workflow = ciHistory(runs, 7, NOW, TZ, null, false)!;
    expect(workflow.series.map((s) => [s.name, s.color, s.values.reduce((a, v) => a + v, 0)])).toEqual([
      ["Passed", "good", 1],
      ["Failed", "critical", 2],
    ]);
    const job = ciHistory(runs, 7, NOW, TZ, "assistant-unit", false)!;
    expect(job.title).toBe("assistant-unit results per day");
    expect(job.series.map((s) => s.values.reduce((a, v) => a + v, 0))).toEqual([2, 1]);
  });

  it("builds only the charts the plan asks for and describes them for Grok", () => {
    const plan = planRetrieval("How many PRs merged per day this week?", [CORE]);
    const charts = buildCharts(plan, { items: [pr(CORE, 1, "2026-09-25T02:00:00Z")], sample: { linear: false, github: true } }, NOW, TZ, false);
    expect(charts.map((c) => c.id)).toEqual(["prs_per_day"]);
    expect(charts[0].sample).toBe(true);
    expect(describeChart(charts[0])).toMatch(/^CHART "PRs merged per day" .*SAMPLE DATA.*Totals: Core 1/);
    expect(buildCharts(planRetrieval("status of KAN-5", [CORE]), { items: [], sample: { linear: false, github: false } }, NOW, TZ, false)).toEqual([]);
  });
});

describe("chart routing", () => {
  const R = [CORE, REPORTING];
  it.each([
    ["How many PRs merged per day this week, Core vs Reporting?", ["prs_per_day"]],
    ["Show our Linear tickets by status", ["tickets_by_state"]],
    ["How many Linear bugs are in Todo vs Done?", ["tickets_by_state"]],
    ["Are we closing bugs faster than we open them?", ["opened_vs_closed"]],
    ["How often has assistant-unit failed over the last 2 weeks?", ["ci_history"]],
    ["What's the status of KAN-5?", []],
    ["Is assistant-unit passing on Core main?", []],
  ])("%s → %j", (q, charts) => {
    expect(planRetrieval(q, R).charts).toEqual(charts);
  });

  it("reads 'last N weeks' and names the check", () => {
    const plan = planRetrieval("How often has assistant-unit failed over the last 2 weeks?", R);
    expect(plan.sinceDays).toBe(14);
    expect(plan.checkName).toBe("assistant-unit");
    expect(planRetrieval("last three weeks of CI history", R).sinceDays).toBe(21);
  });
});
