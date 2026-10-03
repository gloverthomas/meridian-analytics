/**
 * Sample Linear data (shape = Linear GraphQL nodes) used when LINEAR_API_KEY is
 * not configured. Narrative mirrors the Liquid demo: KAN-5 is the hero defect.
 */
import type { LinearActivityNode, LinearIssueNode } from "../retrieval/linear.js";
import { daysAgo } from "./time.js";

const TEAM_URL = "https://meridian-bank.atlassian.net/browse";

export function sampleLinearIssues(): LinearIssueNode[] {
  return [
    {
      identifier: "KAN-5",
      title: "AI Assistant works on Core but chat is missing on Reporting",
      url: `${TEAM_URL}/KAN-5`,
      priorityLabel: "Urgent",
      updatedAt: daysAgo(0.4),
      state: { name: "In Progress", type: "started" },
      assignee: { displayName: "Tom Glover" },
      labels: { nodes: [{ name: "bug" }, { name: "assistant" }, { name: "parity" }] },
      description:
        "The AI Assistant rail answers finance questions on Core via the BFF (POST /api/v1/assistant/chat → Grok). Reporting ships the same rail chrome, but the Reporting BFF has no /api/v1/assistant/chat route, so the rail falls back to a canned error. Customers on the Reporting app see an assistant that cannot answer. Fix: add the chat route to the Reporting BFF, reusing Core's fail-closed pattern.",
      comments: {
        nodes: [
          {
            body: "Core side merged in PR #5 (Grok chat). Reporting PR #5 intentionally ships the chrome with the BFF miss so we can demo the parity gap.",
            createdAt: daysAgo(0.6),
            user: { displayName: "Tom Glover" },
          },
          {
            body: "assistant-unit is green on both repos, but it only covers the UI — no contract test hits the Reporting BFF yet.",
            createdAt: daysAgo(0.5),
            user: { displayName: "Tom Glover" },
          },
        ],
      },
    },
    {
      identifier: "KAN-18",
      title: "Notifications panel opens differently in Reporting",
      url: `${TEAM_URL}/KAN-18`,
      priorityLabel: "High",
      updatedAt: daysAgo(1),
      state: { name: "In Review", type: "started" },
      assignee: { displayName: "Tom Glover" },
      labels: { nodes: [{ name: "bug" }, { name: "parity" }] },
      description: "Reporting opens Notifications as a full page; Core uses the drawer. Align Reporting with Core and add a cross-repo test.",
      comments: { nodes: [] },
    },
    {
      identifier: "KAN-17",
      title: "Help centre parity between Core and Reporting",
      url: `${TEAM_URL}/KAN-17`,
      priorityLabel: "Medium",
      updatedAt: daysAgo(1.5),
      state: { name: "In Review", type: "started" },
      assignee: { displayName: "Tom Glover" },
      labels: { nodes: [{ name: "parity" }, { name: "help" }] },
      description: "Reporting fix merged; Core still needs the cross-app Help test (help-proof screenshots).",
      comments: { nodes: [] },
    },
    {
      identifier: "KAN-16",
      title: "Create Invoice / Reports should deep-link to #revenue-summary",
      url: `${TEAM_URL}/KAN-16`,
      priorityLabel: "Medium",
      updatedAt: daysAgo(2),
      state: { name: "In Review", type: "started" },
      assignee: null,
      labels: { nodes: [{ name: "parity" }, { name: "navigation" }] },
      description: "Retarget quick actions on Core to #revenue-summary so they land on the same section as Reporting.",
      comments: { nodes: [] },
    },
    {
      identifier: "KAN-6",
      title: "Legacy #sales-summary deep links break in Reporting",
      url: `${TEAM_URL}/KAN-6`,
      priorityLabel: "Low",
      updatedAt: daysAgo(2.5),
      state: { name: "In Review", type: "started" },
      assignee: null,
      labels: { nodes: [{ name: "bug" }, { name: "navigation" }] },
      description: "Alias legacy #sales-summary anchors to Revenue summary in Reporting; point Core Reports link at #revenue-summary.",
      comments: { nodes: [] },
    },
    {
      identifier: "KAN-22",
      title: "Assistant related questions sometimes empty",
      url: `${TEAM_URL}/KAN-22`,
      priorityLabel: "Low",
      updatedAt: daysAgo(3),
      state: { name: "Todo", type: "unstarted" },
      assignee: null,
      labels: { nodes: [{ name: "assistant" }] },
      description: "When Grok omits relatedQuestions the rail shows no follow-ups. Fall back to fixture prompts.",
      comments: { nodes: [] },
    },
    {
      identifier: "KAN-13",
      title: "Dashboard dead space under content",
      url: `${TEAM_URL}/KAN-13`,
      priorityLabel: "Low",
      updatedAt: daysAgo(0.8),
      state: { name: "Done", type: "completed" },
      assignee: { displayName: "Tom Glover" },
      labels: { nodes: [{ name: "ui" }] },
      description: "Fixed in Core PR #9 and Reporting PR #9.",
      comments: { nodes: [] },
    },
  ];
}

/** Sample created/completed dates for "opened vs closed" charts, derived from the sample tickets. */
export function sampleLinearActivity(nowMs = Date.now()): LinearActivityNode[] {
  return sampleLinearIssues().map((issue, i) => ({
    identifier: issue.identifier,
    createdAt: daysAgo(3 + i * 4, nowMs),
    completedAt: issue.state?.type === "completed" ? issue.updatedAt : null,
    labels: issue.labels ?? null,
  }));
}
