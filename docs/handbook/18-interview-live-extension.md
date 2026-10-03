> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Live extension playbook

Assignment: **extend part of the prototype based on interviewer prompt.** Pre-load safe, bounded extensions.

**Linear:** [18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c) · **Related:** [14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) · [13 · Model routing](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c) · [17 · Constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec)

---

## Sound bites

- **“I'll extend X but keep human merge, eval, and PR-only.”**
- **“Tier A: harness needle or `/models` env — no tunnel surgery.”**
- **“Show file diff + `/evals` or `npm run eval` — policy-as-code.”**
- **“Never live-merge or disable approve without naming it.”**
- **“Insights pill change proves same BFF — not a second Grok hack.”**

---

## Assignment framing

Interviewers may ask for a **small product or policy change** mid-session. Liquid’s strategy: pre-identify edits that ** reinforce** the governance story (eval, routing, docs RAG) rather than risky infra.

**Restate gates aloud** before typing ([11 · Boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).

---

## Tier A — Low risk (5–10 min)

| Extension | Where | Story | Verify |
| --- | --- | --- | --- |
| Add eval check needle | `liquid-workflow/src/eval/harness.ts` | “Tighten rubric without new AI” | `/evals` or `npm run eval` |
| Show `/models` roster change | Env `CURSOR_MODEL_QUALITY` | “Ops override per role” | `GET /models` |
| Add Insights sample question pill | `meridian-analytics` UI `src/` | “Same BFF pipeline” | Ask pill question live |
| Re-score saved plan | workflow CLI | “Re-score artifact” | `runs/eval_*.json` |
| Document forbidden phrase | `harness.ts` `requireMention(..., required: false)` | Block toxic plan language | Unit test if present |

### Tier A script

1. **Restate constraint** — no merge, no SDK in Core BFF.
2. **Open file** — harness or models.
3. **Run verification** — eval CLI or HTTP.
4. **Enterprise tie-in** — “Same as policy-as-code on agent outputs.”

---

## Tier B — Medium (10–15 min)

| Extension | Where | Story | Caution |
| --- | --- | --- | --- |
| New eval check for KAN-5 | `harness.ts` + maybe `prompts/liq-24.ts` | Hero-specific governance | Keep both-repo needles |
| Specialist prompt tweak | `liquid-workflow/src/agents.ts` | Read-only security scope | Don't grant write tools |
| Access route comment/clarity | `access.ts` | Token literacy | Don't open `/implement` publicly |
| Handbook Q in doc 20 | `20-interview-qa-catalog.md` + Linear | Insights RAG freshness | Manual sync same session |
| Guardrails phrase | `guardrails.ts` | Stronger write-gate | Re-run plan eval |

**Keep:** PR-only, no merge, run tests if touching harness (`npm test` / CI locally if time).

---

## Tier C — Avoid live unless asked

| Action | Why risky |
| --- | --- |
| Changing Linear webhook secrets / tunnel | Demo downtime |
| Live implement run without eval pass | Violates story ([14](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)) |
| Cross-repo CI token fixes (Reporting private checkout) | Long-running, flaky |
| Merging any open `hello/*` PR | Irreversible on stage |
| `IMPLEMENT_BYPASS_EVAL_ON_LINEAR=true` without disclaimer | Looks like cheating gates |
| Embedding `CURSOR_API_KEY` in analytics | Security anti-pattern |
| Monorepo merge “because interviewer asked” | Violates [17](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec) |

---

## Extension templates by interviewer prompt

### “Make eval stricter”

**Files:** `eval/harness.ts`

**Example:** Add needle requiring `assistant-unit` string on KAN-5 plan runs.

**Verify:** `npm run eval` on last plan artifact; show fail/pass on `/evals`.

**Pushback ready:** Eval is floor — still need human approve.

### “Change model routing”

**Files:** `models.ts` or env only

**Example:** Set `CURSOR_MODEL_PLANNER` to fixed id; show `/models`.

**Verify:** [13 · Routing](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c).

### “Add Insights capability”

**Files:** `server/app.ts`, UI sample pills, maybe `chatTurn.ts` intent

**Example:** New sample question “Explain KAN-18 signal vs plan.”

**Verify:** Citations to handbook 11 + `demoSignal.ts`.

**Do not:** Add `Agent.create` to analytics.

### “Improve guardrails”

**Files:** `guardrails.ts`, sync into `prompts/liq-24.ts` if needed

**Verify:** Re-trigger plan or narrate next plan would include phrase.

---

## KAN-5-safe extensions

Acceptable:

- Eval needle for `POST /api/v1/assistant/chat` mention both apps.
- Quality specialist scope line in **`agents.ts`** for BFF bearer checks.
- Insights pill: “What CI jobs guard KAN-5?”

Unacceptable as hero outcome:

- “Merge Reporting into Core” implement prompt change without eval forbid sync.
- Single-repo-only eval relaxation.

---

## KAN-18-safe extensions

Acceptable:

- Document signal payload in handbook 20.
- Eval needle on **plan** for KAN-18 (not on `/signal` HTTP handler).

Unacceptable:

- Make `/signal` call `startPlanRun` without explicit “demo hack” disclaimer.

---

## Script if prompted cold

1. **Pause** — “What's the smallest change that proves the pattern?”
2. **Restate gate** — “I'll extend X but keep human merge and eval.”
3. **Show file** + **test or /evals outcome**
4. **Tie to enterprise** — “Same pattern for policy-as-code on agent outputs.”
5. **Offer PR narrative** — “In real life this would be a PR to workflow, not live edit.”

---

## Tradeoffs

### Live edit vs “I would PR this”

**Pros live:** Shows ownership and velocity. **Cons:** Branch chaos — prefer workflow repo only, single file.

### Harness change vs prompt change

**Pros harness:** Visible `/evals` proof. **Cons:** May fail current plan — have backup screenshot.

### Insights UI vs workflow

**Pros Insights:** Non-engineers see value. **Cons:** Less relevant if SDK is focus — ask “policy or product?” before choosing.

---

## Failure modes during extension

| Mistake | Recovery |
| --- | --- |
| Broke harness tests | Revert hunk; show git diff discipline |
| `/models` empty | Check workflow process env reload |
| Insights pill 500 | Fall back to handbook link |
| Accidental merge click | **Don't** — narrate human gate |

---

## If they push back

### “Do something bigger — merge the repos”

**Response:** That's closing slide second act — live extension stays bounded ([21 · Two-repo](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)).

### “Disable eval so we see implement”

**Response:** Only with explicit bypass flag named; prefer showing prior implement PR ([17](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec)).

### “Patch Core live without PR”

**Response:** Assignment story is agent PR + human merge — edit workflow policy instead.

---

## Files cheat sheet

| Repo | Safe extension files |
| --- | --- |
| liquid-workflow | `eval/harness.ts`, `models.ts`, `agents.ts`, `guardrails.ts`, `access.ts` |
| meridian-analytics | UI pills, `server/handbook/` samples, non-auth routing comments |
| Core/Reporting | Avoid unless interviewer demands UI — higher CI surface |

**SDK call site (read-only demo):** `sdk-planner.ts` — don't refactor live.

---

## Post-extension sync

If handbook text changed:

1. Update Linear doc in same session ([documentation-sync.md](./documentation-sync.md)).
2. Optional: ask Insights one verification question.

---

## Sample bot questions

1. **What can you safely change in 5 minutes?** Eval needle or `/models` env ([Tier A](#tier-a--low-risk-510-min)).
2. **Can you merge live to prove the fix?** No — humans merge; show open PR instead.
3. **Where to tighten plan rubric?** **`liquid-workflow/src/eval/harness.ts`**.
4. **Can you add SDK to Insights?** No — wrong trust boundary ([15](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed)).
5. **Extension without eval proof?** Prefer Tier A with `npm run eval` or `/evals`.

*Last updated: 2026-09-26.*
