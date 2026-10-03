# System map

How Core, Reporting, Insights and liquid-workflow connect, and which external services each one talks to.

## The picture

```
            Linear (LIQ-*) ──webhook──▶ liquid-workflow (Mac, via Cloudflare tunnel)
               ▲    ▲                        │  Cursor SDK: plan → eval → implement
   ticket moves│    │ comments               ▼
               │    └───────────────── GitHub PRs (Core, Reporting) ──merge webhook──▶ Linear Done
               │                              │  CI + BugBot + Security Agent, humans merge
   Meridian Insights (Vercel) ◀─reads──── Linear · GitHub · Sentry · PostHog · liquid-workflow · docs
     web app + Slack bot                      │
                                              ▼
   Core (meridian-saas.local)   Reporting (reporting.meridian-saas.local)
     each with its own BFF            (POST /signal ─▶ liquid-workflow files a triage ticket)
```

## Each system

- **Core / Reporting** (Vite + React): each app has its own small **BFF** behind same-origin `/api`. Secrets (e.g. the AI Assistant's Grok key) stay server-side. The two BFFs deliberately duplicate the `organisation` contract; don't build a shared BFF yet (Core/Reporting decision 0002). Analytics is PostHog with an event allowlist (decision 0003).
- **liquid-workflow** (Node, Cursor SDK): receives Linear and GitHub webhooks, runs plans and evals, records approvals, and opens PRs. It runs on a Mac behind a named Cloudflare tunnel (workflow decision 0005). Every control-plane route needs a token (workflow decision 0006).
- **Meridian Insights** (Vite + React front end; one Web-standard handler as the BFF, run as a Vercel function): the server fetches from each connector, and Grok writes the answer with enforced citations (Insights decisions 0001–0002). Actions are confirm-gated (0003). Slack uses the same pipeline (0006).

## Data flows worth knowing

- **Ticket moves drive agents:** In Progress starts a plan; In Review (after an approval) starts implementation; a merged PR that mentions `LIQ-N` moves it to Done.
- **Insights reads, and writes only two things:** a Linear state change plus an audit comment, and a workflow approval. It writes only after a human confirms.
- **Telemetry:** Core and Reporting send allowlisted PostHog events. Insights logs question *categories* only, never text.
