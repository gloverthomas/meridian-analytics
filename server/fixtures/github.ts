/**
 * Sample GitHub data (shape = GitHub REST payloads) used when GITHUB_TOKEN is not
 * configured. Titles/numbers mirror the real demo repos; dates are relative.
 */
import type { GithubCheckRun, GithubPull, GithubWorkflowRun } from "../retrieval/github.js";
import { daysAgo } from "./time.js";

const CORE = "gloverthomas/meridian-saas-core";
const REPORTING = "gloverthomas/meridian-saas-reporting";

type PullSeed = [number, string, "merged" | "open", number];

const PULLS: Record<string, PullSeed[]> = {
  [CORE]: [
    [10, "Add Vitest + RTL AI Assistant unit tests", "merged", 0.3],
    [9, "Fix dashboard dead space under content", "merged", 0.32],
    [8, "Pin AI Assistant to viewport height", "merged", 0.33],
    [7, "Dock assistant under nav; simplify chrome", "merged", 0.34],
    [6, "Polish AI Assistant UX for demo", "merged", 0.35],
    [5, "feat(KAN-5): AI Assistant rail with Grok chat", "merged", 0.4],
    [4, "test(KAN-18): expect Notifications to open in both apps", "open", 1],
    [3, "test(KAN-17): Help opens in Core and Reporting", "open", 1.5],
    [2, "fix(KAN-16): retarget Create Invoice / Reports to #revenue-summary", "open", 2],
    [1, "fix(KAN-6): deep-link Reports to #revenue-summary", "open", 2.5],
  ],
  [REPORTING]: [
    [10, "Add Vitest + RTL AI Assistant unit tests", "merged", 0.3],
    [9, "Fix reporting dead space under content", "merged", 0.32],
    [8, "Pin AI Assistant to viewport height", "merged", 0.33],
    [7, "Dock assistant under nav; simplify chrome", "merged", 0.34],
    [6, "Polish AI Assistant UX (Reporting drift shell)", "merged", 0.35],
    [5, "feat(KAN-5): AI Assistant chrome with intentional BFF miss", "merged", 0.4],
    [4, "fix(KAN-18): open Reporting Notifications the same way as Core", "open", 1],
    [3, "chore: visual proof screenshots for UI PRs", "merged", 1.4],
    [2, "fix(KAN-17): Help centre parity with Core", "merged", 1.45],
    [1, "fix(KAN-6): alias legacy #sales-summary to Revenue summary", "open", 2.5],
  ],
};

const CHECKS: Record<string, { sha: string; names: string[] }> = {
  [CORE]: { sha: "dca645f3b1e2", names: ["build", "assistant-unit", "smoke", "parity-proof"] },
  [REPORTING]: { sha: "27d98784c0aa", names: ["build", "assistant-unit", "help-proof"] },
};

export function samplePulls(repo: string): GithubPull[] {
  return (PULLS[repo] ?? []).map(([number, title, state, age]) => ({
    number,
    title,
    html_url: `https://github.com/${repo}/pull/${number}`,
    state: state === "merged" ? "closed" : "open",
    merged_at: state === "merged" ? daysAgo(age) : null,
    updated_at: daysAgo(age),
    user: { login: "gloverthomas" },
    body: null,
  }));
}

export function sampleCheckRuns(repo: string): GithubCheckRun[] {
  const seed = CHECKS[repo];
  if (!seed) return [];
  return seed.names.map((name, i) => ({
    name,
    status: "completed",
    conclusion: "success",
    html_url: `https://github.com/${repo}/commit/${seed.sha}/checks`,
    head_sha: seed.sha,
    completed_at: daysAgo(0.29 - i * 0.001),
  }));
}

/** One sample CI run per sample merged PR (all green, as the real repos are). */
export function sampleWorkflowRuns(repo: string): GithubWorkflowRun[] {
  return samplePulls(repo)
    .filter((pull) => pull.merged_at)
    .map((pull) => ({
      id: pull.number,
      name: "CI",
      status: "completed",
      conclusion: "success",
      created_at: pull.merged_at!,
      head_branch: "main",
      html_url: `https://github.com/${repo}/actions`,
    }));
}
