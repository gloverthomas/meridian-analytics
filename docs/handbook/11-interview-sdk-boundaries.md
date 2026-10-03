> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Where the Cursor SDK starts and stops

**Purpose:** Clear boundaries for “what runs in Cursor cloud” vs “what Liquid owns” vs “what humans must do.”

**Related:** [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [27 · Official brief](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59) · [22 · Codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1) · [11 · Linear mirror](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) · [WRITE-POLICY](https://github.com/gloverthomas/liquid-workflow/blob/main/WRITE-POLICY.md)

**Interview email:** Show **`liquid-workflow/src/sdk-planner.ts`** (`Agent.create` ~L213 plan, ~L392 implement) for SDK start; **`/signal` does not count** as SDK start ([27](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59)).

---

## Sound bites (open with these)

- **“The SDK starts in `sdk-planner.ts` when Linear hits In Progress or In Review — not when Reporting POSTs `/signal`.”**
- **“Cloud agents open PRs; only humans merge `main` and only humans promote prod.”**
- **“Eval is our floor on plan text — TypeScript in `harness.ts`, not an MCP and not an LLM judge.”**
- **“Secrets live on the workflow host and loopback BFFs — never in Vite bundles.”**
- **“KAN-5 is the hero: broken assistant in Reporting → SDK plan/implement; KAN-18 is the contrast: chrome signal → Todo only.”**
- **“Liquid owns the control plane: tokens, kill switches, routing in `models.ts`, gates in `access.ts`.”**
- **“Specialists are read-only PASS/FAIL — the implement parent is the only writer that opens PRs.”**

---

## Mental model: three layers

### Layer 1 — Cursor cloud (SDK)

Isolated workers clone configured repos, run with injected prompts and subagent roster, and may call `autoCreatePR`. This is **`@cursor/sdk`** in **`liquid-workflow/src/sdk-planner.ts`**, not the in-app Grok assistant and not Meridian Insights chat.

### Layer 2 — Liquid control plane (your code)

HTTP service, webhooks, deterministic eval, model routing, formal approve, and prompt guardrails. The model does **not** choose its own role, bypass eval, or merge.

### Layer 3 — Humans + GitHub + Vercel

Merge authority, deploy authority, and “is this plan good enough to implement?” judgment. Slack/Linear chat is **notification and approve**, not deploy approval when `REQUIRE_FORMAL_APPROVAL` is on.

---

## SDK **starts** here

### Linear state machine (primary demo path)

| Linear state transition | Workflow handler | SDK call | Mode |
| --- | --- | --- | --- |
| → **In Progress** | `linear-webhook.ts` → `startPlanRun` | `Agent.create` in `sdk-planner.ts` | `mode: plan`, `autoCreatePR: false` |
| → **In Review** (after approve + gates) | same webhook path → `startImplementRun` | `Agent.create` | `mode: agent`, `autoCreatePR: true` |

**Routing code:** `liquid-workflow/src/linear-webhook.ts` — `routeLinearWebhook` maps team/issue/state to plan vs implement. **Do not** conflate this with Insights `server/actions/linearTransition.ts` (confirm-gated, allowlisted moves for operators).

### Manual operator triggers

| Route | Auth (`access.ts`) | Effect |
| --- | --- | --- |
| `POST /trigger` | Bearer `WORKFLOW_API_TOKEN` | Plan run (same as In Progress) |
| `POST /implement` | Token + eval/approve gates | Implement run |

**Server wiring:** `liquid-workflow/src/server.ts` registers webhooks and gated POST bodies.

### Parent run spawns specialists

Defined in **`liquid-workflow/src/agents.ts`** and injected into the SDK `agents` block:

| Subagent | Role | Writes code? |
| --- | --- | --- |
| `security-reviewer` | Auth, CORS, token leakage | **No** — read-only |
| `quality-reviewer` | Parity, diff hygiene, CI names | **No** — read-only |

Implement parent consumes PASS/FAIL; eval still keyword-checks plan/implement **text** afterward.

### Credentials and isolation

- **`CURSOR_API_KEY`** — workflow host only (`config.ts`); never Core/Reporting/Insights browser bundles ([Core 0001](https://linear.app/liquid-accounting/document/decision-core-0001-each-app-has-its-own-loopback-bff-secrets-stay-out-70ddc115826d)).
- **`DRY_RUN=true`** — skips real `Agent.create` for local dev; interviewers still see the same HTTP/eval paths.

### Cloud agents vs IDE

Same infrastructure family as Cursor cloud / background agents; this demo uses the **programmatic SDK** surface. IDE skills helped build repos; **graded exercise** is `Agent.create` in workflow ([10 · SDK vs skills](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).

---

## SDK **stops** here (hard lines)

### Authority table

| Action | Who | Evidence |
| --- | --- | --- |
| Merge to `main` | **Human** on GitHub | [Workflow 0001](https://linear.app/liquid-accounting/document/decision-workflow-0001-agents-open-prs-humans-approve-merge-and-deploy-9e0dc91029a3), Core/Reporting 0005 |
| Production deploy | **Human** (Vercel) | Narrate preview vs prod |
| Linear **Done** after hero fix | **GitHub merge webhook** → workflow | `github-webhook.ts`, `linear-done.ts` — not agent self-close without merge |
| Treat Slack thread as ship approval | **Forbidden** when formal approve on | `/approve`, `APPROVE_TOKEN` |
| Big-bang “merge Reporting into Core” in one agent run | **Out of scope** | Eval forbids language ([08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)) |
| `/signal` from broken Reporting chrome | **Slack + Linear Todo only** | **Does not** start SDK plan |

### Prompt enforcement (verbatim gates)

**`liquid-workflow/src/guardrails.ts`:**

- **`HUMAN_WRITE_GATE`** — plan must await human approval before implement language.
- **`VISUAL_PROOF_GATE`** — Playwright/visual proof expectations for hero issues.

Copied into prompts per issue under `src/prompts/liq-*.ts` (hero **`liq-24.ts`** for assistant parity).

---

## What is **not** an SDK start

### `/signal` path (KAN-18 contrast)

**Reporting:** `src/demoSignal.ts` POSTs to `VITE_WORKFLOW_SIGNAL_URL` or `http://127.0.0.1:4100/signal` with payload `issueIdentifier: "KAN-18"`.

**Workflow:** `POST /signal` is **public** (CORS) per **`access.ts`** — creates curated Slack + moves ticket to **Todo**; **`SIGNAL_ENABLED`** kill switch.

**Say aloud:** “Product triage without spinning a cloud agent — operators still move to In Progress when they want a plan.”

### In-app AI Assistant (KAN-5)

**Core/Reporting** `POST /api/v1/assistant/chat` (loopback BFF in `server/server.mjs` when present on branch) uses **Grok/xAI or fixture** — user-facing chat, **not** `Agent.create`. The **same KAN-5 ticket** later drives SDK plan/implement when Linear enters In Progress.

### Meridian Insights chat

**`meridian-analytics/server/app.ts`** — retrieve → **`server/grok/client.ts`** → citations. Confirm-gated Linear moves; **never** holds `CURSOR_API_KEY` ([Insights 0003](https://linear.app/liquid-accounting/document/decision-insights-0003-actions-are-rule-detected-and-confirm-gated-208ee5ead2d9)).

---

## KAN-5 worked example (assistant parity)

### User-visible defect

Reporting AI Assistant rail broken or mismatched vs Core; hero narrative in Linear **KAN-5**.

### SDK-side story

1. Ticket **Todo** → move **In Progress** (demo or Insights confirm-gate).
2. **`startPlanRun`** loads **`prompts/liq-24.ts`** — classifies shared shell vs report-only using **`feature-map.ts`**.
3. Specialists scan seam; plan text hits eval needles (repos, CI job names, write-gate wording).
4. Human **approve** (`POST /approve` or Slack flow).
5. **In Review** → **`startImplementRun`** → PR(s) on Core and/or Reporting.
6. Human **merge** → webhook → **Done**.

### What to show in the room

- Prod UI: assistant broken on Reporting, works on Core (or narrate).
- GitHub: open PR from implement — **not** merged by agent.
- **`GET /evals/latest?issue=KAN-5`** on workflow host.

---

## KAN-18 vs KAN-5 (signal vs plan)

| | **KAN-18** (notifications) | **KAN-5** (assistant) |
| --- | --- | --- |
| User action | Click dead Notifications in Reporting header | Use broken assistant rail |
| Client code | `demoSignal.ts` → `/signal` | Assistant BFF + UI |
| Workflow | Todo curation, Slack | In Progress → plan → … |
| SDK | **Not started** by signal | **Started** on In Progress |
| Teaching point | Product telemetry → ticket without agent spend | Full governed loop |

E2E: Core `e2e/cross-repo-parity.spec.ts` documents KAN-18 parity expectation.

---

## Liquid-owned control plane (not “the model deciding”)

| Component | Path | Role |
| --- | --- | --- |
| HTTP API + kill switches | `config.ts`, `server.ts` | `WORKFLOW_ENABLED`, `SIGNAL_ENABLED`, `LINEAR_AUTO_ENABLED` |
| Route auth | `access.ts` | Public read; token on trigger/implement |
| Eval harness | `eval/harness.ts` | Pass/fail on artifacts; blocks implement when `EVAL_GATE=true` |
| Model routing | `models.ts` | Per-role `optimize_for` + env overrides ([13 · Routing](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c)) |
| Linear state machine | [Workflow 0002](https://linear.app/liquid-accounting/document/decision-workflow-0002-linear-ticket-states-drive-the-workflow-376a80b98e7a) | States drive plan/implement |
| Insights BFF | `analytics/server/app.ts`, `auth.ts` | Retrieve bounds; Grok writes; citations enforced |

---

## Diagram (say aloud)

```text
Linear state ──webhook──► liquid-workflow ──SDK (sdk-planner.ts)──► Cursor cloud agent
                              │                      │
                              │ eval (harness.ts)    └──► GitHub PR (open)
                              │ models.ts roster
Reporting /signal ──► Todo only (no SDK)
Human ◄── merge ── GitHub ◄───┘
Human ◄── approve ── Slack / Linear /approve
```

---

## Tradeoffs

### Why webhook-driven SDK vs “run agent from IDE”

**Pros:** Repeatable demo, eval artifacts, multi-operator gates, Linear as SoT for state. **Cons:** Tunnel/HMAC ops, must keep Linear docs in sync for Insights ([documentation-sync.md](./documentation-sync.md)).

### Why PR-only implement mode

**Pros:** Human diff review, CI on branch, matches enterprise policy. **Cons:** Slower hero closure; narrate merge or show prior merged PR.

### Why deterministic eval vs LLM judge

**Pros:** Stable CI for plans, cheap, auditable `runs/eval_*.json`. **Cons:** Keyword floor — bad but eloquent plans can pass; humans approve plans ([14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).

---

## Failure modes (honest demo beats)

| Symptom | Likely layer | What to say |
| --- | --- | --- |
| Plan never starts | `WORKFLOW_ENABLED`, missing `CURSOR_API_KEY`, `DRY_RUN` | “Control plane blocked — gates working” |
| Implement blocked | Eval fail, no approve, `EVAL_GATE` | Open `/evals` — show `human-write-gate` |
| `/signal` 403 | `SIGNAL_ENABLED=false` | Product triage off — flip or narrate |
| PR open but CI red | GitHub checks | Agent did its job; human shouldn’t merge |
| Done didn’t fire | Merge webhook / wrong `LIQ-*` in PR body | Human merge is SoT for Done |

---

## If they push back

### “Agents should merge when CI is green”

**Response:** Removes accountability and violates assignment + [Workflow 0001](https://linear.app/liquid-accounting/document/decision-workflow-0001-agents-open-prs-humans-approve-merge-and-deploy-9e0dc91029a3). CI green is necessary, not sufficient — plan quality and seam classification still matter.

### “`/signal` should start planning automatically”

**Response:** That would spend cloud agent cycles on every chrome click and bypass human Todo curation. Signal is **intentionally** separate ([25 · Tooling SoT](https://linear.app/liquid-accounting/document/25-interview-prep-tooling-source-of-truth-vs-notification-vs-execution-36bbd0a06822)).

### “Why not run SDK inside Core BFF?”

**Response:** Would embed `CURSOR_API_KEY` in app deploy surface and duplicate gates per repo. Workflow is the **single** control plane ([22 · Codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1)).

### “Eval passed so the plan must be good”

**Response:** Eval is a **floor** on required phrases — specialists + human approve are the ceiling. Point to [09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67) for Bugbot advisory layer.

---

## Cross-repo boundaries

| Repo | SDK runs here? | Agent edits? |
| --- | --- | --- |
| liquid-workflow | **Yes** | Workflow code via normal dev PRs |
| meridian-saas (core app) | No | Yes — BFF + UI |
| meridian-saas (reporting app) | No | Yes — includes `demoSignal.ts` |
| meridian-analytics | No | Insights only; workflow API bearer for reads/approve |

---

## Pre-demo checklist (boundaries)

- [ ] Hero **KAN-5** in Todo or known state
- [ ] `/status` — know `DRY_RUN`, `EVAL_GATE`, `REQUIRE_FORMAL_APPROVAL`
- [ ] Tab ready: `sdk-planner.ts` + `guardrails.ts` + `linear-webhook.ts`
- [ ] Can explain KAN-18 signal in one sentence vs KAN-5 SDK path

---

## Sample bot questions

1. **Does the SDK deploy to production?** No — PRs and previews only; humans ship on Vercel.
2. **Can an agent move a ticket to Done without a merge?** Not the happy path; merge webhook drives Done for cited hero `LIQ-*`.
3. **What if eval passes but the plan is wrong?** Eval is a floor; humans approve plans; Bugbot + CI are separate layers ([09](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).
4. **Where do secrets live?** Workflow host + each app’s loopback BFF — never `VITE_*` for privileged keys.
5. **Does `/signal` call `Agent.create`?** No — Slack + Linear Todo only; SDK starts on In Progress / `/trigger`.

*Last updated: 2026-09-26.*
