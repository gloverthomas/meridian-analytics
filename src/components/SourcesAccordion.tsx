import { ChevronRight } from "lucide-react";
import type { ChatResponse } from "../../shared/contracts";

const CONNECTOR_NAMES: Record<string, string> = { linear: "Linear", github: "GitHub", posthog: "PostHog", sentry: "Sentry", workflow: "Cursor workflow", docs: "Docs" };

function providerLabel(provider: ChatResponse["provider"]): string {
  if (provider === "fixture") return "Sample answer (Grok not used)";
  if (provider === "digest") return "Source list (Grok not used)";
  if (provider === "action") return "Ticket action (rules, no AI; changes need your confirmation)";
  return `Grok · ${provider.slice("grok:".length)}`;
}

/** "How this was built": retrieval summary only — never raw JSON. */
export function SourcesAccordion({ response }: { response: ChatResponse }) {
  const { retrievalMeta: meta } = response;
  return (
    <details className="how">
      <summary>
        <ChevronRight size={12} aria-hidden="true" />
        How this was built
      </summary>
      <dl>
        <dt>Answered by</dt>
        <dd>{providerLabel(response.provider)}</dd>
        <dt>Searched</dt>
        <dd>
          {meta.connectors.map((c) => `${CONNECTOR_NAMES[c] ?? c} (${meta.connectorModes[c] ?? "unknown"})`).join(", ")}
        </dd>
        <dt>Window</dt>
        <dd>{meta.window}</dd>
        <dt>Items read</dt>
        <dd>
          {meta.itemCount}
          {meta.truncated ? " (trimmed to fit)" : ""}
        </dd>
        <dt>Time</dt>
        <dd>{(response.latencyMs / 1000).toFixed(1)}s</dd>
      </dl>
    </details>
  );
}
