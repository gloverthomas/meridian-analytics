> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Retro — if we built this again

**Purpose:** Honest “second system” thinking for SpaceX-style depth — what we’d keep, simplify, or invest in next, without dismissing the demo.

**Related:** [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [10 · SDK vs alternatives](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) · [11 · SDK boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) · [12 · Talking points](https://linear.app/liquid-accounting/document/12-interview-prep-talking-points-and-one-liners-144703f45120) · [14 · Evals & merge](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) · [22 · Codebase map](./22-interview-sdk-codebase-map.md)

---

## Sound bites (retro edition)

- **“We optimized for explainability in 45 minutes — not for multi-region workflow HA.”**
- **“I’d keep human merge and classification; I’d replace file-backed locks and manual handbook sync first.”**
- **“Skills were the fast path to port UI; the SDK service is what I’d productionise for the loop ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).”**
- **“Eval stays deterministic — optional LLM judge advisory only, never blocking ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).”**
- **“`/signal` taught triage vs plan; in prod I’d sign it from the app BFF, not leave it wide open ([22](./22-interview-sdk-codebase-map.md)).”**

---

## What we’d keep (it worked for the story)

- **Linear as state machine** — In Progress / In Review / Done maps cleanly to plan → approve → implement → merge evidence ([Workflow 0002](https://linear.app/liquid-accounting/document/decision-workflow-0002-linear-ticket-states-drive-the-workflow-376a80b98e7a)).
- **PR-only agents + human merge** — Matches real enterprise risk; easy to explain in one sentence ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).
- **Deterministic eval floor** — Cheap, replayable, demo-friendly; not pretending LLM-as-judge is audit-ready ([08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)).
- **Two-repo pilot** — Forces classification narrative (shared chrome vs report-only) instead of fantasy monolith merge.
- **Meridian Insights as discovery layer** — Citations over handbook + tickets; optional coda, not a second demo spine ([16 · Insights](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)).
- **Hero prompt packs** — `liq-24.ts` style bounded scope + `feature-map.ts` runtime paths — agents verify real UI, not guessed routes.
- **Specialist read-only reviewers** — Security + quality in SDK `agents` block; model routing in `models.ts`, not self-assigned roles ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

---

## Architecture — what we’d change

| Today | Retro choice | Why | Code touchpoint |
| --- | --- | --- | --- |
| Loopback BFF per app (`server/server.mjs`) | Same for **demo**, but **one OpenAPI contract repo** early | Reduces “duplicate org BFF” confusion; SDK plans reference generated types | Plans cite `main.tsx` + BFF paths today — would cite generated client |
| Hero-specific prompt files (`liq-*.ts`) | **Ticket template + YAML/frontmatter** in Linear or repo | Scales past KAN-6/15/16/17/24 without redeploying workflow for every hero | `sdk-planner.ts` ~L238 routing |
| File-backed run store (`runs/*.json`) | **Durable store + idempotency keys** (Postgres or object store) | Survives multi-instance workflow; clearer audit than local disk | `sdk-planner.ts` `persist()` |
| Public `/signal` on tunnel | **Signed short-lived signal JWT** from Reporting BFF | Stops arbitrary POST spam while keeping browser bridge | `access.ts` ~L20, `handleSignal` ~L279 |
| Duplicate implement gate append | **Single injection** of `HUMAN_WRITE_GATE` in `startImplementRun` only | Avoids double gate blocks confusing agents | `sdk-planner.ts` ~L427 vs prompts already containing gates |
| Manual handbook ↔ Linear sync | **Single publish pipeline** for all sections Insights indexes | Eliminates stale citation footgun | [documentation-sync](./documentation-sync.md) |

---

## KAN-5 — what we’d redo vs keep

**Keep:** Separate **product** path (assistant BFF + Grok/fixture) from **SDK** path (plan/implement PRs). Interview email requires both API types — don’t collapse into one repo “for simplicity.”

**Change:**

| Area | Demo today | Retro |
| --- | --- | --- |
| Prompt delivery | TypeScript strings in `liq-24.ts` | Versioned prompt artifact keyed by Linear issue + `rubricVersion` |
| Proof | `assistant-unit` + Playwright + `docs/pr-proof/` | Same jobs, but **one composite CI workflow** name across Core/Reporting |
| Defect story | Intentional Reporting send failure | Feature-flagged `BROKEN_ASSISTANT` env instead of hard-coded UX surprise |
| Eval | Keyword checks in `harness.ts` ~L61–73 | Golden plan fixtures in CI per hero folder |

**Walkthrough anchor:** [22 · KAN-5 code map](./22-interview-sdk-codebase-map.md) · live script [27](./27-interview-official-email-brief.md).

---

## Signal vs SDK — retro lesson

We **intentionally** kept `/signal` public with CORS so Reporting could POST from the browser without a secrets-bearing BFF proxy. That was the right **demo tradeoff**; it is the wrong **prod default**.

| Concern | Demo | Production retro |
| --- | --- | --- |
| Auth | Public `POST /signal` | Reporting BFF signs payload; workflow verifies JWT |
| Effect | Todo + Slack only | Same — still **no** `Agent.create` |
| Confusion | Interviewers conflate with SDK start | Document in runbook + kill switch `SIGNAL_ENABLED` ([22](./22-interview-sdk-codebase-map.md)) |

**Boundary reference:** [11 · Starts and stops](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9).

---

## Evals & quality — what we’d change

- **Add golden plan fixtures in CI** — Run `harness.ts` on checked-in plan snippets every PR to workflow; catch rubric drift when someone edits ~L61–73 KAN-5 checks.
- **Lightweight LLM judge behind a flag** — Optional *advisory* score, never blocking merge; keeps deterministic gate as SoT ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) — eval is not MCP).
- **Unify “proof” story** — One directory convention (`docs/pr-proof/` + `e2e/proof/`) enforced by a single CI composite job name across repos.
- **Eval ↔ Linear link** — Auto-comment eval URL on issue when plan completes (today partly Slack/manual).
- **Implement eval clarity** — Return failing check ids in `/implement` 403 body (partially in `sdk-planner.ts` today).

