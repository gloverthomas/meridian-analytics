> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Q&A catalog (quick reference + long-form)

Expanded from SpaceX brief §15 + **official interview email** ([27 · Official brief](./27-interview-official-email-brief.md)). Use with Meridian Insights for cited answers. **Tables** below are flash-card speed; **long-form sections** are for live narration depth.

**Related:** [10 · SDK vs alternatives](./10-interview-sdk-vs-alternatives.md) · [11 · Boundaries](./11-interview-sdk-boundaries.md) · [15 · Grok vs SDK](./15-interview-grok-vs-sdk.md) · [17 · Constraints](./17-interview-hard-constraints.md) · [22 · Codebase map](./22-interview-sdk-codebase-map.md) · [25 · Tooling SoT](./25-interview-tooling-source-of-truth.md) · [26 · Insights access](./26-interview-insights-democratization.md)

---

## Official exercise (email) — table

| Question | Answer |
| --- | --- |
| Skill-only / no SDK or Grok API call? | **Not the exercise** — show `sdk-planner.ts` + Grok `client.ts` |
| Where does SDK start? | `liquid-workflow/src/sdk-planner.ts` → `Agent.create` |
| Where does Grok API start? | `meridian-analytics/server/grok/client.ts` → xAI chat completions |
| Walk trigger → output? | Linear In Progress → webhook → plan → `/evals` → approve → implement → PR ([27](./27-interview-official-email-brief.md)) |
| Does `/signal` satisfy SDK? | **No** — triage only; SDK on In Progress / `/trigger` |
| Demo breaks? | OK if you explain gate/env/CI/intentional defect ([17 · Constraints](./17-interview-hard-constraints.md)) |
| Slides vs demo? | **~1 min slides**, then working demo ([19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624)) |

---

## Theme: Official email (long-form)

### Non-negotiable framing

The email is not “use AI in the IDE.” It requires **programmatic** Cursor SDK and/or **Grok API** calls in code you can open. Interviewers expect:

1. A file with `import { Agent } from "@cursor/sdk"` (or equivalent SDK entry).
2. A file with xAI HTTP to `https://api.x.ai/v1/chat/completions` (Insights path).
3. A narrated chain from **business trigger** (Linear state, HTTP POST) to **observable output** (eval JSON, PR URL, chat reply with citations).

**Sound bite:** “Skills built it; SDK and Grok API operate it.”

### KAN-5 as email satisfaction proof

Use **KAN-5** as the single ticket that satisfies both “product” and “SDK” layers:

| Layer | Trigger | Output | Code |
| --- | --- | --- | --- |
| Grok / fixture | User sends chat in Reporting assistant | Reply or error exposing missing BFF | `liq-24.ts` contract; Core/Reporting `server/server.mjs` |
| SDK | Linear **In Progress** / **In Review** | Plan text, eval pass, open PR(s) | `sdk-planner.ts`, `harness.ts` |

If asked “where does API start?” — answer **both** starts with different files; conflating them fails [17](./17-interview-hard-constraints.md).

### Breakage narrative (email allows it)

Prepare three **named** failure buckets:

- **Gate:** eval fail, missing approve, `CI_GATE` — show `/evals/latest?issue=KAN-5`.
- **Env:** `DRY_RUN`, missing `CURSOR_API_KEY`, Insights `503` without session secrets.
- **Intentional defect:** KAN-18 broken Notifications chrome, KAN-5 Reporting assistant — product demo debt, not workflow bug.

---

## SDK & workflow — table

| Question | Answer |
| --- | --- |
| Why Cursor SDK vs a skill? | Persisted control plane: webhooks, eval, routing, PR-only, cross-repo cloud sandboxes |
| Why not a Python script calling Claude? | Same gap — no Cursor cloud agent lifecycle + SDK PR integration |
| Do agents merge? | **No** — humans after Bugbot + CI |
| Is eval an MCP? | **No** — `harness.ts` keyword rubric |
| What triggers plan? | Linear **In Progress** or `/trigger` |
| What triggers implement? | **In Review** after approve + eval pass |
| Does `/signal` start agents? | **No** — Slack + Linear Todo triage only |

---

## Theme: SDK & workflow (long-form)

### Why the SDK lives in one repo

Only **`liquid-workflow`** imports `@cursor/sdk`. Core and Reporting are **targets** cloud agents edit. That separation is deliberate:

- Secrets (`CURSOR_API_KEY`) stay off customer-facing app hosts.
- Eval and approve tokens are centralized.
- Linear webhooks have one HMAC verification point (`src/server.ts`).

