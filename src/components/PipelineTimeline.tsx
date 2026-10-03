import { Check, Circle, CircleDot, MinusCircle, X } from "lucide-react";
import type { PipelineTimeline as Timeline, TimelineStep } from "../../shared/contracts";

const ICON: Record<TimelineStep["status"], typeof Check> = {
  done: Check,
  current: CircleDot,
  failed: X,
  pending: Circle,
  skipped: MinusCircle,
};

const STATUS_LABEL: Record<TimelineStep["status"], string> = {
  done: "Done",
  current: "Now",
  failed: "Failed",
  pending: "Not yet",
  skipped: "Skipped",
};

function when(at: string | null): string | null {
  if (!at) return null;
  const d = new Date(at);
  return Number.isNaN(d.getTime()) ? null : d.toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function safeHref(url: string | null): string | undefined {
  if (!url) return undefined;
  try {
    const u = new URL(url);
    return u.protocol === "https:" ? u.href : undefined;
  } catch {
    return undefined;
  }
}

/** A ticket's journey through the Cursor workflow, left to right (stacks on phones). */
export function PipelineTimeline({ timeline }: { timeline: Timeline }) {
  return (
    <figure className="pipeline" aria-label={`${timeline.issueId} pipeline`}>
      <figcaption className="chart-head">
        <span className="chart-title">
          {timeline.issueId} pipeline <span className="pipeline-state">{timeline.state}</span>
        </span>
        <span className="chart-sub">{timeline.title}</span>
      </figcaption>
      <ol className="pipeline-steps">
        {timeline.steps.map((step) => {
          const Icon = ICON[step.status];
          const href = safeHref(step.url);
          const label = (
            <>
              <span className="pipeline-label">{step.label}</span>
              <span className="pipeline-detail">{step.detail}</span>
              {when(step.at) ? <time className="pipeline-time">{when(step.at)}</time> : null}
            </>
          );
          return (
            <li key={step.key} className="pipeline-step" data-status={step.status} aria-current={step.status === "current" ? "step" : undefined}>
              <span className="pipeline-dot" aria-hidden="true">
                <Icon size={12} strokeWidth={3} />
              </span>
              <span className="visually-hidden">{STATUS_LABEL[step.status]}: </span>
              {href ? (
                <a className="pipeline-body" href={href} target="_blank" rel="noopener noreferrer">
                  {label}
                </a>
              ) : (
                <span className="pipeline-body">{label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </figure>
  );
}
