> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: SDK in the codebase (where to look)

**Purpose:** Concrete map from “where does the cloud agent story live?” to repo paths, env vars, and HTTP routes — for live Q&A, Meridian Insights retrieval, and the official **open the repo** exercise.

**Related:** [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [10 · SDK vs alternatives](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) · [11 · SDK boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) · [27 · Official brief](./27-interview-official-email-brief.md) · [16 · Insights demo Q&A](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)

**Official exercise:** Interviewers open the repo and walk **trigger → output**. Primary SDK pointer: `liquid-workflow/src/sdk-planner.ts` (`Agent.create` ~L213 plan, ~L392 implement). Primary Grok pointer: `meridian-analytics/server/grok/client.ts` (~L23–32). Full script: [27](./27-interview-official-email-brief.md).

---

## Sound bites (memorize before grep)

- **“Only `liquid-workflow` calls `@cursor/sdk` — everything else is product code agents edit.”**
- **“KAN-5 is Grok in the chat bubble; the SDK fixes the Reporting BFF seam after Linear says In Progress.”**
- **`/signal` is triage (Slack + Linear Todo) — it never hits `Agent.create` ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).”**
- **“Eval lives in `harness.ts` on the workflow host — not MCP, not in Core ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).”**
- **“Secrets: `CURSOR_API_KEY` on workflow; demo bearer on each app’s loopback BFF — never `VITE_*` for privileged keys ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).”**

---

## Four repos, four jobs