**Tradeoff we accept today:** Keyword rubric misses clever bad plans — **humans + Bugbot + CI** are the backstop ([09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).

---

## Cursor SDK layer — production investments

| Improvement | Problem today | Retro direction |
| --- | --- | --- |
| Run lifecycle observability | Dashboard reads `runs/*.json` | Structured logs + webhook to Insights “pipeline” tile |
| Repo checkout policy | Two fixed URLs in config | Per-ticket **repo set** in Linear custom field |
| Specialist budget | Security + quality always spawn | Configurable per hero; skip quality on docs-only plans |
| DRY_RUN ergonomics | Synthetic plans in `sdk-planner.ts` ~L161–207 | Always label dry-run in Linear + `/evals` UI |
| Cost | Plan + implement + specialists per hero | Cache plan artifacts; Cost routing for read-only reviewers ([13 · Routing](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c)) |

**Keep from [07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888):** `mode: plan` vs `agent`, `autoCreatePR: false|true`, read-only specialists.

---

## Ops, cost, simplicity

| Area | Today | Retro |
| --- | --- | --- |
| **Cost** | Multiple cloud agent runs per hero (plan + implement + specialists) | **Cache plan artifacts**; narrower specialist scope; default Cost routing for read-only reviewers where safe |
| **Ops** | Tunnel + token soup (`WORKFLOW_API_TOKEN`, `APPROVE_TOKEN`, webhooks) | **One secrets manager** + rotation runbook; health SLO on `/status` |
| **Simplicity** | Four repos for full story | **Monorepo or meta-repo** for handbook + workflow + insights BFF — still **two app deployables** until convergence PR lands |
| **Documentation** | Manual Linear sync for 07–27+ | **Single publish pipeline** (GitHub → Linear) for *all* handbook sections Insights needs |
| **Insights freshness** | Linear hash vs GitHub drift | Automated sync + citation source-of-truth rules ([25 · Tooling SoT](./25-interview-tooling-source-of-truth.md)) |

---

## Product narrative — what we would not redo

- **Big-bang “merge Reporting into Core” in one agent run** — Still wrong for production Liquid; classification + atomic PRs remain the honest pattern.
- **Agents merge on green CI** — Still human; eval pass ≠ ship ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).
- **Claiming this is identical to production Liquid fleet** — Replica of **constraints** (split repos, governance, observability), not a lift-and-shift.
- **Replacing SDK with IDE-only agents** — Loses webhook idempotency, `/evals`, cross-repo cloud sandboxes ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).
- **PostHog → auto-implement** — Curated hero tickets only; analytics informs, SDK executes after human state moves.

---

## If they push back on the retro

