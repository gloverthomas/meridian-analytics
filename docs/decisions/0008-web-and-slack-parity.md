# 0008 — Every capability ships to web and Slack

- **Status:** Accepted · recorded 2026-09-26

## Context

With two channels (0006), features added to one would quietly go missing from the other.

## Decision

Both channels share `server/chatTurn.ts`, so new intents, connectors and prompt changes reach both automatically. Two kinds of change need work in both places:

1. **A new part of the answer** (a new `ChatResponse` field, like `timeline`): a web component **and** a renderer in `server/slack/format.ts`.
2. **A new action kind**: web dispatch **and** a mapping in `runAction` in `server/slack/handler.ts`, gated by the Slack approver allowlist.

Deliberately web-only: the "How this was built" details, the history sidebar and the "What can I ask?" panel (Slack answers "what can I ask?" as a question instead).

## Consequences

- Reviewers should ask "does this work in Slack?" for any change to the answer shape.

## Where it lives

`server/chatTurn.ts`, `server/slack/format.ts`, `server/slack/handler.ts`.