| Repo | Role in the SDK story | SDK touches it? |
| --- | --- | --- |
| **[liquid-workflow](https://github.com/gloverthomas/liquid-workflow)** | Control plane: webhooks, `@cursor/sdk` `Agent.create()`, eval, routing | **Yes — this is where the SDK runs** |
| **meridian-saas (core app)** | Canonical app + loopback BFF; agent PR targets | Edited by cloud agents |
| **meridian-saas (reporting app)** | Drifted shell + `/signal` bridge; agent PR targets | Edited by cloud agents |
| **meridian-analytics** | Meridian Insights — reads workflow/Linear/GitHub; **no** `CURSOR_API_KEY` | Orchestrates humans via confirm-gated Linear moves only |

**Cross-check boundaries:** [11 · Starts and stops](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) · **Why not a skill:** [10 · SDK vs alternatives](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221).

---

## liquid-workflow — start here for SDK

**Entry:** `src/server.ts` — HTTP on `HOST`/`PORT` (default `127.0.0.1:4100`; prod tunnel → `workflow.meridian-saas.local`).

**SDK call site:** `src/sdk-planner.ts` — `import { Agent } from "@cursor/sdk"`; exported `startPlanRun` (~L144) / `startImplementRun` (~L273).

### Core modules (file → interview one-liner)

| Concern | Path | Line anchors (main) |
| --- | --- | --- |
| Plan/implement prompts per hero | `src/prompts/liq-9.ts`, `liq-15.ts`, `liq-16.ts`, `liq-17.ts`, **`liq-24.ts`** | KAN-5 routing: `sdk-planner.ts` ~L238 plan / ~L417 implement via `isLiq24()` in `liq-24.ts` ~L5–7 |
| Runtime verification paths for agents | `src/feature-map.ts` | Table rows ~L11–16 (Assistant, Notifications, Help, Signal) |
| Write-gate + visual proof (verbatim) | `src/guardrails.ts` | `HUMAN_WRITE_GATE` ~L5; injected again on implement in `sdk-planner.ts` ~L427 |
| Specialist subagent defs | `src/agents.ts` | Read-only security + quality reviewers in SDK `agents` block |
| Model routing | `src/models.ts` | Per-role `optimize_for`; env overrides — see [07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) |
| Deterministic eval | `src/eval/harness.ts` | KAN-5 plan checks ~L61–73 (`mentions-ai-assistant`, `mentions-core-and-reporting`); implement ~L192–198 (`implement-ai-assistant`) |
| Linear → plan/implement | `src/linear-webhook.ts` | `routeLinearWebhook` ~L55–73 — In Progress → plan; In Review → implement |
| Merge → Linear Done | `src/github-webhook.ts`, `src/linear-done.ts` | Evidence after **human** merge |
| Route auth policy | `src/access.ts` | `/signal` public ~L20; `/trigger`/`/implement` need bearer |
| Kill switches | `src/config.ts` | `WORKFLOW_ENABLED` ~L86, `SIGNAL_ENABLED` ~L88, `EVAL_GATE`, `CI_GATE`, `CURSOR_API_KEY` ~L39–49, `DRY_RUN` ~L39 |

### HTTP routes (memorize for interview)

| Route | Auth | Effect | Code pointer |
| --- | --- | --- | --- |
| `GET /`, `/status`, `/evals` | Public read | Dashboards + eval history | `server.ts` ~L457+ (`/evals`) |
| `POST /webhooks/linear` | HMAC | In Progress → plan; In Review → implement (when gates pass) | `server.ts` ~L584–647 |
| `POST /webhooks/github` | HMAC | Merge evidence → Done | github webhook handler in `server.ts` |
| `POST /trigger` | `WORKFLOW_API_TOKEN` | Manual plan kick | `server.ts` ~L515 |
| `POST /implement` | Token + eval/approve gates | Implement run | `server.ts` ~L530 |
| `POST /signal` | **Public** (CORS) | Slack + Linear Todo — **no SDK plan** | `handleSignal` ~L279; pathname ~L524 |
| `GET/POST /approve` | `APPROVE_TOKEN` or API token | Formal approve before implement | approve routes in `server.ts` |

**Env (workflow host only):** `CURSOR_API_KEY`, `WORKFLOW_API_TOKEN`, `APPROVE_TOKEN`, `LINEAR_*`, `GITHUB_*`, repo URLs — see `liquid-workflow/.env.example`. **`DRY_RUN=true`** skips real `Agent.create` (~L161–207 in `sdk-planner.ts`) for local dev without a key.

---

## KAN-5 walkthrough (code map)

**Hero:** AI Assistant parity — Core works; Reporting chrome matches but send fails until BFF is wired.

### Product path (Grok/fixture — not SDK)

| Step | What happens | Where to point |
| --- | --- | --- |
| 1. User opens rail | Topbar **AI Assistant** → right rail | `feature-map.ts` ~L11 |
| 2. Browser → BFF | `POST /api/v1/assistant/chat` (when present on branch) | Prompt contract in `liq-24.ts` ~L28–29; Core/Reporting `server/server.mjs` on GitHub `main` when merged |
| 3. Reply | Grok/xAI when keyed, else fixture | Same BFF pattern as Insights Grok — different repo ([15 · Grok vs SDK](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed)) |

**VM note:** Local clone of Core/Reporting may lag prod; verify on GitHub `main` or prod UI if grep finds no `assistant` route locally.

### SDK path (fix lands via PR)

| Step | Linear / HTTP | Code chain |
| --- | --- | --- |
| 1. Plan | Issue **In Progress** (webhook) or `POST /trigger` | `linear-webhook.ts` ~L67–68 → `server.ts` ~L609 → `startPlanRun` |
| 2. Prompt | KAN-5 bounded scope | `liq-24.ts` `buildLiq24PlanPrompt` ~L9–44 |
| 3. SDK | Cloud planner, no PR | `sdk-planner.ts` ~L213 `Agent.create`, `mode: "plan"`, `autoCreatePR: false` |
| 4. Eval | Deterministic checks | `harness.ts` ~L61–73 + shared plan checks ~L127–187 |
| 5. Human | Approve plan (Slack `/approve` or `/approve` route when required) | `linear-webhook.ts` comment approval ~L80+ |
| 6. Implement | **In Review** + gates | `server.ts` ~L647 → `startImplementRun` ~L392 `Agent.create`, `autoCreatePR: true` |
| 7. Output | Open PR(s), `/evals`, run JSON under `runs/` | Same file + public dashboards |

**Say aloud:** “The customer sees Grok in the assistant; the interviewer sees the SDK in `sdk-planner.ts` when we deliberately move workflow states.”

---

## Signal vs SDK (do not conflate in the demo room)

| Path | Trigger | Code entry | Workflow route | Starts SDK? |
| --- | --- | --- | --- | --- |
| **Signal / triage** | Broken notifications (KAN-18) or curated chrome failure | `meridian-saas (reporting app)/src/demoSignal.ts` ~L7–21 POST | `POST /signal` → `handleSignal` ~L279 (`mode: "triage_only"` ~L319) | **No** — Slack + Linear Todo |
| **SDK plan** | Linear **In Progress** or operator `/trigger` | `linear-webhook.ts` ~L55 → `server.ts` | `startPlanRun` ~L144 | **Yes** |
| **SDK implement** | Approve + **In Review** + gates | same | `startImplementRun` ~L273 | **Yes** → PR |

**KAN-5 vs KAN-18:** Assistant hero uses SDK on state change; notifications demo uses `demoSignal.ts` with hard-coded `KAN-18` payload ~L15–19 — still **not** an SDK start.

**Narration line:** “Observability **informs** heroes; `/signal` **raises** Todo; the **SDK** fixes after In Progress.”

---

## Core & Reporting — what agents edit (not where SDK runs)

**Pattern:** Vite SPA in `src/`; synthetic **loopback BFF** in `server/server.mjs` (GET-only for most routes, bearer `LIQUID_BFF_DEMO_TOKEN`, `NODE_ENV` development|test only).

| App | BFF routes (typical on `main`) | Client fetch |
| --- | --- | --- |
| Core | `/api/v1/organisation`, `/dashboard`, `/invoices` | `src/main.tsx` |
| Reporting | `/api/v1/organisation`, `/reports/profit-loss`, `/reports/cash-flow` | `src/main.tsx` |

**Intentional duplication:** Both expose `GET /api/v1/organisation` (KAN-13) — convergence classifies later; eval rejects “shared BFF in one PR” plan language ([21 · Two-repo story](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)).

**Workflow bridge (Reporting only):** `src/demoSignal.ts` → `POST` to `VITE_WORKFLOW_SIGNAL_URL` or `http://127.0.0.1:4100/signal`.

**Observability (browser-safe):** `src/analytics.ts` — `VITE_POSTHOG_*` only; `src/sentry.ts` — client errors (including deep-link / signal product events).

**CI proof gates:** Core `.github/workflows/ci.yml` — `build`, `smoke`, `parity-proof`, `assistant-unit` (when present on branch). Reporting — `build`, `help-proof`, `assistant-unit`.

---

## meridian-analytics — Insights (adjacent, not SDK)

**BFF:** `server/app.ts` (routing ~L181 `POST /api/v1/insights/chat`), `server/index.ts` (local `:4200`), `api/index.ts` (Vercel).

| Concern | Path |
| --- | --- |
| Auth (access code + session) | `server/auth.ts` — `LIQUID_INSIGHTS_ACCESS_CODE`, `LIQUID_SESSION_SECRET` |
| Chat + retrieval | `server/chatTurn.ts`, `server/insights.ts`, `server/handbook/` |
| Grok HTTP | `server/grok/client.ts` ~L23 `XAI_CHAT_URL`, ~L32 POST |
| Confirm-gated Linear move | `server/actions/linearTransition.ts`, `server/actions/token.ts` |
| Workflow read + approve implement | `WORKFLOW_BASE_URL`, `WORKFLOW_API_TOKEN` in `.env.example` |

Insights **never** holds `CURSOR_API_KEY`; it calls workflow with the shared API bearer for **control-plane reads/actions**, not browser agent spawn ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).

