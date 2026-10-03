> 📌 **Manual sync:** Edit this file and [Linear 09](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67) in the same change ([documentation-sync.md](./documentation-sync.md)). Insights RAG reads Linear.

# PR review stack: CI, Bugbot, Security Agent

**Purpose:** How human merge decisions use **automated** evidence beyond the workflow eval — for Insights and onboarding.

**Human rule:** Agents open PRs; **humans merge** after this stack ([Workflow 0001](https://linear.app/liquid-accounting/document/decision-workflow-0001-agents-open-prs-humans-approve-merge-and-deploy-9e0dc91029a3), Core/Reporting [0005](https://linear.app/liquid-accounting/document/decision-core-0005-main-is-protected-agents-open-prs-humans-merge-01dd6a170109)).

**Related:** [08 · Deterministic eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) (plan/implement text gates) · [07 · SDK](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [14 · Interview evals & merge](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)

---

## Where eval ends and this stack begins

Workflow **eval** runs on the **cloud agent summary** before and after implement. It does **not** execute tests, clone PR branches for Bugbot, or enforce branch protection.

| Phase | Evidence type | Question it answers |
| --- | --- | --- |
| Pre-PR (workflow) | Plan eval + approve + optional `CI_GATE` | “May the SDK start implement?” |
| Post-PR (GitHub) | CI checks, Bugbot, Security Agent, previews | “May a human merge this diff?” |

An agent can pass plan eval, open a PR, and still fail **`assistant-unit`** on GitHub — merge stays blocked. Conversely, green CI does **not** excuse a failed plan eval for the *next* implement attempt on the same ticket.

---

## Layered evidence model

| Layer | What it validates | Who runs it | Substitutes for eval? |
| --- | --- | --- | --- |
| **Deterministic eval** | Plan/implement *text* structure, scope, gates | `liquid-workflow` | — (baseline) |
| **Specialist subagents** | Security + quality PASS/FAIL on diff (SDK) | Cursor cloud agent | No — advisory; eval only checks plan *mentions* them |
| **GitHub Actions CI** | Build, unit, E2E, artifacts | GitHub on PR | No |
| **Bugbot** | AI review comments on PR diff | Cursor/GitHub integration | No |
| **Cursor Security Agent** | Security-focused PR analysis | GitHub (org/repo setting) | No |
| **Vercel preview** | Runtime smoke in deployed preview | Vercel | No |
| **Human review** | Product intent, merge button | Engineer | Yes — final authority |

Workflow **implement** may also require **`main` CI green** before starting (`CI_GATE`) — separate from PR checks on the feature branch.

---

## Bugbot vs eval vs specialists (matrix)

Use this when Insights or interviewers conflate layers.

| | **Eval** | **Specialists (SDK)** | **Bugbot** | **CI jobs** |
| --- | --- | --- | --- | --- |
| **When** | After plan/implement cloud run | During cloud run (parent spawns) | After PR opened | On each PR push |
| **Sees plan rubric?** | Is the rubric | Parent prompt only | No | No |
| **Sees git diff?** | No (text summary only) | Yes (read-only) | Yes | Yes (checkout) |
| **Blocks implement?** | Yes (plan eval + gates) | No — parent judgment | No | Only via `CI_GATE` on workflow |
| **Blocks merge?** | No | No | No | **Yes** (required contexts) |
| **Typical false comfort** | “Eval passed = ship it” | “Security PASS = no review” | “Bugbot clean = merge” | “One job green = all green” |

**Specialist vs Security Agent:** Specialists run **pre-PR** inside the SDK sandbox with Liquid prompts in `src/agents.ts`. **Cursor Security Agent** runs on the **open PR** in GitHub — complementary, not duplicate.

**Specialist vs Bugbot:** Specialists are scoped PASS/FAIL for the parent agent; Bugbot is general review commentary. Neither replaces deterministic eval or Vitest/Playwright.

---

## Required CI jobs (branch protection)

GitHub **required status checks** must match these **job ids** exactly (workflow name `CI` in each repo).

### meridian-saas (core app) (`main`)

| Job | Needs | What it covers |
| --- | --- | --- |
| `build` | — | Production build |
| `assistant-unit` | `build` | Vitest + RTL on `AiAssistant` (welcome, send, accordion, related questions) |
| `smoke` | `build` | Playwright smoke on Core preview |
| `parity-proof` | `build` | Cross-repo parity with Reporting checkout; uploads **help-parity-proof** artifact from `core/e2e/proof/` |

### meridian-saas (reporting app) (`main`)

| Job | Needs | What it covers |
| --- | --- | --- |
| `build` | — | Production build |
| `assistant-unit` | `build` | Same AI Assistant unit coverage as Core |
| `help-proof` | `build` | Help/assistant shell proof (`test:e2e:proof`); artifact **help-proof** (legacy naming; includes KAN-5 assistant proofs) |

Branch protection: required checks above per repo, linear history, **enforce admins**, no force-push.

**KAN-5 PR pair expectation:** At least one PR may touch Core (parity + unit + smoke path) and Reporting (assistant BFF + `help-proof`). Plans should name **all four Core contexts** and **Reporting’s three** — eval checks wording; GitHub enforces green checks independently per repo.

**KAN-5 checks reference (prompts, not duplicated here):** Verbatim plan/implement templates and feature-map Assistant row live in [07 · SDK — KAN-5](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888). Eval needle list: [08 · KAN-5 table](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a).

---

## Bugbot

**What it is:** Cursor **Bugbot** — automated PR reviewer that comments on diffs (style, logic, possible bugs). Enabled on Liquid GitHub repos as part of the Cursor/GitHub integration.

**How we use it:**

- Expected in SpaceX demo **Beat 9** — expand one finding or “clean” summary.
- **Independent** of workflow eval: Bugbot did not see the plan rubric; eval did not run Bugbot.
- Agents must **not** treat Bugbot approval as permission to merge or deploy.

**Failure modes / pushback:**

| Claim | Response |
| --- | --- |
| “Bugbot said LGTM” | Bugbot is advisory; humans merge after required CI + product review |
| “No Bugbot comments” | Not required for merge; absence ≠ security proof |
| “Bugbot found a bug — skip CI” | CI still required; fix or dismiss with human judgment |

**Insights questions:** “Did Bugbot comment on Reporting #14?” → retrieve GitHub PR checks/comments via GitHub connector.

---

## Cursor Security Agent

**What it is:** GitHub PR security analysis provided through Cursor’s security agent integration (org/repo configuration). Complements specialist `security-reviewer` (SDK, read-only, pre-PR) with **post-diff** analysis on the open PR.

**Typical focus (aligned with specialist prompt themes):**

- Secrets in client bundles
- Auth/token handling in BFF routes
- CORS / origin allowlists
- Open redirects and untrusted navigation targets
- Logging/analytics leaking PII

**Not a merge bot:** humans still merge; Security Agent findings are inputs.

**Pushback — “Security Agent + specialist = duplicate.”** Different phase: specialists gate the **agent’s intent before PR**; Security Agent scans **what actually landed on the branch**.

*(Exact enablement lives in GitHub/Cursor settings — not duplicated here.)*

---

## Visual proof expectations

From workflow `VISUAL_PROOF_GATE` and PR templates:

1. **`docs/pr-proof/*.png`** — before/after for feature-map path; on PRs, CI also copies Playwright output here and **embeds images in a PR comment** (no artifact zip required).
2. **`e2e/proof/`** — Playwright output; CI still uploads artifacts as backup.
3. PR description **Screenshots** table (`.github/pull_request_template.md`).
4. **Vercel preview URL** on PR.

**Linear:** On PRs, CI uploads proof PNGs and posts a **Visual proof (CI)** comment on each referenced `LIQ-*` issue (requires repo secret `LINEAR_API_KEY`). GitHub PR comments remain the fallback when the secret is unset.

Hero examples: KAN-5 assistant answers, KAN-6 revenue hash, KAN-18 bell, KAN-17 Help.

**Failure mode:** Green CI but missing inline PNGs — merge may be allowed by GitHub while demo narrative fails; human review should enforce visual proof table.

---

## Merge → Linear Done

When a PR to `main` **merges** and title/body/branch mentions `LIQ-N`:

1. GitHub webhook → `liquid-workflow` `POST /webhooks/github`
2. Curated issue → Linear **Done**
3. Slack + Linear comment brief

**Gotcha:** Mentioning extra `LIQ-*` ids in PR text moves those tickets to Done too.

**Pushback — “Agent said merged in Slack.”** Only GitHub merge events drive Done; eval `no-merge-claim` catches premature agent language in implement summaries.

---

## Stack failure modes (operator playbook)

| Situation | What broke | First look |
| --- | --- | --- |
| Implement never starts | Workflow gate | `/evals/latest`, approve token, `CI_GATE`, `WORKFLOW_ENABLED` |
| PR open but merge greyed out | GitHub required check | Checks tab — which job id failed |
| Eval green, CI red | Real regression | Logs for failing job (`assistant-unit` vs `parity-proof`) |
| CI green, eval red (implement) | Summary wording | `no-merge-claim` or missing `visual-proof` needles |
| Bugbot noisy on style | Advisory | Human triage; not a workflow failure |
| Specialist FAIL in thread | Agent stopped or ignored | Parent should not open PR; human inspects cloud run |

---

## Comparison table (for RAG / Insights)

| Question | Answer location |
| --- | --- |
| Did eval pass? | `/evals/latest?issue=LIQ-N`, Slack eval checklist |
| Did CI pass? | GitHub Checks tab, required contexts above |
| Bugbot findings? | GitHub PR review comments |
| Security Agent? | GitHub PR / security tab per Cursor integration |
| Who can merge? | Humans with repo access; agents never |
| What blocks implement in workflow? | Write-gate, eval gate, optional CI gate |
| KAN-5 prompt verbatim? | [07 · SDK KAN-5 section](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) |
| KAN-5 eval needles? | [08 · KAN-5](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) |

---

## Related handbook

- [02 · Agent workflow end to end](https://linear.app/liquid-accounting/document/02-the-agent-workflow-end-to-end-09ac594383a7)
- [07 · Cursor SDK & cloud agents](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)
- [08 · Deterministic eval rubric](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)
- [03 · Security overview](https://linear.app/liquid-accounting/document/03-security-overview-f4c8c69d13cf)
