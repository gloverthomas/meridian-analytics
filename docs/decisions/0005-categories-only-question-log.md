# 0005 — The question log records categories, never text

- **Status:** Accepted · recorded 2026-09-26

## Context

We wanted to answer "what are people asking Insights?" to improve it. But questions can contain customer names, ticket details or anything else someone types.

## Decision

Each question sends one PostHog event (`insights_question`) with **categories only**: topic (intent), answer style, chart kinds, sources used, answer type, outcome, latency, citation count, time window and channel (`web` / `slack`). It never includes the question text, ticket ids, names or the session cookie. The viewer id is an anonymous hash, and person profiles are disabled.

- Written with the public `phc_` project token; read back with a personal key using one fixed HogQL query.
- Because the write token is public, spoofed events are possible, so reads only count known topics, answer types and outcomes.
- End-to-end tests and CI blank the keys so test runs never pollute the log.

## Consequences

- We can see what *kinds* of questions people ask and which fail, but not the wording. Improving the router means reproducing phrasings ourselves.
- A privacy test fails if any new property is added to the event without updating its allowlist.

## Alternatives considered

- **Logging full questions** — most useful, but a data-handling liability we don't need.

## Where it lives

`server/telemetry.ts`, `server/retrieval/insightsUsage.ts`, `tests/contract/questionLog.test.ts`.
