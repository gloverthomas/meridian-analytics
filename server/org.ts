import type { Organisation, SuggestedPrompt } from "../shared/contracts.js";

export const DEFAULT_ORG: Organisation = { id: "org_liquid_coffee", name: "Liquid Coffee Co.", role: "Viewer" };

/** MVP ships a single org; the switcher UI is ready for more. */
export const ORGS: Organisation[] = [DEFAULT_ORG];

export const SUGGESTED_PROMPTS: SuggestedPrompt[] = [
  { id: "new-chat-file", label: "Where New chat lives", query: "Where does Reporting New chat live in the code?" },
  { id: "signal-vs-plan", label: "Does /signal start the agent?", query: "Does the product signal start a Cursor SDK plan?" },
  { id: "who-merges", label: "Who is allowed to merge?", query: "Who is allowed to merge?" },
  { id: "grok-vs-sdk", label: "Grok or the SDK?", query: "Where does Grok run, and where does the Cursor SDK start?" },
  { id: "sdk-facilitate", label: "How the SDK runs", query: "How does the Cursor SDK facilitate the workflow?" },
  { id: "signal-path", label: "Walk the signal path", query: "Walk the signal-to-SDK path in full" },
  { id: "signal-flow", label: "Show the signal flow", query: "Walk the signal-to-SDK path and visualise it with a diagram" },
  { id: "one-cursor-key", label: "One Cursor key?", query: "Does every engineer use their own Cursor key?" },
  { id: "liq-24", label: "Open KAN-5 status", query: "What's the status of KAN-5 and are there PRs?" },
];
