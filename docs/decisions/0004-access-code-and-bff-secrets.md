# 0004 — Access code + HttpOnly session; every secret stays in the BFF

- **Status:** Accepted; revisit when the team needs per-person accounts (SSO) · recorded 2026-09-26

## Context

Insights reads internal tickets, code activity, errors and analytics. It needed to be private from day one, without building user management for a small team.

## Decision

- **Hosted:** one shared access code (`LIQUID_INSIGHTS_ACCESS_CODE`) exchanges for an HMAC-signed `__Host-` session cookie (HttpOnly, Secure, SameSite=Strict, 12 hours). Without both the code and `LIQUID_SESSION_SECRET` configured, every API route returns 503 (fail closed).
- **Local:** a demo bearer token injected by the Vite proxy; the browser never sees it, and it's refused on hosted deploys.
- **All third-party keys** (xAI, Linear read/write, GitHub, PostHog, Sentry, liquid-workflow, Slack) live only in the server (Vercel env, sensitive where possible). The browser bundle contains none.
- Browser requests from other sites are refused (Origin / `Sec-Fetch-Site` checks); requests with no Origin, such as Slack's, must still pass their own authentication (session, bearer or Slack signature). Rate limits: 180 requests/min general, 20 chat, 10 sign-in and 10 action confirmations per minute per IP. Connector hosts are allowlisted (PostHog US/EU, Sentry US/DE, workflow `*.meridian-saas.local`), so a misconfigured URL can't send a key elsewhere.

## Consequences

- Access is shared, not personal: we can't tell *who* asked or clicked on the web (the audit comment says "confirmed in the app"). Rotating the code signs everyone out.
- This is the main reason Slack approvals use an allowlist of named people (0006).

## Alternatives considered

- **SSO (Google/Okta) via an auth provider** — the right move once more people use it; adds a dependency and setup.
- **Vercel password protection** — protects the page but not the API routes the same way.

## Where it lives

`server/auth.ts`, `server/config.ts`, `server/app.ts` (origin + rate limits), `api/index.ts`.