**Paths to memorize:** `src/linear-webhook.ts` (routing), `src/sdk-planner.ts` (SDK), `src/eval/harness.ts` (floor), `src/access.ts` (who may POST `/trigger` vs public `/signal`).

### Env vars (workflow interview list)

| Variable | Purpose |
| --- | --- |
| `CURSOR_API_KEY` | Real `Agent.create` cloud runs |
| `DRY_RUN` | Synthetic plan without cloud spend |
| `WORKFLOW_API_TOKEN` | Bearer for `/trigger`, `/implement` |
| `APPROVE_TOKEN` | Formal approve when enabled |
| `WORKFLOW_ENABLED` | Kill switch for all automation |
| `EVAL_GATE` / `CI_GATE` | Block implement until pass |

Full list: `liquid-workflow/.env.example` · narrative: [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888).

### Plan vs implement (two SDK modes)

| Mode | `Agent.create` | `autoCreatePR` | When |
| --- | --- | --- | --- |
| Plan | `mode: "plan"` | `false` | In Progress, `/trigger` |
| Implement | `mode: "agent"` | `true` | In Review + gates |

Specialists in `src/agents.ts` are **read-only** reviewers — only implement parent opens PRs ([11](./11-interview-sdk-boundaries.md)).

### Failure modes

| Mistake | Correction |
| --- | --- |
| “Webhook from Reporting started SDK” | Reporting **`/signal`** → Todo; SDK needs In Progress |
| “Eval failed so LLM is wrong” | Eval is keyword rubric — fix plan wording or prompt |
| “Bugbot replaced eval” | Independent layers — [14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) |

---

## Architecture & repos — table

