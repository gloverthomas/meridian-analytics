# 0001 — The server retrieves; Grok only writes up

- **Status:** Accepted · recorded 2026-09-26

## Context

Insights answers questions from Linear, GitHub, PostHog, Sentry and liquid-workflow. Letting the model call those APIs itself (tool calling) would hand it our keys' reach, make answers slow and variable, and make "what did it look at?" hard to answer.

## Decision

- A **rules-based router** (`server/retrieval/router.ts`) classifies the question (intent, ticket ids, time window, repos, charts). There is no extra model call.
- The **server** fetches from the connectors in parallel, normalises each item into a citable block (`[linear:KAN-5]`, `[github:PR:owner/repo#5]`, `[sentry:…]`, `[workflow:run:…]`), redacts and clips it, ranks it, and packs it into a hard 12,000-character budget.
- **Grok** (`grok-4-fast-non-reasoning`, temperature 0.2, JSON output) only writes the answer from that context. It has no tools and never sees API keys.
- Actions (moving tickets, approving plans) are **never** decided by Grok (0003).

## Consequences

- Predictable cost and latency; every answer can show exactly which sources it used ("How this was built").
- The router has to learn new phrasings. When a question lands in `general`, the fix is a router rule plus a test, and the "What can I ask?" catalogue test checks every example routes somewhere specific.
- A configured connector that fails reports `unavailable`; it never silently falls back to sample data.

## Alternatives considered

- **Model tool calling / agents** — more flexible, but gives the model our API reach and makes answers non-reproducible.
- **Embeddings / vector search** — unnecessary at our data size; ranking by ticket id, intent, keywords and recency works.

## Where it lives

`server/retrieval/*`, `server/insights.ts`, `server/grok/*`, `docs/ARCHITECTURE.md`.
