# Meridian Insights (meridian-analytics)

Ask plain-English questions about **Linear tickets, GitHub pull requests and CI checks** and get a short answer from Grok with **a cited source for every claim**. It never changes GitHub. The one change it can make is **moving a Linear ticket to In Progress**, and only after you click Confirm (see [Ticket moves](#ticket-moves)).

Built from [`docs/grok-insights-chat-spec.md`](docs/grok-insights-chat-spec.md) (MVP scope). This is a separate product from the in-app finance assistant in `meridian-saas (core app)`.

```mermaid
flowchart LR
  B[Browser] -->|/api same-origin| F[BFF handler]
  F --> R[Retrieval: plan → fetch → rank → 12k-char budget]
  R --> L[Linear GraphQL]
  R --> G[GitHub REST]
  F --> X[xAI Grok]
  F -->|reply + citations + follow-ups| B
```

## Quickstart

```bash
npm install
cp .env.example .env.local      # then set LIQUID_BFF_DEMO_TOKEN (≥16 chars)
npm run dev:all                 # UI http://localhost:5173 · API 127.0.0.1:4200
```

With no keys it runs in **sample mode**: realistic KAN-5 demo data and canned answers, clearly badged "Sample data". Add keys to `.env.local` to go live:

| Variable | Needed for | Notes |
| --- | --- | --- |
| `XAI_API_KEY` | Grok answers | Without it: sample answers or a plain source list |
| `XAI_MODEL` | – | Default `grok-4-fast-non-reasoning` |
| `LINEAR_API_KEY` | Live tickets | Personal or service key, read access; team key defaults to `KAN` (`LINEAR_TEAM_KEY`) |
| `GITHUB_TOKEN` | Live PRs + checks | Fine-grained PAT, read-only: Contents, Pull requests, Checks |
| `GITHUB_REPOS` | – | Defaults to Core + Reporting |
| `LIQUID_BFF_DEMO_TOKEN` | Local dev auth | Injected by the Vite proxy; never in the bundle |
| `LIQUID_INSIGHTS_ACCESS_CODE` / `LIQUID_SESSION_SECRET` | **Hosted auth** | Required on Vercel, or every API route returns 503 |
| `POSTHOG_PERSONAL_API_KEY` / `POSTHOG_PROJECT_ID` / `POSTHOG_HOST` | Live product analytics | Read-only key; host must be us/eu/app.posthog.com |
| `SENTRY_AUTH_TOKEN` / `SENTRY_ORG` / `SENTRY_HOST` | Production errors | Read-only User Auth Token; production issues only, no stack traces |
| `POSTHOG_PROJECT_TOKEN` | Insights question log | Public `phc_` token; categories only, never question text |
| `LINEAR_ACTIONS_API_KEY` | Ticket moves | A **separate** Linear key with write access; without it the app stays read-only |
| `SLACK_BOT_TOKEN` / `SLACK_SIGNING_SECRET` / `SLACK_APPROVER_IDS` | Slack bot | See [Slack](#slack); approver IDs gate the Approve / Move buttons |
| `WORKFLOW_BASE_URL` / `WORKFLOW_API_TOKEN` | Cursor plans, evals, pipeline, Approve & implement | liquid-workflow's `WORKFLOW_API_TOKEN` (≥24 chars); URL must be `https://*.meridian-saas.local` (loopback allowed in dev) |

The full list is in [`.env.example`](.env.example). If a key is set but that service fails, the answer marks it "unavailable" rather than quietly switching to sample data.

## Scripts

| Script | What it does |
| --- | --- |
| `npm run dev:all` | UI + API with hot reload |
| `npm run test` / `test:coverage` | Vitest: server unit and contract tests (node) + React tests (jsdom); coverage must stay ≥ 80% |
| `npm run test:e2e` | Playwright on desktop and mobile, sample mode on ports 5183/4210 |
| `npm run lint` / `typecheck` / `build` | ESLint · `tsc -b` · production build |

## Deploying (Vercel)

`vercel.json` serves the Vite build as a static site and sends every `/api/*` request to one function (`api/index.ts`). That function wraps the **same handler** as the local server (`server/app.ts`), so the auth, limits and validation rules are identical in both places.

**Hosted auth:** viewers enter a shared access code once, and the server sets a signed `__Host-` session cookie (HttpOnly, Secure, SameSite=Strict, 12 hours). The demo bearer token is **refused** in production unless you explicitly set `LIQUID_ALLOW_DEMO_TOKEN=true`.

Required Vercel env vars (Production and Preview): `LIQUID_INSIGHTS_ACCESS_CODE`, `LIQUID_SESSION_SECRET`, plus whichever connector keys you want live.

## Charts

Some questions come back with a chart above the sources:

| Ask | Chart |
| --- | --- |
| "How many PRs merged per day this week, Core vs Reporting?" | PRs merged per day, by repo |
| "Show our Linear tickets by status" / "Bugs in Todo vs Done" | Tickets by status, bugs stacked on other tickets |
| "Are we closing bugs faster than we open them?" | Opened vs closed per week (last 4+ weeks) |
| "How often has assistant-unit failed over the last 2 weeks?" | Passed vs failed per day, for that check or for all CI runs |
| "How has product usage changed over the last 2 weeks?" | Product activity per day, Core vs Reporting (PostHog) |
| "Is the BFF disconnecting? Show connection checks per day" | BFF connected vs not per day (PostHog) |
| "Is Reporting erroring more than Core? Show errors per day" | Sentry production events per day, Core vs Reporting |

- **The server computes every chart number** from Linear and GitHub data (`server/charts.ts`); Grok only writes the prose around it and is given the same numbers.
- **Days follow `LIQUID_TIMEZONE`** (default Australia/Sydney). Windows up to 14 days are shown per day; longer ones per week.
- **Colours are validated for colour blindness** with the dataviz checker: blue/orange for comparisons, green/red reserved for passed/failed.
- **Each chart has a legend, a hover tooltip and a "Show data" table,** so no information is conveyed by colour alone.
- **Product activity and BFF health charts come from PostHog,** using fixed aggregate queries over the same event and property allowlist the apps send (no raw events, no personal data, no user text in queries). AI Assistant usage **isn't tracked** in PostHog yet, and answers say so.

## "What have people been asking?"

Every answered question is logged to PostHog as one `insights_question` event holding **categories only**: topic (ticket status, CI health, merged PRs, problems, product usage, ticket moves…), answer style, charts shown, sources used, answer type (Grok, sample, source list, ticket move), outcome (answered, fell back, error), speed, and an anonymous hash of the session. **The question text, ticket ids and anything typed are never recorded** (a test enforces this).

Ask Insights "What have people been asking this week?", "How are people using Insights?" or "What are the most common questions?" to get an overview plus two charts: questions by topic, and questions per day (answered vs fell back).

- Writing uses `POSTHOG_PROJECT_TOKEN` (the public `phc_` token); reading uses the personal key.
- Because the token is public, look-alike events are possible, so only known topics, answer types and outcomes are counted.
- E2E and CI blank these keys so test runs never pollute the log.

## Ticket moves

Ask "Move KAN-18 to In Progress" (or "Start KAN-18"):

1. **Detected by rules, not by Grok**, so the model can never decide to act on its own.
2. The answer shows a **confirm card** (ticket, from → to). Nothing changes yet.
3. **Confirm** posts a signed, 5-minute token tied to that exact ticket and state. The server re-checks the ticket's team and current state, moves it with the write key, and adds an **audit comment** to the ticket. A replayed token is a no-op.
4. If the `liquid-workflow` Linear webhook is connected, moving to In Progress starts the Cursor SDK workflow (plan → eval → human approval before any PR).

It is limited to `LIQUID_ACTIONS_ALLOWED_STATES` (default: In Progress), to the configured Linear team, and to 10 confirmations per minute per IP. Anyone with the access code can move tickets, so share the code accordingly.

## "What can I ask?"

Under the prompt pills on the home screen, **What can I ask?** opens every topic Insights covers (tickets, PRs & CI, problems & errors, product analytics, the Cursor workflow, actions, and Insights itself), each with example questions that ask on click. Typing "What can I ask?" or "help" in the chat gives the same list as an answer (no Grok call). The examples live in `shared/askCatalog.ts`, and a test checks that each one routes to a specific intent.

## How it works & why (onboarding)

Ask "How does the human write gate work?", "Why did we build a deterministic eval harness?", "How is the workflow API secured?" or "I'm new, where do I start?" (web or Slack).

- **Sources:** an allowlist of docs from all four repos' `main` (READMEs, WRITE-POLICY, ARCHITECTURE/CONNECTORS and every `docs/decisions/*.md`), plus the design comment at the top of a few key source files (`access.ts`, `guardrails.ts`, the action and Slack handlers) and Linear Documents. Merged PRs are searched for rationale. Nothing outside the allowlist is read. Docs are cached for 10 minutes.
- **Answers** lead with the answer, then What / Why / Where it lives / How to change it safely / Gotchas / Security, citing doc sections as links to GitHub. If no decision record explains a "why", the answer says the reasoning isn't written down rather than guessing.
- **Open security work:** open security-related PRs are included on the **web only**. In Slack, the bot says those are only discussed in the web app.
- **Better answers come from better docs:** add or update a decision record in `docs/decisions/` and Insights picks it up within 10 minutes of merging.

## Engineering handbook (in Linear)

`docs/handbook/` (start here, system map, agent workflow, security overview, runbooks, tooling, glossary) and every repo's `docs/decisions/` are published as documents on the **Liquid accounting** team in Linear:

- `npm run handbook:publish` shows what would change; `npm run handbook:publish -- --apply` writes. The **Publish handbook to Linear** GitHub Action does this on docs changes and daily; it needs the `LINEAR_ACTIONS_API_KEY` repo secret.
- **GitHub is the source of truth.** Each Linear copy starts with a "📌 Published from GitHub" banner linking to its source, so edit there. Links between published pages point at their Linear copies.
- **It only ever creates or updates its own documents**, never deletes (docs whose source disappeared are reported as orphans). Insights skips the Linear copies, so each doc is searched once.

## Cursor workflow: plans, evals, pipeline

Insights reads the [liquid-workflow](https://github.com/gloverthomas/liquid-workflow) service (Cursor SDK plan → eval → approval → implement):

- **"What's the Cursor plan for KAN-5?"** summarises the latest plan run (the agent's transcript) with its eval checklist. If the eval passed and the ticket is in Todo or In Progress, an **Approve & implement** card appears.
- **"How are our evals tracking?"** gives the pass rate, the latest verdict per ticket, and two charts: evals per day (passed vs failed) and the most-failed checks.
- **"Where is KAN-5 in the pipeline?"** draws the ticket's journey: Triage → Cursor plan → Eval gate → Human approval → Implement → Pull requests → Merged → Done.

**Approve & implement** works like a ticket move: a signed 5-minute token of its own kind (it can't be replayed as a plain move, or vice versa). Confirming records the human approval with the workflow (`POST /approve`, actor `liquid-insights`) and then moves the ticket to **In Review**, which the workflow's Linear webhook treats as "implement". The workflow still enforces its own eval, CI and write gates, and PRs still need a human to merge. It needs `LINEAR_ACTIONS_API_KEY` and `WORKFLOW_API_TOKEN`.

If the service is down (it runs on a Mac behind a Cloudflare tunnel), answers say so instead of guessing.

## Slack

Mention **@Meridian Insights** in a channel (or DM it) and it answers in the thread, using the same pipeline, sources and citation checks as the web app. The answer streams into the message as Grok writes it.

- **Threads have memory:** follow-ups in the same thread include the earlier turns.
- **Charts** can't render in Slack, so each one becomes a one-line summary with a link to the web app. The pipeline tracker becomes a checklist.
- **Follow-up buttons** ask that question in the thread.
- **Approve & implement / Move to In Progress** use the same signed 5-minute confirmations as the web app. They appear as buttons with a confirm dialog, work only for Slack users listed in `SLACK_APPROVER_IDS`, and the Linear audit comment names who confirmed from Slack. With no approvers set, Slack links to the web app instead.
- **Security:** every Slack request is verified with the signing secret (and refused if it's more than 5 minutes old). The routes don't use the access-code session. Slack retries and duplicate events are ignored. The question log records only the topic and `channel: slack`.

**Setup (about 5 minutes):**

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**, pick the workspace, and paste [`docs/slack-app-manifest.json`](docs/slack-app-manifest.json).
2. **Install to Workspace**. Copy the **Bot User OAuth Token** (`xoxb-…`) and, from Basic Information, the **Signing Secret**.
3. Add `SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET` and `SLACK_APPROVER_IDS` (your Slack member ID: profile → ⋯ → Copy member ID) to Vercel and redeploy.
4. In Slack's Event Subscriptions page, click **Retry** next to the request URL if it shows as unverified. Then `/invite @Meridian Insights` to a channel.

## Why it works this way

Decision records live in [`docs/decisions/`](docs/decisions/README.md): retrieval vs tool calling, enforced citations, confirm-gated actions, auth, the question log, Slack, streaming and web/Slack parity.

## Security posture

- API keys stay on the server. There is no `VITE_`-prefixed secret, and the browser only talks to its own origin.
- **Fails closed.** A request is refused if it comes from another origin (403), lacks a valid token or cookie (401), or reaches a deployment with no auth configured (503).
- **Rate limits** per IP: 180 requests/min overall, 20/min for chat, 10/min for access-code attempts. These are counted per server instance, so treat them as abuse damping rather than a hard quota.
- **Input limits:** request bodies up to 64 KB, messages of 2 to 2,000 characters, and the last 6 turns of history.
- Ticket and PR text is redacted (emails and anything shaped like a credential) before it reaches Grok. Grok is told to treat retrieved text as data, not instructions.
- **Citations are enforced server-side.** Any ID Grok invents that wasn't retrieved is removed from both the source list and the answer text.
- **Logs** are structured and allowlisted. They record message *length*, never message text, keys or comment bodies.

More detail: [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) · [`docs/CONNECTORS.md`](docs/CONNECTORS.md).
