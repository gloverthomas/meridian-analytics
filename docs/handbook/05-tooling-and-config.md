# Tooling & config

Where each setting lives. **Names only; values never go in docs.** Every repo has a `.env.example`.

## Tools

| Tool | Used for |
| --- | --- |
| Cursor SDK | liquid-workflow's planner, reviewers and implementer (model routing by role) |
| Cursor BugBot, Cursor Security Agent | Independent PR review on Core and Reporting |
| GitHub Actions | CI (`build`, `assistant-unit`, `smoke`, `parity-proof`, `help-proof`) |
| Playwright, Vitest | E2E/visual proof, unit tests |
| Vercel | Hosting for Core, Reporting, Insights |
| Cloudflare | DNS and the named tunnel to liquid-workflow |
| xAI Grok | Core's AI Assistant; Insights' answer writer |
| Linear, Slack, Sentry, PostHog | Work tracking, chat + bot, errors, product analytics |

## Environment variables by app

- **Core:** `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`, `LIQUID_BFF_DEMO_TOKEN`, `XAI_API_KEY`.
- **Reporting:** `VITE_POSTHOG_PROJECT_TOKEN`, `VITE_POSTHOG_HOST`.
- **liquid-workflow:** Cursor (`CURSOR_API_KEY`, `CURSOR_MODEL`, `DRY_RUN`); gates (`EVAL_GATE`, `IMPLEMENT_BYPASS_EVAL_ON_LINEAR`, `REQUIRE_FORMAL_APPROVAL`, `CI_GATE`, `CI_GATE_STRICT`); access (`WORKFLOW_API_TOKEN`, `APPROVE_TOKEN`, `LINEAR_WEBHOOK_SECRET`, `GITHUB_WEBHOOK_SECRET`); kill switches (`WORKFLOW_ENABLED`, `SIGNAL_ENABLED`, `LINEAR_AUTO_ENABLED`, `GITHUB_AUTO_DONE_ENABLED`); Linear/Slack (`LINEAR_API_KEY`, `LINEAR_ASSIGNEE_ID`, `LINEAR_DONE_STATE_ID`, `TRIGGER_STATES`, `IMPLEMENT_STATES`, `TRIGGER_ISSUE_IDS`, `SLACK_WEBHOOK_URL`, `SLACK_MENTION_USER_ID`); repos (`CORE_REPO_URL`, `REPORTING_REPO_URL`, `REPO_STARTING_REF`, `GITHUB_MERGE_REPOS`); ops (`RUN_RETENTION_DAYS`, `PUBLIC_TUNNEL_URL`, `HOST`, `PORT`).
- **Insights:** auth (`LIQUID_INSIGHTS_ACCESS_CODE`, `LIQUID_SESSION_SECRET`, `LIQUID_BFF_DEMO_TOKEN`); Grok (`XAI_API_KEY`, `XAI_MODEL`); connectors (`LINEAR_API_KEY`, `GITHUB_TOKEN`, `GITHUB_REPOS`, `POSTHOG_*`, `SENTRY_*`, `WORKFLOW_BASE_URL`, `WORKFLOW_API_TOKEN`); actions (`LINEAR_ACTIONS_API_KEY`, `LIQUID_ACTIONS_ALLOWED_STATES`); Slack (`SLACK_BOT_TOKEN`, `SLACK_SIGNING_SECRET`, `SLACK_APPROVER_IDS`).

Hosted values live in Vercel (Project → Settings → Environment Variables); the workflow's live in `.env.local` on its Mac.
