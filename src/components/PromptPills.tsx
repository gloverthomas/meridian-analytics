import { ArrowUpRight } from "lucide-react";

export interface PillItem {
  id: string;
  label: string;
  query: string;
}

interface PromptPillsProps {
  items: PillItem[];
  onPick: (query: string) => void;
  disabled?: boolean;
  label?: string;
  className?: string;
}

/** Prefill-and-send pills (spec: prefill+send for demo speed). */
export function PromptPills({ items, onPick, disabled = false, label, className = "" }: PromptPillsProps) {
  if (!items.length) return null;
  return (
    <ul className={`pills ${className}`.trim()} aria-label={label ?? "Suggested questions"}>
      {label ? (
        <li className="pills-label" aria-hidden="true">
          {label}
        </li>
      ) : null}
      {items.map((item) => (
        <li key={item.id}>
          <button type="button" className="pill" onClick={() => onPick(item.query)} disabled={disabled} title={item.query}>
            {item.label}
            <ArrowUpRight size={14} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}