| Question | Answer |
| --- | --- |
| Why two repos? | Real Liquid constraint; demo fixes seam without big-bang merge |
| Why duplicate `/api/v1/organisation`? | Intentional ([Core 0002](https://linear.app/liquid-accounting/document/decision-core-0002-the-organisation-contract-is-duplicated-on-purpose-a3e9361a9b32)); SDK convergence classifies later |
| Why loopback BFF per app? | Secrets off browser; demo token pattern |
| Shared BFF? | **Not yet** — eval rejects “shared BFF” plan language |

---

## Theme: Two-repo seam (long-form)

### Why not merge Core + Reporting in one LIQ run

Liquid’s migration story is **convergence**, not **big-bang**. Eval needles explicitly reject plans that propose a single shared BFF or monorepo merge in one hero pass ([17](./17-interview-hard-constraints.md)). The credible demo:

1. **Classify** duplicated contracts (organisation route duplicated on purpose).
2. **Fix** KAN-5 assistant parity in Reporting while Core remains reference.
3. **Prove** with Playwright cross-repo specs (`e2e/cross-repo-parity.spec.ts` on Core).

**Pushback:** “Two repos is artificial.” — “It mirrors real Liquid; the SDK is how we automate seam fixes without pretending migration finished overnight.”

### Loopback BFF pattern

Each app serves **`server/server.mjs`** on localhost with **`LIQUID_BFF_DEMO_TOKEN`** (or fixture mode). Browser never holds `XAI_API_KEY` or `CURSOR_API_KEY`. Insights uses **`LIQUID_INSIGHTS_ACCESS_CODE`** + session — different surface, same secret discipline ([26](./26-interview-insights-democratization.md)).

### KAN-5 vs KAN-18 on two repos

| Ticket | Repo emphasis | Automation |
| --- | --- | --- |
| **KAN-5** | Assistant parity Core vs Reporting | SDK plan/implement → PRs |
| **KAN-18** | Notifications chrome dead in Reporting | `/signal` → Slack + Todo only |

---

## Theme: Signal (long-form)

### What `/signal` does

`POST /signal` on workflow is **public** (CORS) — see `src/access.ts`. Handler **`handleSignal`** (~L279 in `server.ts`):

- Accepts JSON from Reporting `demoSignal.ts` (KAN-18 tags).
- Posts Slack brief; ensures Linear issue in **Todo** — not In Progress.
- **Never** calls `startPlanRun` or `Agent.create`.

**Sound bite:** “Signal is how the product cries for help; In Progress is how engineering starts the SDK.”

### Interviewer trap

They may click “broken Notifications” and ask if that triggered the cloud agent. Answer: **KAN-18** curated signal path only. Move **KAN-5** (or hero) to **In Progress** to show SDK ([11](./11-interview-sdk-boundaries.md)).

### Failure modes

| Symptom | Explanation |
| --- | --- |
| Signal 403 | `SIGNAL_ENABLED=false` in config |
| Linear stayed Todo | Expected — not a bug |
| Slack empty | Webhook URL / workspace config |

---

## Theme: Grok (long-form)

### Three Grok-adjacent surfaces

1. **Insights BFF** — `server/grok/client.ts` + retrieval in `server/insights.ts` ([Decision Insights 0001](https://linear.app/liquid-accounting/document/decision-insights-0001-the-server-retrieves-grok-only-writes-up-e5d91c627e24)).
2. **In-app assistant** — Grok or fixture on app loopback when route exists.
3. **Not Grok** — `/signal`, eval harness, Bugbot.

**Env:** `XAI_API_KEY` on analytics host; missing key → graceful degradation / fixture messaging — not an SDK substitute.

### Grok walk (email)

| Step | File |
| --- | --- |
| Chat POST | `server/app.ts` |
| Retrieve | connectors + handbook RAG |
| xAI | `server/grok/client.ts` |
| Citations | `server/insights.ts` |

Detail: [15 · Grok vs SDK](./15-interview-grok-vs-sdk.md) · [16 · Insights Q&A](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e).

---

## Theme: Merge & human gates (long-form)

### Agents open PRs; humans merge

Workflow 0001 + `WRITE-POLICY.md`: implement run may **`autoCreatePR: true`** but **never** merge. GitHub webhook after human merge moves Linear toward Done (`github-webhook.ts`, `linear-done.ts`).

**Pushback:** “Why not auto-merge on green CI?” — Field engineering demo emphasizes **human judgment** + Bugbot + eval; production might add policy later, but interview story is **approve + merge explicitly**.

### Approve surfaces

- Slack button → workflow `/approve` with token.
- Web `/approve` when `REQUIRE_FORMAL_APPROVAL`.
- Insights confirm-gated Linear moves — **not** implement without workflow gates ([26](./26-interview-insights-democratization.md)).

---

## Models & quality — table

| Question | Answer |
| --- | --- |
| Who picks models? | `models.ts` policy + env overrides |
| Planner vs implementer model? | Intelligence vs balanced — [13 · Routing](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c) |
| Unit vs E2E? | `assistant-unit` fast seam; Playwright parity + proof artifacts |
| Bugbot vs eval? | Independent layers — plan rubric vs PR diff AI review |

---

## Product & observability — table

| Question | Answer |
| --- | --- |
| PostHog in demo? | Narrate detection; don’t tour dashboards in 45 min |
| Sentry role? | Signal → curated ticket; Insights can aggregate counts |
| Grok vs SDK? | Product chat vs migration agents — [15 · Grok vs SDK](./15-interview-grok-vs-sdk.md) |
| Production Liquid? | **Replica** — governed pattern to productionise |

---

## Meta — table

| Question | Answer |
| --- | --- |
| Where is docs source of truth? | GitHub handbook 00–06 auto-sync; 07–27 manual sync ([documentation-sync](./documentation-sync.md)) |
| Ask the bot? | [localhost:5173](http://localhost:5173) |

---

## Cross-links (07–27)

| # | Topic |
| --- | --- |
| 07 | SDK API, subagents, env |
| 08 | Eval rubric keywords |
| 10 | SDK vs skills/MCP |
| 11 | Starts/stops |
| 14 | Merge gates |
| 15 | Grok vs SDK |
| 17 | Anti-patterns |
| 19 | Session arc |
| 22 | File:line map |
| 25 | Tooling source of truth |
| 26 | Insights democratization |
| 27 | Official email |

---

## Sample Meridian Insights bot questions (practice)

1. **Does `/signal` on KAN-18 start the Cursor SDK?** → No — Todo triage only; SDK on In Progress ([11](./11-interview-sdk-boundaries.md)).
2. **What files satisfy the official email’s API requirement?** → `sdk-planner.ts` and `server/grok/client.ts` ([27](./27-interview-official-email-brief.md)).
3. **Why two repos for KAN-5?** → Real seam; SDK fixes Reporting without monorepo fantasy ([17](./17-interview-hard-constraints.md)).
4. **Who merges after implement?** → Human on GitHub; agents never merge ([14](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).
5. **Where is handbook truth for Insights RAG?** → Linear docs + manual sync 07–27 ([documentation-sync](./documentation-sync.md)).

*Last updated: 2026-09-26.*
