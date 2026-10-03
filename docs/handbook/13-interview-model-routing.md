> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Model routing Q&A

**Code:** `liquid-workflow/src/models.ts` · **Decision:** [Workflow 0004](https://linear.app/liquid-accounting/document/decision-workflow-0004-per-role-model-routing-and-read-only-specialist-36a193a4324c) · **Linear:** [13 · Model routing](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c)

**Related:** [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [22 · Codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1) · [18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)

---

## Sound bites

- **“Routing lives in `models.ts` — the parent agent doesn’t pick ‘use opus for everything’.”**
- **“Planner gets intelligence; quality reviewer gets cost; implementer gets balanced throughput.”**
- **“Override any role with `CURSOR_MODEL_<ROLE>` — then hit `GET /models` to prove it.”**
- **“Eval does not choose models — harness.ts scores text only.”**
- **“In-app Grok (`XAI_MODEL` on analytics BFF) is a separate universe from SDK routing.”**
- **“Specialists are read-only — cheaper models on quality still block bad seams.”**

---

## Why per-role routing exists

Enterprise agent loops burn tokens on **classification** (planner), **adversarial read** (security), **high-volume diff scan** (quality), and **mechanical edits** (implementer). A single “best model everywhere” policy wastes money on read-only passes and underpowers cross-repo planning on KAN-5-style heroes.

Liquid encodes policy in **`liquid-workflow/src/models.ts`** and injects roster text into prompts via `${rosterBlock}` in **`sdk-planner.ts`** ([07 · SDK](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

---

## Policy table (memorize)

| Role | SDK label | Router `optimize_for` | Env override | Why |
| --- | --- | --- | --- | --- |
| Planner | Planner (orchestrator) | **intelligence** | `CURSOR_MODEL_PLANNER` | Cross-repo classification, bounded plans for KAN-5 |
| Security reviewer | Security reviewer | **intelligence** | `CURSOR_MODEL_SECURITY` | Auth, CORS, deep-link abuse, token paths |
| Quality reviewer | Code quality reviewer | **cost** | `CURSOR_MODEL_QUALITY` | Parity scans, diff hygiene, CI name mentions |
| Implementer | Implementer | **balanced** | `CURSOR_MODEL_IMPLEMENTER` | Throughput vs quality for mechanical edits |

---

## Resolution order (how a model is picked)

### Step 1 — Fixed id override

If `CURSOR_MODEL_PLANNER` (etc.) is set in workflow host env, that id wins for that role. **Demo extension:** change `CURSOR_MODEL_QUALITY` live, restart or reload if needed, show **`GET http://127.0.0.1:4100/models`**.

### Step 2 — Cursor Router

When no fixed override, **`auto-smart`** (or configured router param) + `optimize_for` from `ROLE_POLICY` in **`models.ts`**.

### Step 3 — Global fallback

`CURSOR_MODEL` defaulting to **`composer-2.5`** family when router unavailable.

### Inspect live

- **HTTP:** `GET /models` on workflow host (public read on dashboard routes — verify `access.ts` for prod).
- **CLI:** `npm run models` in **liquid-workflow** repo.

---

## Where routing is wired into runs

### Plan run (`startPlanRun`)

**`sdk-planner.ts`** builds `Agent.create` with planner model from **`resolveModelForRole("planner")`** (names per actual export in repo). Subagents in **`agents.ts`** get their own resolved models for security/quality.

### Implement run (`startImplementRun`)

Implementer role uses **balanced**; specialists may re-run on PR diff depending on prompt design — still **read-only** for subagents.

### What the model never does

- Self-assign role or swap roster at runtime.
- Bypass **`EVAL_GATE`** or **`REQUIRE_FORMAL_APPROVAL`**.
- Change **`guardrails.ts`** text — that is prompt/static injection.

---

## What routing is *not*

### Eval harness

**`liquid-workflow/src/eval/harness.ts`** keyword-matches plan/implement artifacts. It does **not** call Cursor Router ([08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a), [Workflow 0003](https://linear.app/liquid-accounting/document/decision-workflow-0003-plans-are-scored-by-a-deterministic-rubric-not-2984bc0eccfd)).

### Parent agent improvisation

Prompts include roster block; implement parent cannot “promote” quality to implementer.

### Grok in product surfaces

| Surface | Config | Path |
| --- | --- | --- |
| Meridian Insights | `XAI_API_KEY`, `XAI_MODEL` | `meridian-analytics/server/grok/client.ts` |
| In-app assistant (KAN-5) | App BFF env on Core/Reporting | `server/server.mjs` assistant route when on branch |

Changing Insights model does **not** change planner intelligence on workflow host.

---

## KAN-5 routing story (talk track)

1. **Planner (intelligence)** reads **`prompts/liq-24.ts`** + feature map — decides Core vs Reporting touch list.
2. **Security (intelligence)** checks assistant BFF auth, CORS, no secrets in client bundle.
3. **Quality (cost)** scans for parity tests, `assistant-unit`, help-proof references.
4. **Implementer (balanced)** opens PR(s) with mechanical parity fixes.

**Say:** “We spend intelligence dollars where misclassification hurts; we spend cost dollars on read-only grep-like review.”

---

## KAN-18 contrast (no routing change on signal)

**`/signal`** for KAN-18 does **not** invoke **`sdk-planner.ts`** — no role resolution occurs. Routing discussion applies once operator moves **In Progress** on a planning ticket.

---

## Tradeoffs

### Intelligence on planner vs implementer

**Pros:** Fewer wrong-repo PRs on two-repo heroes. **Cons:** Slower/costlier plan phase — acceptable for demo classification beat.

### Cost on quality reviewer

**Pros:** Cheaper specialist loop; FAIL still blocks narrative confidence. **Cons:** Might miss subtle issues — mitigated by CI + human review ([09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).

### Env overrides vs code policy

**Pros:** Ops can react in interview room without redeploying TypeScript. **Cons:** Drift from documented defaults — show **`GET /models`** as SoT during demo.

---

## Failure modes

| Failure | Symptom | Mitigation |
| --- | --- | --- |
| Router outage | All roles fall back to `CURSOR_MODEL` | Narrate fallback; plan may still pass eval |
| Wrong override | Quality uses huge model | Wastes money — not a safety failure if read-only |
| Stale `/models` cache | UI shows old roster | Hard refresh; restart workflow if in-process cache |
| Confusion with Grok | “Why is Insights slow?” | Separate service — point to **`grok/client.ts`** |

---

## If they push back

### “Use the best model for every agent”

**Response:** Read-only specialists don’t need frontier reasoning on every line of diff; policy in [Workflow 0004](https://linear.app/liquid-accounting/document/decision-workflow-0004-per-role-model-routing-and-read-only-specialist-36a193a4324c) documents cost discipline without weakening security role.

### “Let the planner choose models dynamically”

**Response:** That removes auditability and ops override — Liquid keeps routing in **`models.ts`** so **`GET /models`** matches env and code.

### “Model routing is the eval”

**Response:** Eval checks **content** (repos, gates, forbidden merge language). Routing checks **who runs** — orthogonal layers ([14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).

### “Change routing = change safety”

**Response:** Safety comes from read-only specialist defs in **`agents.ts`**, tokens in **`access.ts`**, and merge policy — not from model brand.

---

## Demo beat (30–60 sec)

1. Open workflow **`/models`** alongside Linear **KAN-5** In Progress plan brief.
2. **Say:** “Planner gets intelligence for classification; quality is cost-effective; implementer balanced for PR throughput.”
3. Optional: set **`CURSOR_MODEL_QUALITY`** to another id — reload **`/models`** ([18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)).

---

## Files to open if asked “show me”

| Question | File |
| --- | --- |
| Role policy table | `liquid-workflow/src/models.ts` |
| Where roster hits prompt | `liquid-workflow/src/sdk-planner.ts` |
| Specialist definitions | `liquid-workflow/src/agents.ts` |
| Public roster endpoint | `liquid-workflow/src/server.ts` (route for `/models`) |

---

## Relation to other handbook docs

- Boundaries: [11 · SDK starts/stops](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)
- Eval gates: [14 · Evals & merge](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)
- Grok split: [15 · Grok vs SDK](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed)

---

## Sample bot questions

1. **Why Cost for quality reviewer?** High-volume read-only diff scan; blocking FAIL findings still stop implement confidence.
2. **Can interviewers change routing live?** Yes — env override or extend `ROLE_POLICY`; re-run `GET /models` to show change.
3. **What if Router unavailable?** Fixed model fallback; demo defaults to Composer family.
4. **Do specialists implement fixes?** No — PASS/FAIL read-only; implement parent opens PRs.
5. **Does eval pick the planner model?** No — **`harness.ts`** only scores run text; routing is **`models.ts`**.

*Last updated: 2026-09-26.*
