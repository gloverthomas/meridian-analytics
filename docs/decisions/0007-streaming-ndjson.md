# 0007 — Answers stream as NDJSON; citations appear only after validation

- **Status:** Accepted · recorded 2026-09-26

## Context

A full answer takes about 7 seconds. Streaming cuts the wait to the first words to about 1.5 s. But Grok's output is JSON, and its citations are only trustworthy after validation (0002).

## Decision

- `POST /api/v1/insights/chat/stream` returns newline-delimited JSON: `delta` events with answer text, then exactly one `done` (the validated answer) or `error`. Validation errors come back as normal JSON before streaming starts.
- Grok is called with `stream: true`. An incremental extractor pulls only the `"reply"` string out of the partial JSON, so raw JSON never reaches the client.
- While streaming, the UI hides citation tokens; numbered citations appear only when the validated `done` answer replaces the draft.
- `/api/v1/insights/chat` stays as the plain JSON version of the same turn.

## Consequences

- The streamed draft may briefly show text whose unknown citations are later removed; the final answer is authoritative.
- If Grok's first output needs a JSON repair, the draft is replaced by the repaired answer.

## Alternatives considered

- **Server-Sent Events** — fine too; NDJSON over `fetch` was simpler with POST bodies and our Web-standard handler.
- **Streaming unvalidated citations** — rejected (0002).

## Where it lives

`server/grok/replyStream.ts`, `server/grok/client.ts`, `server/http.ts` (`ndjsonStream`), `src/lib/api.ts`.
