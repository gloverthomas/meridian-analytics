import { ArrowRight, LoaderCircle, Ticket } from "lucide-react";
import { useState } from "react";
import type { ProposedAction } from "../../shared/contracts";

interface ActionProposalProps {
  action: ProposedAction;
  /** Resolves to an inline error message, or null on success. */
  onConfirm: () => Promise<string | null>;
  onCancel: () => void;
  disabled?: boolean;
}

/** The only way a ticket changes state from Meridian Insights: an explicit click here. */
export function ActionProposal({ action, onConfirm, onCancel, disabled = false }: ActionProposalProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirm = async () => {
    setBusy(true);
    setError(null);
    const message = await onConfirm();
    setBusy(false);
    setError(message);
  };

  return (
    <section className="proposal" aria-label={action.kind === "workflow_implement" ? `Confirm approving ${action.issueId}` : `Confirm moving ${action.issueId}`}>
      <p className="proposal-change">
        <Ticket size={16} aria-hidden="true" />
        <span className="proposal-id mono">{action.issueId}</span>
        <span className="proposal-state">{action.fromState}</span>
        <ArrowRight size={14} aria-hidden="true" />
        <span className="proposal-state proposal-state-to">{action.toState}</span>
      </p>
      <p className="proposal-title">{action.issueTitle}</p>
      {action.kind === "workflow_implement" ? (
        <p className="proposal-note">Records your approval with the workflow and moves the ticket to In Review. Cursor then implements after its eval and CI gates; PRs still need a human to merge.</p>
      ) : null}
      <div className="proposal-actions">
        <button type="button" className="ask-button" onClick={confirm} disabled={busy || disabled}>
          {busy ? <LoaderCircle size={16} className="spin" aria-hidden="true" /> : null}
          {busy ? (action.kind === "workflow_implement" ? "Approving…" : "Moving…") : action.kind === "workflow_implement" ? "Approve & implement" : `Move to ${action.toState}`}
        </button>
        <button type="button" className="text-button" onClick={onCancel} disabled={busy}>
          Cancel
        </button>
      </div>
      {error ? (
        <p className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </section>
  );
}