---

## “Show in code” cheat sheet (demo room)

1. **Where is `Agent.create`?** → `liquid-workflow/src/sdk-planner.ts` ~L213 (plan), ~L392 (implement).
2. **Where is eval not an MCP?** → `liquid-workflow/src/eval/harness.ts` — server-side only ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).
3. **Where does Reporting triage without agents?** → `reporting/.../src/demoSignal.ts` ~L11–21 + workflow `POST /signal` ~L279.
4. **Where do secrets stop?** → Workflow env + each app’s `server/server.mjs` — not `VITE_*` for privileged keys.
5. **Where can a PM move a ticket?** → Insights `linearTransition.ts` — allowlisted states only, confirm token.
6. **Where is KAN-5 prompt law?** → `liquid-workflow/src/prompts/liq-24.ts` + `${LIQUID_FEATURE_MAP}` from `feature-map.ts`.

---

## If they push back (codebase edition)

| Pushback | Response + pointer |
| --- | --- |
| “Reporting has workflow code.” | Only **client** `demoSignal.ts` POST — no `@cursor/sdk` import anywhere in app repos. |
| “`/signal` started the agent.” | Log line `triage_only` in `handleSignal` ~L319; no `startPlanRun` on that route. |
| “Eval is in the IDE.” | `GET /evals` on workflow host; `harness.ts` reads plan **text** from run records. |
| “Insights spawns agents.” | Grok + retrieval only; implement approve uses workflow token, not `CURSOR_API_KEY`. |
| “Why two Grok surfaces?” | Product BFF (assistant) vs Insights BFF — both satisfy email’s Grok API path; SDK is separate ([27](./27-interview-official-email-brief.md)). |

---

## Failure modes (explain the layer, don’t bluff)

| Symptom | Likely layer | What to show |
| --- | --- | --- |
| Plan never starts | `WORKFLOW_ENABLED` / `LINEAR_AUTO_ENABLED` false | `/status` flags in `server.ts` ~L105 |
| “Need API key” on implement | Missing `CURSOR_API_KEY` with `DRY_RUN=false` | `config.ts` ~L33–34 |
| Implement blocked | `EVAL_GATE` or formal approval | `/evals/latest?issue=KAN-5`; [14 · Evals & merge](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) |
| Signal 503 | Kill switch | `handleSignal` ~L288–293 |
| Assistant send fails in Reporting | **Intentional defect** until KAN-5 implement merges | UI + `liq-24.ts` scope ~L27–35 |
| Dry-run confusion | Synthetic plan text only | `sdk-planner.ts` ~L161–207 — label in Linear comment |

