/**
 * Structured logs with an allowlist of fields. Message text, API keys, comment
 * bodies and diffs must never be passed here — use `messageLength` instead.
 */

const ALLOWED_FIELDS = new Set([
  "requestId",
  "route",
  "status",
  "provider",
  "connectors",
  "connectorModes",
  "latencyMs",
  "grok_error",
  "error",
  "connector_error",
  "messageLength",
  "itemCount",
  "truncated",
  "via",
  "service",
  "host",
  "port",
  "mode",
  "origin",
  "forwardedHost",
  "fetchSite",
]);

const MAX_ERROR_CHARS = 80;

export function logEvent(event: string, fields: Record<string, unknown> = {}): void {
  const safe: Record<string, unknown> = { event };
  for (const [key, value] of Object.entries(fields)) {
    if (!ALLOWED_FIELDS.has(key)) continue;
    safe[key] = typeof value === "string" ? value.slice(0, MAX_ERROR_CHARS) : value;
  }
  console.info(JSON.stringify(safe));
}

export function errorCode(error: unknown): string {
  return error instanceof Error ? error.message.slice(0, MAX_ERROR_CHARS) : "unknown";
}
