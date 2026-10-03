> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: 45-minute session arc

**Format:** Opening slides → live demo (~20–22 min) → closing slides → Q&A.

**Linear:** [19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624) · **Related:** [27 · Official brief](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59) · [16 · Insights](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e) · [12 · Talking points](https://linear.app/liquid-accounting/document/12-interview-prep-talking-points-and-one-liners-144703f45120)

---

## Sound bites

- **“Slides ~1 minute each — then show the working loop on KAN-5.”**
- **“In Progress → plan/eval → approve → In Review → PR — humans merge.”**
- **“Open `sdk-planner.ts` when they ask where SDK starts.”**
- **“KAN-18 signal is optional footnote — not the hero path.”**
- **“Breakage with gate explanation beats silent bluffing.”**
- **“Insights optional in Q&A — handbook 10–21 on Linear.”**

---

## Timing table (target)

| Block | Minutes | Content |
| --- | --- | --- |
| Opening | 8–10 | Problem, two repos, SDK vs skill, operating model (slides 1–7) |
| Live | 20–22 | KAN-5 assistant → Linear In Progress → plan/eval → approve → In Review → PRs |
| Closing | 8–10 | Combine repos second act, outcomes (slides 8–9) |
| Q&A | remainder | Insights optional; deep dives on handbook 10–21 |

Adjust if interviewer wants **repo walk first** — shorten slides, keep SDK file pointers ([27](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59)).

---

## Opening block (8–10 min)

### Slide themes (accounting-presentation)

1. **Problem** — split Core / Reporting modernization (Example A).
2. **Customer vs engineering** — one brand, two deployables ([21 · Two-repo](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)).
3. **Why SDK** — not skill-only ([10 · SDK vs skills](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).
4. **Why Grok** — in-app assistant + Insights ([15](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed)).
5. **Operating model** — Linear states, eval, human merge ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9), [14](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).
6. **Hero KAN-5** — assistant parity.
7. **Jump to live** — deck `#7` → prod URLs.

### Deck URLs

- [accounting-presentation.vercel.app](https://accounting-presentation.vercel.app)
- Jump `#7` before live, `#8` after

---

## Live demo block (20–22 min)

### Beat 1 — Product defect (3–4 min)

- Open **Reporting** prod — broken AI Assistant (KAN-5).
- Open **Core** — working assistant (parity contrast).
- Optional 10 sec: mention **KAN-18** notifications signal path — **`demoSignal.ts`** — **not** SDK ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).

### Beat 2 — Linear Todo → In Progress (2 min)

- Show hero **KAN-5** in Todo.
- Move **In Progress** — webhook → **`linear-webhook.ts`** → **`startPlanRun`**.

### Beat 3 — Plan + eval (5–6 min)

- Open workflow **`/evals/latest?issue=KAN-5`** or dashboard.
- If time: GitHub repo tab **`sdk-planner.ts`** `Agent.create` ~plan.
- Narrate specialists (**`agents.ts`**) + routing (**`models.ts`**).

### Beat 4 — Approve (2 min)

- Slack or **`POST /approve`** — **`REQUIRE_FORMAL_APPROVAL`** story.
- **`guardrails.ts`** human-write-gate phrase in plan text.

### Beat 5 — In Review → implement → PR (5–6 min)

- Linear **In Review**.
- Show implement run + **open PR(s)** — not merged.
- CI job names: `assistant-unit`, `build`, etc. ([09](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).

### Beat 6 — Human merge + Done (2–3 min)

- **Narrate** merge or show **already merged** PR with green checks.
- **Done** via GitHub webhook — **`github-webhook.ts`**.

**Do not** live-merge unless room explicitly wants it — narrate is fine ([17](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec)).

---

## Live demo state path (diagram)

```text
Todo → In Progress (plan + eval)
     → Approve (Slack or /approve)
     → In Review (implement + PRs)
Human merge (narrated or show existing merged PR)
     → Done (webhook)
```

Parallel **non-hero** path:

```text
Reporting chrome break → POST /signal → Todo (+ Slack)
(no Agent.create)
```

---

## Closing block (8–10 min)

### Slide themes

8. **Second act** — combine repos / shared package ([21](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00), [23 · Retro](https://linear.app/liquid-accounting/document/23-interview-prep-retro-if-we-built-this-again-a1a0df7a4b7b)).
9. **Outcomes** — governed agent loop at scale; Insights for democratized Q&A ([26](https://linear.app/liquid-accounting/document/26-interview-prep-democratizing-liquid-insights-access-guardrails-9f0e114ebe1c)).

Deck `#8` after live.

---

## Q&A block (remainder)

### Prefer repo/file answers

| Topic | Pointer |
| --- | --- |
| SDK start | `liquid-workflow/src/sdk-planner.ts` |
| Eval not MCP | `eval/harness.ts` |
| Signal | `reporting/src/demoSignal.ts`, workflow `/signal` |
| Grok | `analytics/server/grok/client.ts` |
| Tokens | `access.ts`, `auth.ts` |

### Insights optional

[localhost:5173](http://localhost:5173) — “What was KAN-5?” / “Is eval MCP?” ([16](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e))

### Handbook index

Ask questions mapped to **10–21** on Linear — verify RAG sync.

---

## Pre-room minimum

- Prod **Core + Reporting** loaded; assistant demonstrable on at least one app.
- Hero ticket **KAN-5** in **Todo** (or reset plan).
- **`GET /status`** on workflow — know `DRY_RUN`, `EVAL_GATE`, `REQUIRE_FORMAL_APPROVAL`.
- Tabs: Linear, workflow `/evals`, GitHub PR list, optional Insights.
- Backup: merged PR screenshot, failed eval screenshot, slide deck offline PDF.

---

## If demo breaks (valid outcomes)

| Break | Story |
| --- | --- |
| Plan fails eval | Gates work — walk `/evals` checks ([14](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)) |
| `DRY_RUN` / no key | Control plane config — show code path anyway |
| Webhook delay | Manual `POST /trigger` with token |
| Assistant both broken | Intentional defect — SDK still plans parity |
| CI red | Human won't merge — correct behavior |

**Say:** “Breakage with explanation is in the official brief.” ([27](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59))

---

## Tradeoffs in time allocation

| More time on | Less time on |
| --- | --- |
| SDK file walk | Insights |
| Live Linear transitions | Closing slides |
| Eval failure teach | Second act slides |

Ask room: “Deep dive SDK or product surfaces?”

---

## If they push back

### “Skip slides — demo only”

**Response:** OK — hit problem statement in 60 sec, then KAN-5 loop.

### “Show merge live”

**Response:** Can show historical merge + Done; live merge optional risk on Wi-Fi.

### “Run KAN-18 signal instead of KAN-5”

**Response:** Signal is triage footnote — hero is assistant parity + full gate stack.

### “45 min isn't enough”

**Response:** Prioritize trigger → output + boundaries; defer Insights to follow-up.

---

## Role of each repo in arc

| Repo | When mentioned |
| --- | --- |
| liquid-workflow | Middle — SDK + eval |
| Core / Reporting | Start — defect |
| meridian-analytics | Q&A — Insights |
| GitHub | PR + merge narrative |

[22 · Codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1)

---

## Sample bot questions

1. **How long is the live demo?** ~20–22 minutes within 45 total.
2. **Hero ticket?** KAN-5 assistant parity; KAN-18 optional signal contrast.
3. **When to use Insights?** Closing Q&A optional — not core live path.
4. **Must you merge on stage?** No — narrate or show prior merge.
5. **First file for SDK?** **`liquid-workflow/src/sdk-planner.ts`**.

*Last updated: 2026-09-26.*
