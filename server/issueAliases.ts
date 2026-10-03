/**
 * Legacy Liquid demo ticket ids → Meridian Jira-style keys used in fixtures and live demos.
 * Lets rehearse scripts that still say "LIQ-24" resolve to KAN-5 in retrieval and moves.
 */
const LEGACY_LIQ_TO_KAN: Record<string, string> = {
  "LIQ-24": "KAN-5",
  "LIQ-17": "KAN-18",
  "LIQ-16": "KAN-17",
  "LIQ-15": "KAN-16",
  "LIQ-9": "KAN-6",
  "LIQ-21": "KAN-22",
  "LIQ-12": "KAN-13",
};

export function normalizeIssueId(id: string): string {
  const upper = id.toUpperCase();
  return LEGACY_LIQ_TO_KAN[upper] ?? upper;
}

export function normalizeIssueIds(ids: string[]): string[] {
  return [...new Set(ids.map(normalizeIssueId))];
}
