import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatResponse } from "../../shared/contracts";
import type { ThreadEntry } from "../hooks/useInsightsChat";
import { ActionProposal } from "./ActionProposal";
import { tidyStreaming } from "../lib/markdown";
import { AnswerMarkdown } from "./AnswerMarkdown";
import { Chart } from "./Chart";
import { FlowDiagram } from "./FlowDiagram";
import { PipelineTimeline } from "./PipelineTimeline";
import { CitationList } from "./CitationList";
import { PromptPills } from "./PromptPills";
import { SourcesAccordion } from "./SourcesAccordion";

interface ChatThreadProps {
  entries: ThreadEntry[];
  isSending: boolean;
  /** Real progress steps for the in-flight question, when known. */
  progress?: string[];
  /** The in-flight answer as it's written (streamed). */
  streaming?: string;
  /** Set when the last question never got an answer (e.g. the page was reloaded mid-request). */
  interruptedQuestion?: string;
  onAsk: (query: string) => void;
  onRetry: (query: string) => void;
  onConfirmAction: (entryId: string) => Promise<string | null>;
  onDismissAction: (entryId: string) => void;
}

/** Used only until the server's real steps arrive (or if that call fails). */
const FALLBACK_STAGES = ["Gathering sources…", "Ranking the most relevant sources…", "Writing the answer…"];
const STAGE_INTERVAL_MS = 1_200;

function sourceBadge(response: ChatResponse) {
  const modes = Object.values(response.retrievalMeta.connectorModes);
  if (response.provider === "digest") return <span className="badge badge-digest">Sources only</span>;
  if (modes.includes("sample")) return <span className="badge badge-sample">Sample data</span>;
  return <span className="badge badge-live">Live data</span>;
}

interface AssistantCardProps {
  entryId: string;
  response: ChatResponse;
  onAsk: (q: string) => void;
  disabled: boolean;
  /** Proposals are only actionable on the newest answer. */
  isLatest: boolean;
  onConfirmAction: (entryId: string) => Promise<string | null>;
  onDismissAction: (entryId: string) => void;
}

function AssistantCard({ entryId, response, onAsk, disabled, isLatest, onConfirmAction, onDismissAction }: AssistantCardProps) {
  const anchorPrefix = `src-${entryId}`;
  const citationIndex = useMemo(() => new Map(response.citations.map((c, i) => [c.id, i + 1])), [response.citations]);
  const followUps = response.relatedQuestions.map((q, i) => ({ id: `${entryId}-f${i}`, label: q, query: q }));

  return (
    <article className="answer" aria-label="Meridian Insights answer">
      <header className="answer-head">
        <img className="answer-mark" src="/brand/liquid-mark.png" alt="" width={20} height={20} />
        <span>Meridian Insights</span>
        {sourceBadge(response)}
      </header>
      <AnswerMarkdown text={response.reply} citationIndex={citationIndex} anchorPrefix={anchorPrefix} />
      {response.timeline ? <PipelineTimeline timeline={response.timeline} /> : null}
      {response.diagram ? <FlowDiagram diagram={response.diagram} /> : null}
      {response.charts?.map((chart) => <Chart key={chart.id} chart={chart} />)}
      {response.proposedAction && isLatest ? (
        <ActionProposal
          action={response.proposedAction}
          onConfirm={() => onConfirmAction(entryId)}
          onCancel={() => onDismissAction(entryId)}
          disabled={disabled}
        />
      ) : null}
      <CitationList citations={response.citations} anchorPrefix={anchorPrefix} />
      {followUps.length ? (
        <section className="followups" aria-label="Suggested follow-ups">
          <h3 className="section-label">Ask next</h3>
          <PromptPills items={followUps} onPick={onAsk} disabled={disabled} label={undefined} />
        </section>
      ) : null}
      <SourcesAccordion response={response} />
    </article>
  );
}

function PendingCard({ steps }: { steps?: string[] }) {
  const stages = steps?.length ? steps : FALLBACK_STAGES;
  const [stage, setStage] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStage((s) => s + 1), STAGE_INTERVAL_MS);
    return () => clearInterval(timer);
  }, []);
  // Hold on the last step (usually the write-up) until the answer lands.
  const current = stages[Math.min(stage, stages.length - 1)];
  return (
    <div className="answer pending" aria-busy="true">
      <p className="pending-status" role="status">
        <LoaderCircle size={14} aria-hidden="true" />
        {current}
      </p>
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
      <div className="skeleton" />
    </div>
  );
}

const NO_CITATIONS: ReadonlyMap<string, number> = new Map();

/** The answer while Grok writes it. Citation numbers appear when the final, validated answer lands. */
function StreamingCard({ text }: { text: string }) {
  return (
    <article className="answer streaming" aria-label="Meridian Insights answer, being written" aria-busy="true" aria-live="off">
      <header className="answer-head">
        <img className="answer-mark" src="/brand/liquid-mark.png" alt="" width={20} height={20} />
        <span>Meridian Insights</span>
        <span className="badge badge-writing">Writing…</span>
      </header>
      <AnswerMarkdown text={tidyStreaming(text)} citationIndex={NO_CITATIONS} anchorPrefix="streaming" />
    </article>
  );
}

export function ChatThread({ entries, isSending, progress, streaming, interruptedQuestion, onAsk, onRetry, onConfirmAction, onDismissAction }: ChatThreadProps) {
  const threadRef = useRef<HTMLElement>(null);

  // Keep the latest question pinned at the top so its answer reads beneath it.
  useEffect(() => {
    const questions = threadRef.current?.querySelectorAll(".turn-user");
    questions?.[questions.length - 1]?.scrollIntoView?.({ behavior: "smooth", block: "start" });
  }, [entries.length, isSending]);

  return (
    <section ref={threadRef} className="thread" aria-label="Conversation" aria-live="polite">
      {entries.map((entry) => {
        if (entry.role === "user") {
          return (
            <p key={entry.id} className="turn-user">
              {entry.content}
            </p>
          );
        }
        if (entry.role === "assistant") {
          return (
            <AssistantCard
              key={entry.id}
              entryId={entry.id}
              response={entry.response}
              onAsk={onAsk}
              disabled={isSending}
              isLatest={entry === entries.at(-1)}
              onConfirmAction={onConfirmAction}
              onDismissAction={onDismissAction}
            />
          );
        }
        return (
          <div key={entry.id} className="error-card" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <div>
              <p>{entry.message}</p>
              <button type="button" className="text-button" onClick={() => onRetry(entry.retryOf)} disabled={isSending}>
                Try again
              </button>
            </div>
          </div>
        );
      })}
      {interruptedQuestion ? (
        <div className="error-card" role="status">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <p>This question didn't get an answer. The page may have been closed while it was loading.</p>
            <button type="button" className="text-button" onClick={() => onRetry(interruptedQuestion)}>
              Ask again
            </button>
          </div>
        </div>
      ) : null}
      {isSending ? streaming ? <StreamingCard text={streaming} /> : <PendingCard steps={progress} /> : null}
    </section>
  );
}
