# 0003 — Actions are rule-detected and confirm-gated with signed 5-minute tokens

- **Status:** Accepted · recorded 2026-09-26

## Context

Insights can change things: move a Linear ticket to In Progress (which starts a Cursor plan) and approve a plan (which starts implementation). A model should never decide to do either, and a click in one place shouldn't be replayable as a different action.

## Decision

- **Detection is rules only** (`detectTicketAction`), and plan approvals are offered only when the plan's eval passed. Grok never triggers an action.
- A proposal returns a **signed token** (HMAC with the session secret) naming the exact ticket, target state and **action kind** (`linear_transition` or `workflow_implement`), valid for **5 minutes**. Each confirm endpoint rejects tokens of the other kind.
- On confirm, the server **re-checks** the ticket's team and current state, performs the change with a separate write-scoped Linear key (`LINEAR_ACTIONS_API_KEY`), and adds an **audit comment** naming where it was confirmed. Replays are no-ops (the state already changed).
- Moves are limited to `LIQUID_ACTIONS_ALLOWED_STATES` (default: In Progress) and to the configured team, at 10 confirmations per minute per IP.
- Approve & implement first records the approval with liquid-workflow (`POST /approve`, actor `liquid-insights`), then moves the ticket to In Review. The workflow still enforces its own eval, CI and write gates.

## Consequences

- Anyone with the access code can move tickets and approve plans on the web; in Slack only allowlisted approvers can (0006). Share the code accordingly.
- An expired or refused confirmation becomes "Try again", which asks afresh for a new token.

## Alternatives considered

- **Letting Grok call a "move ticket" tool** — rejected (0001).
- **One generic action token** — rejected after review: a move token could have been replayed as an approval.

## Where it lives

`server/actions/*`, `src/components/ActionProposal.tsx`, `server/slack/handler.ts`.