---

## Operator URLs (prod-shaped)

- Workflow status: `http://127.0.0.1:4100/status`
- Eval dashboard: `http://127.0.0.1:4100/evals`
- Latest KAN-5 eval JSON: `/evals/latest?issue=KAN-5&kind=plan`
- Core / Reporting prod: `meridian-saas.local`, `reporting.meridian-saas.local`
- Insights: `localhost:5173` (Grok path starts in analytics BFF, not workflow)

---

## CLI & operator glue (not the graded SDK start)

| Tool | Role | SDK? |
| --- | --- | --- |
| `cli-trigger.ts` (workflow repo) | Operator POST to `/trigger` or `/implement` with bearer token | Invokes same `startPlanRun` as webhook — **service** still owns SDK |
| Tunnel / systemd on workflow host | Exposes `workflow.meridian-saas.local` | Infra only |
| Cursor IDE + skills | Port UI, author prompts | **Not** the interview exercise path ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)) |

**Say:** “I may have used skills to write `liq-24.ts`; the graded integration is `Agent.create` in a deployed service.”

---

## Model routing quick map (`src/models.ts`)

Interviewers sometimes jump from SDK to “who picks the model?”

| Role | Typical routing | Config surface |
| --- | --- | --- |
| Planner | `auto-smart` + `optimize_for: intelligence` (plan) | Env overrides in `models.ts` |
| Implementer | `auto-smart` + balanced/cost tradeoffs | Same |
| security-reviewer | Read-only subagent | SDK `agents` block in `agents.ts` |
| quality-reviewer | Read-only subagent | Playwright / out-of-scope focus |

Deep reference: [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [13 · Routing Q&A](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c).

---

## Hero issue → prompt file (routing table)

| Linear id | Prompt module | Primary UI surface |
| --- | --- | --- |
| KAN-6 (default) | `src/prompts/liq-9.ts` | Legacy `#sales-summary` → `#revenue-summary` |
| KAN-16 | `liq-15.ts` | `#invoice-performance` deep-link miss |
| KAN-17 | `liq-16.ts` | Help centre parity |
| KAN-18 | `liq-17.ts` | Notifications bell + `/signal` narrative |
| **KAN-5** | **`liq-24.ts`** | **AI Assistant** right rail |

Routing logic: `sdk-planner.ts` ~L238 (plan) and ~L417 (implement) — not in app repos.

---

## Merge webhook chain (after human merge)

1. Human merges PR on GitHub (not agent).
2. `POST /webhooks/github` on workflow host validates signature.
3. `linear-done.ts` (and related helpers) move allowlisted hero issues toward **Done** with merge evidence.
4. SDK never invoked on this path — boundary [11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9).

**Failure mode:** Expecting agent to close Linear without merge — wrong story; cite merge webhook instead.

---

## Insights retrieval bundle (what RAG reads)

Meridian Insights indexes handbook sections (07–27 on Linear) plus live connectors:

| Source | Workflow SDK? | Typical use in demo |
| --- | --- | --- |
| Linear issues/docs | No | Cite KAN-5 scope |
| GitHub file snippets | No | Point to `sdk-planner.ts` |
| Workflow `/status`, `/evals` | Read via API token | Pipeline tile / eval summary |
| Handbook markdown | No | Same content as these interview prep pages |

Ask Insights: “Where does Agent.create live?” — citations should converge on this doc + [07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888).

---

## Sample bot / interviewer questions

- **Which file calls the Cursor SDK?** → `liquid-workflow/src/sdk-planner.ts`.
- **What env var starts a real cloud agent vs dry-run?** → `CURSOR_API_KEY` vs `DRY_RUN=true`.
- **Does Core contain workflow code?** → No — only BFF + UI; optional PostHog/Sentry; agents patch via PRs.
- **What URL does Reporting hit when notifications are broken?** → Workflow `/signal` (see `demoSignal.ts` ~L7–8).
- **Where is the human write-gate text defined?** → `liquid-workflow/src/guardrails.ts` (`HUMAN_WRITE_GATE`).
- **Walk KAN-5 trigger → output for a plan.** → Linear In Progress → `linear-webhook.ts` ~L67 → `startPlanRun` → `/evals` + `runs/*.json`.
- **Does `/signal` count for the official SDK exercise?** → **No** ([27](./27-interview-official-email-brief.md), [11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).
- **Where do KAN-5 eval check ids live?** → `harness.ts` ~L61–73 (plan), ~L192–198 (implement).

*Last updated: 2026-09-26.*
