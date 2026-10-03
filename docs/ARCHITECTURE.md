# Architecture

## One handler, two adapters

```
server/app.ts          (Request, ctx) → Response   ← all routing, auth, limits, validation
  ├─ server/index.ts   Node http adapter, loopback 127.0.0.1:4200, dev/test only
  └─ api/index.ts      Vercel Function (GET/POST/DELETE/OPTIONS), reached via vercel.json rewrite
```

`vercel.json` rewrites `/api/:path*` to `/api/index?__path=:path*`. The adapter rebuilds the original path from `__path`, so there is one function and one warm instance for every route.

## A chat turn (`POST /api/v1/insights/chat`)

1. **Validate:** JSON only, at most 64 KB, a message of 2 to 2,000 characters, a known `orgId`, and history cut to the last 6 turns (1,500 characters each).
2. **Plan** (`retrieval/router.ts`): rules only, no extra model call. The question is classified by intent (`issue_status`, `ci_health`, `trend`, `problems`, `merged_prs`, `linear_overview`, `insights_usage`, `workflow_plan`, `evals`, `pipeline` or `general`), and the planner picks out ticket IDs, a time window (default 14 days, max 30), repos and keywords.
3. **Fetch in parallel** (`retrieval/index.ts`). Each connector runs `live` if its key is set, otherwise `sample` (the default), or reports `unavailable`. A configured connector that fails reports `unavailable` and **never** falls back to sample data.
4. **Normalise** each item into a citable block that starts with its ID, e.g. `[linear:KAN-5]`, `[github:PR:owner/repo#5]` or `[github:check:owner/repo@sha7:name]`. Text is redacted and clipped along the way.
5. **Rank and pack** (`retrieval/rank.ts`). Scoring favours exact ticket-ID matches, then items that fit the intent, keyword overlap and recency. Items are packed in rank order into a hard **12,000-character** budget; a partly included item keeps its leading `[id]`.
6. **Ask Grok** (`grok/client.ts`) with temperature 0.2, up to 1,500 tokens, a 12-second timeout and JSON mode (retried without JSON mode on a 400 or 422).
7. **Validate the answer** (`grok/parseResponse.ts`). Invalid JSON gets one repair attempt. Citation IDs that weren't retrieved are removed from both the list and the answer text, and sources are numbered in the order they first appear.
8. **Fallbacks** (`insights.ts`):
   - When every connector was in sample mode and the canned answer's sources were all retrieved, a canned answer is used (`provider: "fixture"`).
   - Otherwise the reply is a plain list of the top sources (`provider: "digest"`), so the answer text can never contradict the sources shown.

## Streaming (`POST /api/v1/insights/chat/stream`)

The app uses this route; `/api/v1/insights/chat` stays as the plain JSON version of the same turn.

- **Same pipeline:** validation, retrieval, the Grok call, validation and fallbacks are identical, and so is the telemetry. Validation errors (400, 401, 429…) come back as ordinary JSON before any streaming starts.
- **Grok streams** (`stream: true`). `grok/replyStream.ts` decodes the `"reply"` field out of the partial JSON as it arrives, so only answer text is sent, never raw JSON.
- **Wire format:** newline-delimited JSON (`application/x-ndjson`):
  - `{"type":"delta","text":"…"}` while Grok writes. This text is unvalidated, and may include citation IDs that are later removed.
  - Then exactly one `{"type":"done","response":ChatResponse}`, or `{"type":"error","error":"internal_error","requestId":"…"}`.
- **The client** shows deltas in a "Writing…" card with inline citations hidden, then replaces it with the validated, cited answer from `done`. Answers that don't use Grok (actions, help, digests) send only `done`.

## Caching

Only retrieval is cached, in a per-instance TTL/LRU store holding up to 200 entries. Grok answers are never cached.

| Key | TTL |
| --- | --- |
| `linear:issues:<ids>`, `linear:recent:<team>` | 60 s |
| `github:prs:<repo>`, `github:search:<ids>:<repos>` | 120 s |
| `github:checks:<repo>:<ref>` | 180 s |

## Auth

| Where | Mechanism |
| --- | --- |
| Local | `Authorization: Bearer $LIQUID_BFF_DEMO_TOKEN`, added by the Vite proxy (dev and preview) |
| Vercel | The viewer posts the access code to `POST /api/v1/session`, which sets an HMAC-signed `__Host-li_session` cookie (12 h) |

Comparisons are constant-time (both sides are hashed first). In production the demo token is refused unless `LIQUID_ALLOW_DEMO_TOKEN=true`. With no auth configured, every protected route returns 503.

## Ticket moves (`server/actions/`)

- `detectTicketAction` runs before retrieval. A match skips Grok entirely: `proposeTransition` only reads, then returns a `proposedAction` carrying an HMAC token (`issueId`, `toState`, expiry 5 min; signed with `LIQUID_SESSION_SECRET`, or the demo token locally).
- `POST /api/v1/actions/linear-transition { token }` verifies the token, the allowed state and the team, re-reads the current state (idempotent), then runs `issueUpdate` and a best-effort `commentCreate` audit comment using `LINEAR_ACTIONS_API_KEY`.
- The UI only renders the confirm card on the newest answer. Stored proposals are shape-validated on load, and the server re-validates the token regardless.

## Deviations from the spec (and why)

- **Ticket moves were added at the product owner's request.** The spec forbade write actions. The compromise is a single, confirm-gated, allow-listed transition with a separate write key and an audit comment on the ticket.

- **Hosted auth uses an access code and session cookie**, not proxy-injected bearer tokens. There is no proxy on Vercel, so a bearer token would have to ship in the bundle.
- **The Grok timeout defaults to 12 s instead of 8 s,** because this prompt carries up to 12k characters of context. Set `XAI_TIMEOUT_MS` to change it.
- **If Grok fails while connectors are live, the answer is a source list,** not a canned sample answer, because a sample answer would contradict the live sources.
- **Fixtures and the system prompt are TypeScript modules,** not JSON or text files, so serverless bundling can't drop them.
- **The health endpoint is `/api/health` on Vercel** (the local server also serves `/health`), because paths outside `/api` go to the static app.
