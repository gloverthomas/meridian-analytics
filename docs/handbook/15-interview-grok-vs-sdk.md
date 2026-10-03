> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Grok in-product vs Cursor SDK

Two deliberate AI surfaces — **do not conflate** in Q&A. Assignment requires **Cursor SDK and/or Grok API**; Liquid uses **both** on purpose.

**Linear:** [15 · Grok vs SDK](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed) · **Related:** [07 · SDK](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [27 · Official brief](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59) · [16 · Insights](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)

---

## Sound bites

- **“Grok talks to accountants in the app; the SDK fixes repos from Linear.”**
- **“Insights: retrieve first, Grok writes second — citations enforced server-side.”**
- **“`grok/client.ts` is the Grok API start; `sdk-planner.ts` is the SDK start.”**
- **“Same hero KAN-5 — broken assistant (Grok BFF) and later SDK plan/implement.”**
- **“KAN-18 `/signal` is neither Grok nor SDK — it’s curated Todo triage.”**
- **“SpaceX brief: in-product assistant can be Grok; assignment SDK lives in workflow.”**

---

## Side-by-side (memorize)

| | **Grok in Core / Reporting** | **Cursor SDK in liquid-workflow** |
| --- | --- | --- |
| **User** | Accountant persona in demo UI | Engineer / operator via Linear + workflow |
| **Entry** | AI Assistant right rail | Linear In Progress / In Review, `/trigger`, `/implement` |
| **API** | xAI via loopback BFF `POST /api/v1/assistant/chat` | `@cursor/sdk` `Agent.create()` |
| **Code** | `server/server.mjs` (Core/Reporting) | `src/sdk-planner.ts`, `src/agents.ts` |
| **Secrets** | Server-side `XAI_API_KEY` (when keyed) | `CURSOR_API_KEY` on workflow host |
| **Output** | Chat reply (fixture if no key) | Plan text, eval artifact, GitHub PR |
| **Hero ticket** | **KAN-5** (Reporting broken / parity) | Same ticket drives SDK plan/implement |
| **Governance** | Product UX, allowlisted context | Eval, specialists, write-gate, PR-only |

---

## Meridian Insights (third surface — still Grok, not SDK)

| | **Meridian Insights** |
| --- | --- |
| **User** | Engineers asking ops/delivery questions |
| **Entry** | [localhost:5173](http://localhost:5173), Slack `@Meridian Insights` |
| **HTTP** | `meridian-analytics/server/app.ts` — chat routes |
| **Grok** | `server/grok/client.ts` → xAI chat completions |
| **Synthesis** | `server/insights.ts` — parse + citation validation |
| **Auth** | `server/auth.ts` — access code + session |
| **Actions** | `server/actions/linearTransition.ts` — rule-detected, confirm-gated |
| **Pattern** | [Insights 0001](https://linear.app/liquid-accounting/document/decision-insights-0001-the-server-retrieves-grok-only-writes-up-e5d91c627e24) retrieve → write → cite |
| **Not** | Replacement for SDK implement; **no** `CURSOR_API_KEY` |

---

## Trigger → output (two walks)

### Grok walk (official email)

| Step | File |
| --- | --- |
| HTTP entry | `server/app.ts` (~`POST /api/v1/insights/chat`) |
| Retrieve bundles | `server/chatTurn.ts`, handbook/Linear/GitHub connectors |
| Grok POST | `server/grok/client.ts` |
| Citations | `server/insights.ts` |

Optional second beat: in-app assistant on Core/Reporting when route exists on deployed branch.

### SDK walk (official email)

| Step | File |
| --- | --- |
| Webhook / trigger | `server.ts`, `linear-webhook.ts` |
| SDK | `sdk-planner.ts` `Agent.create` |
| Eval | `eval/harness.ts` |
| Stop line | `guardrails.ts` |

Full table: [27 · Official brief](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59).

---

## KAN-5: one ticket, two AI surfaces

### Act 1 — Product (Grok or fixture)

User opens Reporting assistant rail → BFF **`POST /api/v1/assistant/chat`** → broken UX demonstrates defect. Core same route works — parity story.

**Prompt text for agents:** `liquid-workflow/src/prompts/liq-24.ts` references assistant paths and tests even though SDK runs on workflow host.

### Act 2 — Engineering (SDK)

Linear **In Progress** → plan classifies Core vs Reporting changes → eval → approve → **In Review** → implement → PRs.

**Say:** “Grok is how the customer experiences AI; SDK is how we safely change two repos under eval.”

---

## KAN-18: neither surface starts full loop

Reporting **`demoSignal.ts`** POSTs **`/signal`** → Slack + Todo. User may still **chat** with assistant elsewhere, but hero for KAN-18 is **notifications chrome**. No `Agent.create` on signal.

Contrast table for interviewers:

| Path | API | Starts cloud agent? |
| --- | --- | --- |
| Assistant chat | Grok/fixture BFF | No |
| `/signal` | Workflow public POST | No |
| In Progress | SDK via webhook | **Yes** |

---

## Trust boundaries

### Browser never sees

- `CURSOR_API_KEY`
- `XAI_API_KEY` (Insights and BFF keep server-side — [Core 0001](https://linear.app/liquid-accounting/document/decision-core-0001-each-app-has-its-own-loopback-bff-secrets-stay-out-70ddc115826d))
- `WORKFLOW_API_TOKEN` (except operator tools — not bundled in Vite)

### Vite-exposed (intentional, limited)

- `VITE_POSTHOG_*`, `VITE_WORKFLOW_SIGNAL_URL` for **`demoSignal.ts`** — signal URL is **public endpoint**, not API key.

---

## Tradeoffs

### Two vendors / two stacks

**Pros:** Best tool per job — chat completion vs cloud agent + PR. **Cons:** More env vars and mental overhead — use handbook 15/16 to unify narrative.

### Fixture assistant without xAI key

**Pros:** Demo works offline. **Cons:** Interviewers may ask “where’s Grok?” — point to **`grok/client.ts`** on Insights and keyed prod.

### Insights actions vs SDK implement

**Pros:** PMs can confirm-gate Linear moves. **Cons:** Must not imply Insights **implements** code — it calls workflow approve/trigger with tokens, not `Agent.create` in analytics repo.

---

## Failure modes

| Confusion | Truth |
| --- | --- |
| “Insights merged the PR” | Insights may approve/trigger; merge is human |
| “Assistant opened the PR” | Only SDK implement with `autoCreatePR` |
| “Eval runs in Insights” | Eval is workflow **`harness.ts`** |
| “MCP is Grok” | MCP is dev tooling; Grok is HTTP API |

---

## If they push back

### “Why not one model everywhere?”

**Response:** Different SLAs and capabilities — Cursor cloud agents for repo tools; Grok for low-latency chat and RAG synthesis ([Insights 0001](https://linear.app/liquid-accounting/document/decision-insights-0001-the-server-retrieves-grok-only-writes-up-e5d91c627e24)).

### “Could the assistant use Cursor instead of Grok?”

**Response:** Product choice; assignment asked for Grok API **and/or** SDK — Liquid demonstrates both distinctly ([27](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59)).

### “Does Insights trigger implement?”

**Response:** Confirm-gated — can call workflow approve/implement routes with bearer token; not autonomous implement from chat without gates ([Insights 0003](https://linear.app/liquid-accounting/document/decision-insights-0003-actions-are-rule-detected-and-confirm-gated-208ee5ead2d9)).

### “Replace SDK with Grok writing patches”

**Response:** Loses sandbox isolation, subagent roster, eval artifacts, and PR-native review — wrong fit for cross-repo implement.

---

## SpaceX / assignment framing

**In-product assistant uses Grok** (or fixture) for finance UX. **Assignment SDK requirement** satisfied by **`liquid-workflow`**, not by replacing the assistant with Cursor chat in the SPA.

Skills/MCP may have **built** the repos — graded path is **service-deployed API calls** ([10 · SDK vs skills](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).

---

## Code map quick reference

| Surface | Repo | Key paths |
| --- | --- | --- |
| SDK | liquid-workflow | `sdk-planner.ts`, `models.ts`, `harness.ts`, `linear-webhook.ts`, `access.ts`, `guardrails.ts` |
| Insights Grok | meridian-analytics | `server/grok/client.ts`, `app.ts`, `auth.ts`, `actions/linearTransition.ts` |
| App shell | Core / Reporting | `server/server.mjs`, `src/demoSignal.ts`, `src/main.tsx` |

[22 · Codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1)

---

## Sample bot questions

1. **Why two models/vendors paths?** Different trust boundaries and UX; same company modernization story.
2. **Could the assistant use Cursor instead of Grok?** Possible product choice; assignment asked for Grok API **and/or** SDK — Liquid uses both distinctly.
3. **Does Insights trigger implement?** Confirm-gated Linear moves and workflow approve — not autonomous implement from chat alone.
4. **Where does Grok API start for grading?** **`meridian-analytics/server/grok/client.ts`** (Insights); assistant BFF is second Grok surface when keyed.
5. **Does `/signal` use Grok?** No — JSON POST to workflow; Slack + Todo only.

*Last updated: 2026-09-26.*
