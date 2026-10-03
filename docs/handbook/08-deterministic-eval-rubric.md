> 📌 **Manual sync:** Edit this file and [Linear 08](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) in the same change ([documentation-sync.md](./documentation-sync.md)). Insights RAG reads Linear.

# Deterministic eval rubric (reference)

**Purpose:** Exact pass/fail checks Liquid applies to plan and implement artifacts — for Insights, demos, and operators. This is **not** an MCP tool and **not** an LLM judge.

**Code:** [liquid-workflow `src/eval/harness.ts`](https://github.com/gloverthomas/liquid-workflow/blob/main/src/eval/harness.ts)

**Decision:** [Workflow 0003](https://linear.app/liquid-accounting/document/decision-workflow-0003-plans-are-scored-by-a-deterministic-rubric-not-2984bc0eccfd)

**Dashboard:** http://127.0.0.1:4100/evals · JSON: `/evals/latest?issue=KAN-5`

**Related:** [07 · SDK & cloud agents](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) (verbatim KAN-5 prompt blocks) · [09 · PR review stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67) · [14 · Interview evals & gates](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)

---

## How eval works

1. After each plan or implement run, `evaluateRun(record)` concatenates `summary` + `error` text.
2. Each **check** is a keyword/phrase match (case-insensitive). `requireMention(id, desc, needles, required)`:
   - `required: true` → **pass** if any needle appears.
   - `required: false` → **pass** if **no** needle appears (used for forbidden phrases).
3. Overall **passed** only if every check passes.
4. Report saved as `runs/eval_*.json`; linked on run record and Slack/Linear briefs.

**Limits:** A plan can pass rubric but still be wrong substantively. Eval is a **floor**; humans approve; Bugbot + CI are separate evidence (see matrix below).

---

## Eval gate and implement gate (how they interact)

Eval is one layer in the **implement** entry stack. It does **not** replace human judgment, specialist PASS/FAIL, or GitHub required checks.

| Step | What happens | Config / code |
| --- | --- | --- |
| Plan completes | `evaluateRun` on plan artifact | Always (when eval enabled) |
| Plan eval **fail** | Implement blocked | `EVAL_GATE=true` (default) — latest **plan** eval must pass |
| Human **approve** | Formal token / UI approve | `REQUIRE_FORMAL_APPROVAL` — Slack alone is not enough when on |
| Optional **main CI green** | Workflow refuses implement until `main` checks pass | `CI_GATE` (off in some demos; on in stricter envs) |
| Linear **In Review** or `POST /implement` | `startImplementRun` if all gates pass | `linear-webhook.ts`, `sdk-planner.ts` |
| Implement completes | Second `evaluateRun` on implement summary | Catches merge claims, missing proof language |

**Order to explain in demos:** kill switch → plan exists → **plan eval pass** → **formal approve** → optional **CI_GATE** → implement → **implement eval** → agent opens PR → **GitHub CI + Bugbot + humans** (see [09](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).

**`EVAL_GATE=true` (default):** implement blocked unless latest **plan** eval passed. Implement-run eval failure does not retroactively “un-pass” the plan; it flags the implement summary for operators and Insights.

**Demo bypass (non-prod only):** `IMPLEMENT_BYPASS_EVAL_ON_LINEAR` — **off in production** ([Workflow 0003](https://linear.app/liquid-accounting/document/decision-workflow-0003-plans-are-scored-by-a-deterministic-rubric-not-2984bc0eccfd)).

**Pushback — “Can we skip eval if the plan looks good?”** No for default prod path. Eval is cheap, deterministic, and auditable. Use `/evals/rerun` or fix plan wording; do not bypass unless an explicit env bypass is documented for a dry run.

**Pushback — “Eval passed so merge is safe.”** Wrong. Eval only keyword-scans **agent text**. CI runs real builds/tests; Bugbot and Security Agent review the **diff**; humans merge.

---

## Eval vs specialists vs Bugbot vs CI

| Mechanism | Input | Output | Blocks implement? | Blocks merge? |
| --- | --- | --- | --- | --- |
| **Deterministic eval** | Plan/implement **summary text** | Pass/fail + check ids | Yes (plan eval + gates) | No |
| **Specialist subagents** | Repo diff (SDK read-only) | PASS/FAIL in agent thread | No — parent must spawn; eval only checks plan **mentions** specialists | No |
| **GitHub Actions CI** | Code on PR branch | Required check contexts | Only if `CI_GATE` watches `main` | **Yes** (branch protection) |
| **Bugbot** | PR diff | Review comments | No | No |
| **Cursor Security Agent** | PR diff | Security findings | No | No |
| **Human approve / merge** | Product judgment | Approve token; merge button | Approve blocks implement when required | **Merge: humans only** |

Specialists are **advisory inside the cloud run**; eval never parses their JSON — only whether the plan text says security/quality/subagent/specialist/reviewer. Bugbot never sees the plan rubric.

---

## Required CI job names (Core vs Reporting)

Branch protection and plan rubric both expect these **GitHub Actions job ids** (workflow `CI` in each repo). Eval `ci-jobs` / `ci-named` checks look for these strings in plan/implement text — they do **not** query GitHub.

### meridian-saas (core app) (`/.github/workflows/ci.yml`)

| Job id | Depends on | What it proves |
| --- | --- | --- |
| `build` | — | `npm run build` |
| `assistant-unit` | `build` | Vitest + RTL on `AiAssistant` (welcome, send, accordion, related questions) |
| `smoke` | `build` | Playwright `e2e/smoke.spec.ts` on Core preview |
| `parity-proof` | `build` | Cross-repo Playwright (`cross-repo-parity` + proof PNGs); artifact **help-parity-proof** |

Core is the **only** repo that runs `smoke` and `parity-proof` in the demo stack.

### meridian-saas (reporting app) (`/.github/workflows/ci.yml`)

| Job id | Depends on | What it proves |
| --- | --- | --- |
| `build` | — | `npm run build` |
| `assistant-unit` | `build` | Same assistant unit suite as Core |
| `help-proof` | `build` | Playwright proof via `npm run test:e2e:proof`; artifact **help-proof** (legacy name — includes KAN-5 assistant shell proofs) |

Reporting does **not** define `smoke` or `parity-proof`; KAN-5 convergence still expects **both apps** named in the plan and Core parity CI called out.

**Insights answer shape:** “Core needs `build`, `assistant-unit`, `smoke`, `parity-proof`; Reporting needs `build`, `assistant-unit`, `help-proof`.”

---

## Common plan checks (all hero tickets)

These apply when `record.kind === "plan"` or status is `dry_run`:

| Check id | Description | Must mention (examples) |
| --- | --- | --- |
| `lists-files-or-repos` | Names repos/files | `meridian-saas (core app)`, `meridian-saas (reporting app)`, `main.tsx`, `cross-repo-parity` |
| `playwright-parity` | E2E / proof | `playwright`, `parity`, `e2e`, `screenshot`, `proof` |
| `ci-jobs` | Required CI | `parity-proof`, `help-proof`, `assistant-unit`, `smoke`, `vitest`, `github actions` |
| `feature-map-path` | Concrete UI path | `feature map`, `ai assistant`, `bell`, `help`, `#revenue`, `right rail`, … |
| `out-of-scope` | Bounded work | `out-of-scope`, `must not`, `do not`, `bounded` |
| `human-write-gate` | Human approval stated | `await approval`, `write-gate`, `write gate`, `human` |
| `atomic-pr` | One ticket scope | `atomic`, `one ticket`, `this ticket`, `only` |
| `no-big-bang` | **Must NOT** propose | `merge all reporting`, `big-bang merge`, `shared bff`, `extract entire shell` |
| `specialists-invoked-or-noted` | Specialist review | `security`, `quality`, `subagent`, `specialist`, `reviewer` |

---

## Issue-specific plan checks

### KAN-5 (AI Assistant BFF parity)

| Check id | Must mention |
| --- | --- |
| `mentions-ai-assistant` | `ai assistant`, `assistant`, `right rail`, `grok`, `chat` |
| `mentions-core-and-reporting` | core + reporting repo names or words |

**Verbatim prompt + implement scope (do not duplicate here):** [07 · SDK — Verbatim parent prompts — KAN-5](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) and `src/prompts/liq-24.ts`. Harness anchors: `harness.ts` plan block ~KAN-5 ids above; implement hero needle `implement-ai-assistant` when `issue.identifier` is KAN-5.

**KAN-5 failure modes (typical):**

| Symptom | Likely failed check | Operator move |
| --- | --- | --- |
| Plan fixes Core only | `mentions-core-and-reporting` | Re-trigger plan; cite feature map Assistant row |
| Plan proposes monorepo merge | `no-big-bang` | Reject; point to bounded BFF parity story |
| Plan omits “await approval” | `human-write-gate` | Re-run plan or edit summary; cite `HUMAN_WRITE_GATE` in 07 |
| Plan silent on CI | `ci-jobs` / `ci-named` | Require explicit `assistant-unit`, `help-proof`, `parity-proof`, `smoke` |

### KAN-18 (Notifications)

| Check id | Must mention |
| --- | --- |
| `mentions-notifications` | `notification`, `bell`, `inbox` |
| `mentions-core-and-reporting` | both apps |

### KAN-17 (Help centre)

| Check id | Must mention |
| --- | --- |
| `mentions-help-centre` | `help centre`, `help menu`, `help` |
| `mentions-core-and-reporting` | both apps |

### KAN-16 (broken `#invoice-performance`)

| Check id | Must mention |
| --- | --- |
| `mentions-invoice-performance` | `#invoice-performance` |
| `mentions-revenue-fix` | `#revenue-summary` |

### Default / KAN-6 (deep-link)

| Check id | Must mention |
| --- | --- |
| `mentions-revenue-summary` | `#revenue-summary` |
| `mentions-legacy-sales` | `#sales-summary` |

---

## Implement-run checks

When `record.kind === "implement"`:

| Check id | Rule |
| --- | --- |
| Hero-specific | KAN-5 → assistant/chat; KAN-18 → notifications; KAN-17 → help; else → `#revenue-summary` |
| `no-merge-claim` | **Fail** if text claims `merged to main`, `deployed to production`, `pushed prod` |
| `visual-proof` | Must mention `pr-proof`, `e2e/proof`, `screenshot`, `playwright` |
| `ci-named` | Must name `assistant-unit`, `parity-proof`, `help-proof`, `smoke`, `build`, `ci`, `vitest` |

If underlying SDK run `status === "failed"`, check `run-not-failed` fails.

**Pushback — “Implement eval failed but PR looks fine.”** Treat as agent summary gap or overclaim (`no-merge-claim`). Re-open thread or re-run implement; merging remains a human decision after CI.

---

## Operator tips

- **Most common failure:** `human-write-gate` — plan forgot explicit “await approval” language.
- **Re-score:** `POST /evals/rerun` with `{ "runId" }` or `npm run eval` locally.
- **Show failure on purpose:** A red row on `/evals` proves gates work — valid demo beat ([14 · Interview evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).
- **Stale eval after prompt edit:** Rerun eval on stored run id; harness code changes do not retro-edit old JSON.

---

## Model routing (linked topic)

Eval does **not** choose models. Per-role routing is documented in [07 · SDK & cloud agents](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) and decision 0004:

| Role | Router `optimize_for` | Rationale |
| --- | --- | --- |
| Planner | **intelligence** | Cross-repo classification |
| Security reviewer | **intelligence** | Auth/CORS/deep-link abuse |
| Quality reviewer | **cost** | Parity/diff hygiene scans |
| Implementer | **balanced** | Mechanical edits + PR throughput |

Resolution order: `CURSOR_MODEL_<ROLE>` env → Cursor Router `auto-smart` + param → fallback `CURSOR_MODEL` (default `composer-2.5`). Inspect: `GET /models`, `npm run models`.

---

## Insights questions

- “Why did KAN-5 eval fail?” → `/evals/latest?issue=KAN-5` failed check ids; cross-check table above.
- “What checks does the eval harness run?” → This doc + `harness.ts`; hero prompts in 07.
- “Is eval an MCP?” → **No** — deterministic code in `harness.ts`.
- “How are evals tracking?” → pass rate + failed check ids from `/evals` and workflow API.
- “Does Bugbot replace eval?” → **No** — see matrix above and [09](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67).
