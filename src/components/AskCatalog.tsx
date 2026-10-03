import { ArrowUpRight, ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import { ASK_CATALOG } from "../../shared/askCatalog";

interface AskCatalogProps {
  onAsk: (query: string) => void;
  disabled?: boolean;
}

/** "What can I ask?" — every topic Insights covers, each with questions that ask on click. */
export function AskCatalog({ onAsk, disabled = false }: AskCatalogProps) {
  const [open, setOpen] = useState(false);
  const panelId = useId();
  return (
    <section className="catalog" aria-label="What can I ask?">
      <button type="button" className="catalog-toggle" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((v) => !v)}>
        What can I ask?
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open ? (
        <div id={panelId} className="catalog-grid">
          {ASK_CATALOG.map((topic) => (
            <section key={topic.id} className="catalog-topic" aria-labelledby={`${panelId}-${topic.id}`}>
              <header>
                <span className="catalog-source mono">{topic.sources}</span>
                <h2 id={`${panelId}-${topic.id}`}>{topic.title}</h2>
              </header>
              <p>{topic.blurb}</p>
              <ul>
                {topic.examples.map((q) => (
                  <li key={q}>
                    <button type="button" className="catalog-q" onClick={() => onAsk(q)} disabled={disabled}>
                      <span>{q}</span>
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : null}
    </section>
  );
}
