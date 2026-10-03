# Start here: Liquid engineering directory

Everything we run, where it lives, and where to go next. New to the team? Read this page, then [the system map](01-system-map.md), then [the agent workflow](02-agent-workflow.md).

> Quickest way to get an answer: ask **Meridian Insights** at http://localhost:5173 or `@Meridian Insights` in Slack, e.g. "How does the human write gate work?" or "Why did we build a deterministic eval harness?". It answers from these pages, the decision records and the code's design comments, with links.

## What we run

| System | What it is | Live at | Repo |
| --- | --- | --- | --- |
| **Liquid Core** | The canonical accounting app (dashboard, invoices, AI Assistant) | https://meridian-saas.local | [meridian-saas (core app)](https://github.com/gloverthomas/meridian-saas-core) |
| **Liquid Reporting** | The reporting app, a separate shell for now (to be migrated into Core) | https://reporting.meridian-saas.local | [meridian-saas (reporting app)](https://github.com/gloverthomas/meridian-saas-reporting) |
| **Meridian Insights** | Ask questions about tickets, code, errors, usage, the Cursor workflow and how things work; web + Slack bot | http://localhost:5173 | [meridian-analytics](https://github.com/gloverthomas/meridian-analytics) |
| **liquid-workflow** | Cursor SDK service: plans, evals, approvals and PRs for Linear tickets | http://127.0.0.1:4100 (`/status`, `/evals` are public) | [liquid-workflow](https://github.com/gloverthomas/liquid-workflow) |

All four repos are **public**. Never commit secrets, and never write unfixed security issues into docs or PR descriptions.

## Where things are decided and tracked

- **Work:** Linear, team *Liquid accounting* (`LIQ-*`). Moving a ticket drives the agent workflow, see [02](02-agent-workflow.md).
- **Why we built it this way:** decision records in each repo's `docs/decisions/` (also published here as "Decision · …" pages).
- **Code review:** GitHub PRs. `main` is protected on Core and Reporting; humans merge.
- **Errors:** Sentry (org `liquid-accounting`, production only). **Product analytics:** PostHog (US). **Hosting:** Vercel. **Workflow tunnel:** Cloudflare.

## Keeping Linear in sync

Insights reads **Linear Documents** for this handbook. Pages **00–06** and repo **decision records** sync from GitHub automatically when you edit them here. Pages **07–28** (SDK/eval/PR stack + **interview prep 10–28**), workflow verbatim prompts, and prod-verified demo facts do **not** — update the matching Linear doc in the **same change** (see [documentation-sync.md](documentation-sync.md)).

## Your first day

1. Get access: GitHub (the four repos), Linear (*Liquid accounting*), Vercel, Slack, and the Insights access code.
2. Run Core locally (README → "Run locally", "Core BFF"). Then Reporting.
3. Read [the security overview](03-security-overview.md) and [the write policy](https://github.com/gloverthomas/liquid-workflow/blob/main/WRITE-POLICY.md).
4. Ask Insights "I'm new, where do I start?" and "What can I ask?".
5. Pick a Todo ticket and follow it through the pipeline ("Where is LIQ-N in the pipeline?").

## Pages in this directory

| Page | Read it when |
| --- | --- |
| [01 System map](01-system-map.md) | You want to know how the pieces connect |
| [02 The agent workflow](02-agent-workflow.md) | You're working a ticket, or wondering what the agents do |
| [03 Security overview](03-security-overview.md) | Before touching auth, tokens, webhooks or analytics |
| [04 Runbooks](04-runbooks.md) | Something is down or not responding |
| [05 Tooling & config](05-tooling-and-config.md) | You need to know which env var or tool does what |
| [06 Glossary](06-glossary.md) | A term doesn't make sense |
| [documentation-sync](documentation-sync.md) | You changed handbook/workflow docs and need Linear updated too |
| [07 Cursor SDK & cloud agents](07-cursor-sdk-cloud-agents.md) | SDK modes, prompts, specialists, model routing |
| [08 Deterministic eval rubric](08-deterministic-eval-rubric.md) | Every eval check id and gate behavior |
| [09 PR review stack](09-pr-review-ci-bugbot-security.md) | CI jobs, Bugbot, Security Agent vs workflow eval |
| [10 Interview: SDK vs skills/API/MCP](10-interview-sdk-vs-alternatives.md) | SpaceX Q&A — why SDK not skill/script |
| [11 Interview: SDK boundaries](11-interview-sdk-boundaries.md) | Where cloud agents start/stop; human merge |
| [12 Interview: Talking points](12-interview-talking-points.md) | One-liners, show vs narrate |
| [13 Interview: Model routing](13-interview-model-routing.md) | Per-role Router policy |
| [14 Interview: Evals & merge](14-interview-evals-merge-policy.md) | Gates, merge policy, eval FAQ |
| [15 Interview: Grok vs SDK](15-interview-grok-vs-sdk.md) | In-app assistant vs workflow |
| [16 Interview: Meridian Insights Q&A](16-interview-liquid-insights.md) | Demo prompts for Insights |
| [17 Interview: Hard constraints](17-interview-hard-constraints.md) | Assignment must/must-not |
| [18 Interview: Live extension](18-interview-live-extension.md) | Safe live extension tiers |
| [19 Interview: Session arc](19-interview-session-arc.md) | 45-minute timing |
| [20 Interview: Q&A catalog](20-interview-qa-catalog.md) | Quick reference table |
| [21 Interview: Two-repo story](21-interview-two-repo-convergence.md) | Convergence narrative |
| [28 Codebase file walk](28-codebase-file-walk.md) | Which file to open, how the SDK runs, and what enterprise still needs |
