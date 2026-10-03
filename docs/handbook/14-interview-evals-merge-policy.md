> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Evals, merge policy, and gates

**Eval code:** `liquid-workflow/src/eval/harness.ts` · **Merge policy:** [Workflow 0001](https://linear.app/liquid-accounting/document/decision-workflow-0001-agents-open-prs-humans-approve-merge-and-deploy-9e0dc91029a3) · [Core/Reporting 0005](https://linear.app/liquid-accounting/document/decision-core-0005-main-is-protected-agents-open-prs-humans-merge-01dd6a170109) · **Linear:** [14 · Evals & merge](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)

**Related:** [08 · Eval rubric](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) · [09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67) · [11 · Boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)

---

## Sound bites

- **“Eval is TypeScript in `harness.ts` — not MCP, not an LLM judge.”**
- **“Gates stack: kill switch → plan exists → eval pass → formal approve → implement.”**
- **“Agents open PRs; humans merge `main`; agents never claim merge in implement text.”**
- **“Eval is a floor — humans approve plans; CI + Bugbot are separate layers.”**
- **“Show a failed `/evals` row — gates working is a valid demo outcome.”**
- **“KAN-5 eval needles include both repos, assistant-unit, and human-write-gate language.”**

---

## Gate stack (order matters)

| Gate | Config | Blocks implement? | Blocks merge? |
| --- | --- | --- | --- |
| Service kill switch | `WORKFLOW_ENABLED` in `config.ts` | Yes | N/A |
| Signal-only path | `SIGNAL_ENABLED` for `/signal` | N/A (no SDK) | N/A |
| Plan must exist | Server checks before implement | Yes | N/A |
| **Eval pass** | `EVAL_GATE=true` | Yes | N/A |
| Formal **approve** | `REQUIRE_FORMAL_APPROVAL` | Yes until approve | N/A |
| Optional **CI_GATE** | Env on workflow | Yes | N/A |
| GitHub required checks | Branch protection on PR | No (agent still opens PR) | **Yes** |
| Human merge button | GitHub UI | N/A | **Only humans** |

**Implement entry:** `POST /implement` and Linear **In Review** path in **`linear-webhook.ts`** — both consult gates before **`startImplementRun`** in **`sdk-planner.ts`**.

**Auth:** **`access.ts`** — bearer token on control routes; approve via **`APPROVE_TOKEN`** or API token.

---

## Eval in one paragraph (expand for Q&A)

After each plan/implement run, **`evaluateRun`** in **`liquid-workflow/src/eval/harness.ts`** keyword-matches required phrases: repo names (Core + Reporting), Playwright job names, CI workflows (`build`, `assistant-unit`, `smoke`, `parity-proof`, `help-proof`), write-gate language from **`guardrails.ts`**, and **forbids** big-bang merge / monorepo language on plan runs.

Artifacts: **`runs/eval_*.json`** on workflow host. Dashboard: **`GET /evals`**, **`/evals/latest?issue=KAN-5`**.

**Not** an MCP tool. **Not** an LLM-as-judge ([Workflow 0003](https://linear.app/liquid-accounting/document/decision-workflow-0003-plans-are-scored-by-a-deterministic-rubric-not-2984bc0eccfd)).

---

## Common eval failures (demo literacy)

| Check id (typical) | Meaning | Fix narrative |
| --- | --- | --- |
| `human-write-gate` | Plan missing await-approval wording | Re-run plan or edit artifact; cite **`HUMAN_WRITE_GATE`** |
| `no-merge-claim` | Implement text claims merged to main | Agent overstep — eval catches it |
| `both-repos` | KAN-5 plan ignored Reporting or Core | Re-classify with feature map |
| `forbidden-big-bang` | “Merge Reporting into Core” language | Bounded two-repo story ([21 · Two-repo](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)) |

**Say:** “I'd rather show eval fail than skip eval — that's the enterprise pattern.”

---

## Per-hero eval nuance

Issue-specific needles live in harness + prompt pairing:

| Hero | Prompt file | Eval emphasis |
| --- | --- | --- |
| KAN-5 | `prompts/liq-24.ts` | Assistant BFF parity, both apps |
| KAN-18 | `prompts/liq-17.ts` | Notifications seam, not signal path |
| KAN-17 | `prompts/liq-16.ts` | Help centre |
| KAN-16 | `prompts/liq-15.ts` | Deep link / invoice performance |
| KAN-6 | `prompts/liq-9.ts` | Hash routing sales vs revenue |

Demo focuses **KAN-5**; others show defect taxonomy ([08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)).

---

## Merge policy (humans only)

### Happy path steps

1. Agent opens PR(s) with **`autoCreatePR: true`** on implement run (**`sdk-planner.ts`**).
2. **CI** on PR branch:
   - **Core:** `build`, `assistant-unit`, `smoke`, `parity-proof` (`.github/workflows/ci.yml`)
   - **Reporting:** `build`, `assistant-unit`, `help-proof`
3. **Bugbot + Cursor Security Agent** — **advisory** ([09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).
4. **Human merges** → GitHub webhook → workflow → Linear **Done** for cited `LIQ-*` in PR body (**`github-webhook.ts`**, **`linear-done.ts`**).

### Agents never

- Merge `main`
- Deploy prod on Vercel
- Treat Bot comments as approval
- Close Done without merge evidence on hero tickets

### WRITE-POLICY alignment

[liquid-workflow WRITE-POLICY](https://github.com/gloverthomas/liquid-workflow/blob/main/WRITE-POLICY.md) + Core/Reporting **0005** — branch protection is the enforcement backstop even if an agent misbehaves.

---

## Demo bypass flags (mention carefully)

| Flag | Effect |
| --- | --- |
| `IMPLEMENT_BYPASS_EVAL_ON_LINEAR` | Skips eval gate on Linear implement path |
| `DRY_RUN` | No real SDK — eval may still run on text |

**Production narrative:** bypass **off**; mention only as kill-switch literacy or disaster recovery — not the hero story.

---

## KAN-5 worked example (eval + merge)

### Plan phase

Linear **In Progress** → plan run → eval must mention:

- Both **meridian-saas (core app)** and **meridian-saas (reporting app)**
- Assistant route / parity tests
- Await human approval before implement (**`guardrails.ts`**)

### Approve phase

Slack or **`POST /approve`** with token — satisfies **`REQUIRE_FORMAL_APPROVAL`**.

### Implement phase

**In Review** → implement run → eval forbids **“merged to main”** claims → PR URLs appear.

### Merge phase (human)

Narrate or show **already-merged** PR with green CI. **Done** via webhook — not agent button.

---

## KAN-18 contrast (signal vs eval)

**`/signal`** from **`demoSignal.ts`** does **not** produce plan eval artifacts. If interviewer asks “eval on signal?” — **no**; eval runs on SDK plan/implement outputs only. KAN-18 may still be the **subject** of a later In Progress plan with its own needles.

---

## Tradeoffs

### Deterministic rubric vs LLM judge

**Pros:** Reproducible, cheap, versionable in git, great for `/evals` dashboard. **Cons:** Eloquent wrong plans can pass — human approve is mandatory.

### EVAL_GATE=true in prod demo

**Pros:** Shows governance. **Cons:** Demo fragility if plan wording drifts — keep backup **`/evals` screenshot**.

### CI on PR vs eval on plan

**Pros:** Defense in depth. **Cons:** Two failure surfaces — explain layers clearly.

---

## Failure modes

| Scenario | What broke | Demo move |
| --- | --- | --- |
| Implement 403 | Eval fail or no approve | Open failed checks on `/evals` |
| PR open, CI red | Code issue | Human must not merge — gates OK |
| Eval pass, bad fix | Floor only | Human review + Bugbot |
| Done stuck | Webhook / PR body missing LIQ id | Show merge commit + PR template |
| “Eval is MCP” confusion | Category error | Open **`harness.ts`** — pure TS |

---

## If they push back

### “Eval is good enough — skip human approve”

**Response:** Approve is accountability for **plan intent** before cloud agent writes across two repos. Eval doesn't judge UX acceptance.

### “Merge when CI green automatically”

**Response:** Violates assignment and [Workflow 0001](https://linear.app/liquid-accounting/document/decision-workflow-0001-agents-open-prs-humans-approve-merge-and-deploy-9e0dc91029a3) — humans own merge and deploy.

### “Use an MCP for eval”

**Response:** Would add moving parts and non-determinism; [Workflow 0003](https://linear.app/liquid-accounting/document/decision-workflow-0003-plans-are-scored-by-a-deterministic-rubric-not-2984bc0eccfd) explicitly chose harness.

### “Eval failed — demo ruined”

**Response:** Gates working **is** the story — walk through which check failed and what enterprise would do next ([17 · Constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec)).

---

## CLI and operator tools

- **`npm run eval`** in liquid-workflow — re-score saved plan artifact (Tier A extension, [18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)).
- **`cli-trigger.ts`** — operator glue, not graded SDK replacement ([10 · SDK vs alternatives](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).

---

## Insights questions that land here

| Insights prompt | Handbook source |
| --- | --- |
| “Is eval an MCP?” | 08, 14, Workflow 0003 |
| “What blocks implement?” | 07 gates + 14 stack |
| “Who merges Reporting PR #N?” | GitHub connector — humans |

Prod: [localhost:5173](http://localhost:5173) — optional closing Q&A ([16 · Insights](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)).

---

## Sample bot questions

1. **Is eval an MCP?** No — TypeScript harness in **`eval/harness.ts`**.
2. **Can eval pass with a bad plan?** Yes — floor only; human approval required.
3. **Who merges?** Humans with repo access on GitHub.
4. **What if implement claims “merged to main”?** Eval **`no-merge-claim`** fails on implement runs.
5. **Show failure?** **`/evals`** failed check ids — acceptable demo beat.

*Last updated: 2026-09-26.*