| Pushback | Response |
| --- | --- |
| “So the demo is throwaway?” | **Teaching artifact** — patterns (gates, PR-only, eval floor) are what we’d ship; file-backed runs are not. |
| “Why not start with Postgres?” | Interview clock + explainability — disk runs are grep-friendly in the room; prod adds durability without changing the story. |
| “Would you drop two repos?” | Not for this narrative — convergence **classification** is the lesson ([21 · Two-repo](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)). |
| “Eval keywords are naive.” | Acknowledged — that’s why we’d add golden fixtures, not LLM-as-judge blocking. |
| “Why public `/signal`?” | Demo CORS bridge — first prod hardening target, not a pattern we endorse at scale. |

---

## Failure modes we’d design out

| Failure mode | Root cause today | Retro mitigation |
| --- | --- | --- |
| Stuck implement lock | File-backed idempotency in `ops.ts` | Shared store + admin “release lock” |
| Stale Insights citations | Handbook/Linear drift | Publish pipeline + sync checks in CI |
| Double write-gate in implement prompt | `liq-*.ts` + `sdk-planner.ts` ~L427 | Inject gates once at send time |
| Operator confusion dry-run vs live | `DRY_RUN` without loud UI | Status banner on `/evals` + Linear template |
| Signal spam | Public POST | JWT from app BFF |

---

## One paragraph for the interviewer

“We optimized for **explainability in 45 minutes**: Linear states, a small workflow service, deterministic eval, and PR-only SDK agents. If we productionised, I’d invest in **durable workflow state**, **contract-first BFFs**, **stronger signal auth**, and **automated handbook sync** — while keeping the same **human merge and classification** story, because that’s what enterprise customers actually need. The SDK boundary we drew — plan/implement in `sdk-planner.ts`, not skills in the apps — is the part I’d keep verbatim ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888), [11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).”

---

## Linear + GitHub — retro integration

| Integration | Demo | Production retro |
| --- | --- | --- |
| Linear webhooks | HMAC on workflow host | Rotate secret via secrets manager; replay protection |
| Comment `/approve` | `routeLinearCommentApproval` in `linear-webhook.ts` | Tie approval id to eval run uuid |
| GitHub merge → Done | Allowlisted heroes | Label-gated (`hero:KAN-5`) + branch protection audit |
| Slack notifications | Plan complete pings | Same templates auto-post eval URL |

State machine stays — [Workflow 0002](https://linear.app/liquid-accounting/document/decision-workflow-0002-linear-ticket-states-drive-the-workflow-376a80b98e7a) is not throwaway.

---

## Testing & CI — retro pyramid

| Layer | Today | Retro |
| --- | --- | --- |
| Unit | Vitest RTL `assistant-unit` in both apps | Keep — fastest regression signal for KAN-5 |
| E2E | Playwright `parity-proof`, `help-proof`, `e2e/proof/` | Single naming convention across repos |
| Workflow | Manual `/evals/rerun` | CI golden plans on every workflow PR |
| Insights | Server tests on retrieval/grok parse | Contract tests on citation id enforcement |

**Interview angle:** “We’d add CI fixtures before we’d trust a smarter eval judge.”

---

## Security retro (without scope creep)

- **Signal JWT** — first hardening after durable runs ([24 · Harness improvements](./24-interview-workflow-harness-improvements.md)).
- **Workflow tokens** — separate `WORKFLOW_API_TOKEN` vs `APPROVE_TOKEN` with rotation runbook.
- **No CURSOR_API_KEY in analytics** — permanent boundary ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).
- **BFF bearer** — demo token only in dev/test `server/server.mjs` — prod would use real auth, not interview loopback.

---

## What we’d defer (explicitly)

- Full Reporting→Core monolith merge in automation.
- LLM-as-judge blocking implement.
- Auto-merge on green CI.
- Replacing Linear with Insights as workflow SoT.
- Running eval inside Cursor MCP where agents can see checks ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).

Deferring is a feature — shows judgment under time constraints.

---

## Sample bot questions

- **What would you rebuild first?** → Durable run store + handbook publish pipeline (ops + Insights freshness).
- **Is the eval harness enough for prod?** → Floor only; add CI fixtures, optional advisory judge, keep humans + Bugbot.
- **Would you still use two repos?** → For this demo yes; prod path is classified convergence, not one-shot merge.
- **Biggest cost lever?** → Fewer redundant agent runs; tighter specialist prompts; routing policy ([13](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c)).
- **What anti-pattern would you avoid repeating?** → Manual-sync docs without Linear in the same PR (Insights cites stale Linear).
- **What about KAN-5 specifically?** → Keep product/SDK split; version prompts + golden eval fixtures per hero.
- **Would you still use Cursor SDK vs raw API?** → Yes — sandbox + subagents + PR primitives ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).

*Last updated: 2026-09-26.*
