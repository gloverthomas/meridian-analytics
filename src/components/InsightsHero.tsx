import type { SuggestedPrompt } from "../../shared/contracts";
import { AskCatalog } from "./AskCatalog";
import { Composer } from "./Composer";
import { PromptPills } from "./PromptPills";

interface InsightsHeroProps {
  draft: string;
  onDraftChange: (value: string) => void;
  onAsk: (query: string) => void;
  prompts: SuggestedPrompt[];
  disabled: boolean;
}

export function InsightsHero({ draft, onDraftChange, onAsk, prompts, disabled }: InsightsHeroProps) {
  return (
    <section className="hero" aria-labelledby="hero-heading">
      <h1 id="hero-heading" className="hero-title reveal reveal-2">
        What do you want <em>to know?</em>
      </h1>
      <p className="hero-sub reveal reveal-2">Plain-English answers about tickets, pull requests, CI and product analytics, with a source for every claim.</p>
      <div className="reveal reveal-3">
        <Composer value={draft} onChange={onDraftChange} onSubmit={onAsk} disabled={disabled} autoFocus />
      </div>
      <div className="reveal reveal-4">
        <PromptPills items={prompts} onPick={onAsk} disabled={disabled} label="Try asking" className="pills-hero" />
      </div>
      <div className="reveal reveal-4">
        <AskCatalog onAsk={onAsk} disabled={disabled} />
      </div>
    </section>
  );
}
