# 0002 — Every claim cited; numbers come from the server

- **Status:** Accepted · recorded 2026-09-26

## Context

Early answers miscounted ("18 bugs" when there were 11) and occasionally cited sources that weren't retrieved. For a tool people use to make decisions, a confident wrong number is worse than no answer.

## Decision

- Grok must cite retrieved ids inline. `grok/parseResponse.ts` **drops any id that wasn't retrieved**, from both the citation list and the text, and numbers sources in order of first appearance. Invalid JSON gets one repair attempt, then falls back.
- **Counts are computed by the server**, not the model: LINEAR / PR / SENTRY / EVAL COUNTS blocks and chart COMPARISON lines are put in the context, and the system prompt allows numbers only from those blocks.
- Things we don't track are stated as **NOT TRACKED** rather than guessed.
- Fallbacks never contradict the sources: without Grok, the reply is a plain list of the top sources (`provider: "digest"`).

## Consequences

- Answers are checkable: every number and claim leads to a source or a server-computed figure.
- A new kind of number needs a new COUNTS block; until then the model is told not to state it.

## Alternatives considered

- **Trusting the model to count** — tried; it was wrong often enough to matter.

## Where it lives

`server/prompts/system.ts`, `server/grok/parseResponse.ts`, `server/charts.ts`, `server/retrieval/*` (COUNTS builders).
