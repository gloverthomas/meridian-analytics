# Connectors

All connectors are **read-only** and run on the server only. The browser never talks to Linear, GitHub or xAI directly.

## Linear (`server/retrieval/linear.ts`)

- **Auth:** `LINEAR_API_KEY`, sent as the raw `Authorization` header, which is how Linear personal keys work.
- **Scope:** `LINEAR_TEAM_ID` if set, otherwise `LINEAR_TEAM_KEY` (default `LIQ`).
- **Queries:**
  - One aliased query fetches up to 5 issues by identifier, with description and the last 5 comments. An unknown ID is skipped rather than treated as an error.
  - The 50 most recently updated issues in the team are fetched for ranking, including state filters such as "Todo vs Done".
- **Limits:** descriptions are clipped to 700 characters and comments to 280, and emails are redacted.

## GitHub (`server/retrieval/github.ts`)

- **Auth:** `GITHUB_TOKEN`, a fine-grained PAT with **read-only** access to Contents, Pull requests and Checks on the repos in `GITHUB_REPOS`.
- **Calls:**
  - `GET /repos/{repo}/pulls?state=closed&sort=updated` (50 per page), filtered to PRs merged inside the question's time window.
  - `GET /search/issues?q="KAN-5" is:pr repo:…` for PRs that mention a ticket.
  - `GET /repos/{repo}/commits/{branch}/check-runs`, keeping the latest run of each check name. Expected names are `build`, `assistant-unit`, `smoke` and `parity-proof` on Core, and `build`, `assistant-unit` and `help-proof` on Reporting.
- **Not fetched:** diffs, file contents and binary assets. PR descriptions are clipped to 240 characters.

## PostHog (`server/retrieval/posthog.ts`)

- **Auth:** `POSTHOG_PERSONAL_API_KEY` (read-only query scope) and `POSTHOG_PROJECT_ID`. `POSTHOG_HOST` must be `us`, `eu` or `app.posthog.com`; any other value falls back to US, so the key can't be sent elsewhere.
- **Query:** one fixed HogQL query that counts events per hour, per event and per app. It only covers the allowlisted events (`$pageview`, `product_navigation`, `report_opened`, `bff_status`, `create_dialog_opened`, `invoice_deep_link_miss`) and never selects person, token or distinct-id fields. The window is clamped to 30 days, and no user text is ever interpolated into the query.
- **Output:** an aggregate summary item that leads with what **isn't** tracked (AI Assistant usage), plus the "Product activity" and "BFF connection checks" charts.
- **Without keys:** falls back to the sample insight.

## Sentry (`server/retrieval/sentry.ts`)

- **Auth:** `SENTRY_AUTH_TOKEN`, a User Auth Token (`sntryu_…`) with read-only `org:read`, `project:read` and `event:read`. `SENTRY_HOST` must be `sentry.io`, `us.sentry.io` or `de.sentry.io`. `SENTRY_ORG` defaults to `liquid-accounting`.
- **Scope:** only the `SENTRY_ENVIRONMENT` environment (default `production`), so local-dev noise such as react-refresh errors is excluded. Core and Reporting are split by the apps' own `app` tag.
- **Calls:**
  - The issue list (`is:unresolved environment:… app:…`) per app.
  - When a chart is asked for, `events-stats` daily counts per app.
  - Summaries only: title, level, counts, dates, culprit and link. It never fetches event payloads, stack traces or user details.
- **Output:**
  - One cited item per issue.
  - A server-computed SENTRY COUNTS block.
  - The "Sentry events per day, Core vs Reporting" chart.
- **Without a token:** skipped entirely (there's no sample Sentry data).

## liquid-workflow (`server/retrieval/workflow.ts`, `server/workflowQuestions.ts`)

- **Auth:** `WORKFLOW_API_TOKEN` as a bearer token, server-side only. `WORKFLOW_BASE_URL` must be `https://*.meridian-saas.local` (loopback only outside production), so the token can't be sent elsewhere.
- **Calls:** `GET /runs` (summaries), `GET /runs/:id` (one plan transcript), `GET /evals/reports`, `GET /gates?issue=`; `POST /approve` only from a confirmed Approve & implement.
- **Output:**
  - Plan: one cited `workflow:run:<id>` item with the eval checklist and the end of the transcript.
  - Evals: a server-computed EVAL COUNTS block, the "evals per day" stacked chart and the "most-failed checks" ranked chart.
  - Pipeline: a timeline built from Linear history, workflow runs, evals, gates and PRs that mention the ticket.
- **Without a token, or when the service is down:** the answer says the workflow service is unavailable.

## Code search

- Not in the MVP (spec v2).

## Adding a connector

1. Add the ID to `ConnectorId` in `shared/contracts.ts`.
2. Write `fetch*` and `normalize*` functions. Normalised text must start with `[<id>]` and be clipped with `clip()`.
3. Wire the connector into `runRetrieval` with a live source and, optionally, a sample source.
4. Add contract tests with a mocked `fetch` (see `tests/contract/connectors.test.ts`).
