/**
 * The one definition of an inline citation token, e.g. [linear:KAN-5] or
 * [docs:liquid-workflow/WRITE-POLICY.md#human-path]. Used by answer validation,
 * the web renderer and the Slack formatter, so a new source prefix is added once.
 */
export const CITATION_PREFIXES = ["linear", "github", "posthog", "sentry", "workflow", "docs"] as const;

/** Source string for a token, capturing the id (without brackets). */
export const CITATION_TOKEN_SOURCE = `\\[((?:${CITATION_PREFIXES.join("|")}):[^\\]\\s]+)\\]`;

/** A fresh global regex (global regexes are stateful, so don't share one instance). */
export const citationTokenRegex = (): RegExp => new RegExp(CITATION_TOKEN_SOURCE, "g");
