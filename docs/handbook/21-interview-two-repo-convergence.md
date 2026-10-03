> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Two-repo convergence story

**Problem space:** Legacy / split-app modernization (assignment Example A).

**Linear:** [21 · Two-repo story](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00) · **Related:** [07 · SDK / feature map](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) · [11 · Boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)

---

## Sound bites

- **“Customer sees one Liquid; engineering owns Core + Reporting until convergence phase two.”**
- **“SDK classifies shared shell vs report-only — eval forbids big-bang merge language.”**
- **“KAN-5 hero: assistant BFF parity across repos — not monorepo in one PR.”**
- **“KAN-18: notifications seam — signal triages; plan/implement fixes chrome.”**
- **“Duplicated `GET /api/v1/organisation` is intentional drift (KAN-13 class).”**
- **“Human merge on each PR — then later narrate combine repos slide.”**

---

## Product vs engineering reality

| Customer sees | Engineering owns |
| --- | --- |
| One Liquid brand | **Core** + **Reporting** deployables |
| Same nav, assistant, help patterns | Duplicated shell; Reporting drifts |
| Single sign-on narrative (demo) | Separate Vercel projects + BFFs |

**Migration seam ADRs:**

- [Core 0004](https://linear.app/liquid-accounting/document/decision-core-0004-reporting-stays-a-separate-app-until-the-planned-5c528182ac8d)
- [Reporting 0004](https://linear.app/liquid-accounting/document/decision-reporting-0004-reporting-stays-a-separate-app-until-the-a8ca85155c0a)

**Loopback BFF pattern:** each app **`server/server.mjs`** — GET-only synthetic data, demo bearer — secrets stay server-side ([Core 0001](https://linear.app/liquid-accounting/document/decision-core-0001-each-app-has-its-own-loopback-bff-secrets-stay-out-70ddc115826d)).

---

## Why two repos for the interview

### Matches enterprise

Staggered migration, separate CI, separate blast radius — not greenfield monorepo.

### Makes SDK prove value

Cross-repo **classification**, dual PRs, parity tests (`parity-proof`, `help-proof`, `assistant-unit`) — story would collapse if repos already merged.

### Sets up second act

Closing slides: shared package / single shell **without** live big-bang ([23 · Retro](https://linear.app/liquid-accounting/document/23-interview-prep-retro-if-we-built-this-again-a1a0df7a4b7b)).

---

## SDK loop (per hero LIQ)

### Step 1 — Classify

Planner reads **`liquid-workflow/src/feature-map.ts`** + issue prompt **`prompts/liq-*.ts`**.

Shared shell vs report-only vs analytics-adjacent — determines which repo gets edits.

### Step 2 — Plan

Bounded steps, CI job names, Playwright proof, **`guardrails.ts`** gates injected.

Eval requires **both repo names** on KAN-5-class heroes.

### Step 3 — Specialists

**`agents.ts`** — security + quality read-only on seam (CORS, BFF bearer, duplicated routes).

### Step 4 — Eval

**`eval/harness.ts`** — forbids “merge Reporting into Core” plan language ([08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)).

### Step 5 — Implement

**`sdk-planner.ts`** implement mode — `autoCreatePR` → Core and/or Reporting branches.

### Step 6 — Human merge

GitHub human → webhook → Linear Done — optional future **combine repos** phase (closing slide).

**State driver:** **`linear-webhook.ts`** — In Progress / In Review ([Workflow 0002](https://linear.app/liquid-accounting/document/decision-workflow-0002-linear-ticket-states-drive-the-workflow-376a80b98e7a)).

---

## Hero progression (defect taxonomy)

| Ticket | Seam | Client / test hook |
| --- | --- | --- |
| KAN-6 | `#sales-summary` → `#revenue-summary` | Hash routing |
| KAN-16 | `#invoice-performance` miss | Deep link |
| KAN-17 | Help centre dead on Reporting | Help-proof CI |
| KAN-18 | Notifications dead on Reporting | **`demoSignal.ts`** → `/signal` |
| **KAN-5** | **AI Assistant BFF parity (demo hero)** | Assistant rail + `assistant-unit` |

Demo focuses **KAN-5**; others show taxonomy and issue-specific eval checks.

**E2E:** Core `e2e/cross-repo-parity.spec.ts` — KAN-18 notifications expectation.

---

## KAN-5 worked example (convergence without merge)

### Defect

Reporting assistant broken vs Core — same UX promise, two codebases.

### Classification output (plan)

Typical plan buckets:

- **Shared:** assistant BFF route, rail component, env pattern.
- **Reporting-only:** wiring bug, missing route, CORS to loopback.
- **Core:** reference implementation or shared test contract.

### Implement output

One or two PRs — **atomic** per repo; humans merge each.

### Eval

Must mention **meridian-saas (core app)** and **meridian-saas (reporting app)** — not “move Reporting into Core.”

### Done

Merge evidence → Done — convergence **progress**, not repo dissolution.

---

## KAN-18 signal vs plan (same two-repo story)

| Stage | KAN-18 behavior |
| --- | --- |
| User clicks dead Notifications | **`signalNotificationsIncident`** |
| Workflow | `/signal` → Slack + Todo |
| SDK | Starts only when engineer moves **In Progress** on planning work |
| Fix | Plan/implement touch Reporting header + parity tests |

**Contrast KAN-5:** assistant defect vs notifications defect — both straddle Core/Reporting parity theme.

---

## Code paths by repo

### meridian-saas (core app)

- **`server/server.mjs`** — org/dashboard/invoices BFF routes.
- **`src/main.tsx`** — shell chrome.
- Assistant route when on deployed branch (hero prompts reference `POST /api/v1/assistant/chat`).

### meridian-saas (reporting app)

- **`server/server.mjs`** — org + reports routes.
- **`src/demoSignal.ts`** — workflow signal bridge (KAN-18).
- **`src/sentry.ts`** — tags for KAN-18 shell parity.

### liquid-workflow

- **`prompts/liq-24.ts`**, **`feature-map.ts`**, **`sdk-planner.ts`**, **`harness.ts`**.

### meridian-analytics

- Not a third app repo in hero — Insights explains convergence docs ([16](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)).

[22 · Codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1)

---

## What “convergence” means without merge

| Convergence mechanism | In scope for KAN-5? |
| --- | --- |
| Align assistant BFF contract | **Yes** |
| Shared Playwright parity specs | **Yes** |
| Duplicate org endpoint behavior | KAN-13 class — classify |
| Extract `@liquid/shell` package | Second act / narrated |
| Single git repo | **No** in hero implement |

**Say:** “Convergence is contract and chrome alignment across deployables — structural merge is phase two.”

---

## CI as convergence enforcement

| Repo | Jobs (proof) |
| --- | --- |
| Core | `build`, `smoke`, `parity-proof`, `assistant-unit` |
| Reporting | `build`, `help-proof`, `assistant-unit` |

Eval needles embed these names so plans can't hand-wave ([14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).

---

## Tradeoffs

### Two repos vs monorepo

**Pros:** Realistic migration; clear blast radius; dual CI proof. **Cons:** Duplicate code until phase two; higher agent classification burden.

### Duplicated BFF vs shared BFF

**Pros for demo:** Shows drift and classification. **Cons:** More maintenance — intentional problem statement ([Core 0002](https://linear.app/liquid-accounting/document/decision-core-0002-each-app-has-its-own-loopback-bff-secrets-stay-out-70ddc115826d) area decisions on duplication narrative).

### Atomic PR pair vs single PR

**Pros:** Per-repo review and rollback. **Cons:** Two human merges — matches enterprise.

---

## Failure modes

| Failure | Narrative |
| --- | --- |
| Plan only mentions one repo | Eval fail — classification miss |
| Agent proposes monorepo | Eval forbid — reset plan |
| Reporting PR merged, Core not | Partial convergence — humans coordinate |
| Signal confused with fix | KAN-18 teaching moment |

---

## If they push back

### “Why not monorepo day one?”

**Response:** Matches enterprise staggered migration; SDK proves governed loop **at the seam** before structural merge ([21](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)).

### “What is convergence without merge?”

**Response:** Align contracts and chrome across repos with classified shared surface — feature map + dual PRs.

### “What after KAN-5?”

**Response:** Narrated second act — same harness to extract shared package / single shell — out of live scope ([19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624)).

### “Just merge Reporting into Core live”

**Response:** Violates eval and [17 · Constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec) — wrong hero outcome.

---

## Diagram (two-repo loop)

```text
         ┌────────────── Core ──────────────┐
         │  BFF + assistant (reference)    │
         └────────────▲──────────▲─────────┘
                      │ PR       │ parity tests
               ┌──────┴──────────┴──────┐
               │  liquid-workflow SDK  │
               │  plan → eval → implement │
               └──────▲──────────▲──────┘
                      │ PR       │
         ┌────────────┴──────────┴─────────┐
         │  Reporting + demoSignal (KAN-18) │
         └──────────────────────────────────┘
Human merge(s) on GitHub — not agent
```

---

## Sample bot questions

1. **Why not monorepo day one?** Enterprise staggered migration; SDK proves loop before structural merge.
2. **What is “convergence” without merge?** Align contracts and chrome with classified shared surface.
3. **What after KAN-5?** Second act: shared package / single shell — narrated, not live big-bang.
4. **Does eval allow one-repo plans for KAN-5?** No — both repos expected in plan text.
5. **How does KAN-18 relate?** Same parity theme; signal path is Todo-only triage before SDK plan.

*Last updated: 2026-09-26.*
