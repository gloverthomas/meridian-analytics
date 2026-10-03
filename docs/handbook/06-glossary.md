# Glossary

- **BFF** — "backend for frontend": each app's small server that holds secrets and serves `/api`.
- **Hero tickets** — visible Core ⇄ Reporting gaps used to demo the workflow (KAN-6 to KAN-6, KAN-16 to KAN-18, KAN-5). All fixed or closed as of 26 Sep 2026; new demo defects get new tickets.
- **Signal** — an app calling liquid-workflow's `POST /signal`, which files a Todo for triage. It never starts agent work. No app calls it today.
- **Plan / implement run** — a Cursor SDK run that writes a plan (In Progress) or opens PRs (In Review, after approval).
- **Eval / eval gate** — the deterministic rubric that scores a plan; implementation is blocked until it passes.
- **Human write gate** — the rule that agents open PRs only, and humans approve, merge and deploy. Also the name of the most-failed eval check.
- **Formal approval** — a recorded approval (Insights, Slack, Linear `/approve`, `POST /approve`) required before implementation; valid 24 h.
- **Specialist reviewers** — read-only `security-reviewer` and `quality-reviewer` subagents spawned by the planner.
- **Model routing** — picking a model per role (Intelligence / Balance / Cost) via Cursor Router.
- **Kill switch** — an env flag that pauses part of the workflow without touching DNS.
- **Parity proof / help proof** — CI jobs proving Core and Reporting behave the same on key surfaces.
- **Migration seam** — the deliberate differences between Reporting and Core that the convergence plan must handle.
- **Decision record** — a short doc in `docs/decisions/` explaining a decision, its costs and the alternatives rejected.
- **COUNTS block** — numbers computed by Insights' server that Grok must use instead of counting itself.
- **Confirm-gated action** — an Insights change (ticket move, plan approval) that needs a click on a signed, 5-minute confirmation.
