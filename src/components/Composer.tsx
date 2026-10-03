import { ArrowRight } from "lucide-react";
import { useId, useLayoutEffect, useRef, type FormEvent, type KeyboardEvent } from "react";
import { MESSAGE_MAX_CHARS } from "../../shared/contracts";
import { isValidMessage } from "../hooks/useInsightsChat";

interface ComposerProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (value: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}

const COUNTER_THRESHOLD = 1_600;

export function Composer({ value, onChange, onSubmit, disabled = false, autoFocus = false, placeholder }: ComposerProps) {
  const inputId = useId();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const canSend = !disabled && isValidMessage(value);
  const over = value.trim().length > MESSAGE_MAX_CHARS;

  // Auto-grow up to the CSS max-height.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
    // Only show a scrollbar once the CSS max-height clamps the box.
    el.style.overflowY = el.scrollHeight > el.clientHeight + 1 ? "auto" : "hidden";
  }, [value]);

  const submit = (event?: FormEvent) => {
    event?.preventDefault();
    if (canSend) onSubmit(value);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) submit(event);
  };

  return (
    <form className="composer" onSubmit={submit} role="search">
      <label htmlFor={inputId} className="visually-hidden">
        Ask about tickets, bugs, PRs and delivery trends
      </label>
      <textarea
        id={inputId}
        ref={textareaRef}
        rows={1}
        value={value}
        autoFocus={autoFocus}
        placeholder={placeholder ?? "Ask about tickets, bugs, PRs or CI…"}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        aria-invalid={over || undefined}
      />
      {value.length > COUNTER_THRESHOLD ? (
        <span className="composer-meta" data-over={over} aria-live="polite">
          {value.trim().length}/{MESSAGE_MAX_CHARS}
        </span>
      ) : null}
      <button type="submit" className="ask-button" disabled={!canSend}>
        <span className="ask-label">Ask</span>
        <ArrowRight size={18} aria-hidden="true" />
        <span className="visually-hidden">Send question</span>
      </button>
    </form>
  );
}
