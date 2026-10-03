# Security overview

The controls that matter, per system, at design level. Details and reasoning are in each repo's decision records. **Open, unfixed issues are never written here** (the repos are public). Ask Insights on the web about security work in flight.

## Principles

1. **Humans own every write to `main` and production.** Agents open PRs only ([workflow 0001](https://github.com/gloverthomas/liquid-workflow/blob/main/docs/decisions/0001-humans-own-every-write.md)).
2. **Secrets live server-side only**: BFFs, Vercel env (marked sensitive), the workflow's `.env.local`. None are in browser bundles or repos.
3. **Fail closed:** missing auth config means 503, not open access.
4. **Least data:** analytics and logs carry categories, not content; PII and secrets are scrubbed from outbound messages.

## Per system

| System | Authentication | Key controls |
| --- | --- | --- |
| Core / Reporting BFFs | Local demo bearer token injected by the Vite proxy | Loopback only, origin allowlist, rate limits, `no-store`. Demo boundary, not production auth |
| Meridian Insights (web) | Shared access code → HttpOnly, SameSite=Strict `__Host-` session (12 h) | Rate limits, origin checks, connector host allowlists, confirm-gated actions with signed 5-minute tokens and audit comments |
| Meridian Insights (Slack) | Slack signing secret on every request (5-minute window) | Approve/Move buttons only for `SLACK_APPROVER_IDS`; open security work isn't discussed in Slack |
| liquid-workflow | `WORKFLOW_API_TOKEN` bearer on all control-plane routes; `APPROVE_TOKEN` for `/approve` | Webhooks require HMAC secrets and refuse without them; kill switches; eval + CI + approval gates; PII scrub; 14-day retention |
| GitHub | — | Branch protection on `main` (required checks, linear history, admins included), BugBot, Cursor Security Agent |
| PostHog | Public `phc_` token (write-only by design) | Event and property allowlists, no autocapture or session replay, memory persistence |

## If a secret leaks

1. **Rotate it at the source first** (xAI, Linear, GitHub, Slack, Sentry, PostHog, Cursor), then update Vercel env and/or the workflow's `.env.local`, then redeploy or restart.
2. If it was committed: rotating is what matters; history rewriting is secondary. GitHub push protection blocks most token formats, so don't bypass it.
3. Tell the team, and record what happened in a Linear ticket (without the secret).
