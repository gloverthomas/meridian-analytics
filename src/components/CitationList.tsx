import { BookOpen, Bot, Bug, CircleCheck, CircleDot, GitPullRequest, LineChart, Ticket } from "lucide-react";
import type { Citation } from "../../shared/contracts";
import { statusTone } from "../lib/status";

interface CitationListProps {
  citations: Citation[];
  anchorPrefix: string;
}

const KIND_ICON = {
  linear_issue: Ticket,
  github_pr: GitPullRequest,
  github_check: CircleCheck,
  posthog_insight: LineChart,
  sentry_issue: Bug,
  workflow_run: Bot,
  doc: BookOpen,
} as const;

const KIND_LABEL = {
  linear_issue: "Linear",
  github_pr: "GitHub PR",
  github_check: "CI check",
  posthog_insight: "PostHog",
  sentry_issue: "Sentry",
  workflow_run: "Cursor workflow",
  doc: "Docs",
} as const;

/** Only http(s) links are rendered as links; anything else is shown as plain text. */
function safeHref(url: string): string | undefined {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "http:" ? parsed.href : undefined;
  } catch {
    return undefined;
  }
}

export function CitationList({ citations, anchorPrefix }: CitationListProps) {
  if (!citations.length) return null;
  return (
    <section className="sources" aria-label="Sources">
      <h3 className="section-label">Sources</h3>
      <ol className="source-list">
        {citations.map((citation, i) => {
          const Icon = KIND_ICON[citation.kind] ?? CircleDot;
          const href = safeHref(citation.url);
          const content = (
            <>
              <span className="source-num" aria-hidden="true">
                {i + 1}
              </span>
              <Icon size={14} aria-label={KIND_LABEL[citation.kind]} />
              <span className="source-title">{citation.title}</span>
              {citation.status ? (
                <span className="source-status" data-tone={statusTone(citation.status)}>
                  {citation.status}
                </span>
              ) : null}
            </>
          );
          return (
            <li key={citation.id}>
              {href ? (
                <a id={`${anchorPrefix}-${i + 1}`} className="source" href={href} target="_blank" rel="noopener noreferrer" title={citation.id}>
                  {content}
                </a>
              ) : (
                <span id={`${anchorPrefix}-${i + 1}`} className="source" title={citation.id}>
                  {content}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
