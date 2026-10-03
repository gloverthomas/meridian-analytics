> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Official exercise brief (SDK + Grok, live repo walk)

**Purpose:** Quotable rules from the **official interview email** + how **Liquid Accounting** satisfies them in a ~1 minute slide + **working demo** format.

**Related:** [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [10 · SDK vs skills](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) · [11 · SDK boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) · [22 · Codebase map](./22-interview-sdk-codebase-map.md) · [19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624) · [12 · Talking points](https://linear.app/liquid-accounting/document/12-interview-prep-talking-points-and-one-liners-144703f45120)

---

## Sound bites (official exercise)

- **“Two programmatic APIs: `@cursor/sdk` in workflow, xAI HTTP in Insights — skills are how we built, not what we grade.”**
- **“I’ll open `sdk-planner.ts` and `grok/client.ts` and walk trigger → output — that’s the email requirement.”**
- **“`/signal` is not the SDK exercise — In Progress and `/trigger` are ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).”**
- **“KAN-5: Grok in the chat rail; SDK in the plan/implement PRs ([22](./22-interview-sdk-codebase-map.md)).”**
- **“Breakage is OK if I can name the gate — eval, env, intentional defect, or CI ([17 · Constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec)).”**

---

## Official rules (quote in the room)

From the interview email — treat these as **non‑negotiable framing**:

1. **Build with the Cursor SDK or Grok API.** A skill, CLI, or IDE-generated app **without** calling the SDK or API is **not** the exercise.
2. **Using AI to write code is expected**; Tom must **own** the result. Interviewers will **open the repo**, show **where the SDK or API starts**, and **walk trigger → output**.
3. Be ready for **why SDK/API vs skill/product**. If there is no real answer, **pick a different use case** — Liquid’s answer is the split below ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).
4. Slides **~1 minute**, then **demo the working thing**. **Breakage is OK** if you can explain **why** (gates, env, intentional demo defect, CI, etc.).

---

## Liquid’s answer: two APIs, one story

| Requirement | Liquid implementation | “Starts” in code |
| --- | --- | --- |
| **Cursor SDK** | `liquid-workflow` — cloud agents plan/implement → GitHub PRs | `@cursor/sdk` `Agent.create()` in `liquid-workflow/src/sdk-planner.ts` (~L213 plan, ~L392 implement) |
| **Grok API** | **Meridian Insights** BFF — retrieve → Grok → citations; optional **in-app AI Assistant** on Core/Reporting | xAI `https://api.x.ai/v1/chat/completions` in `meridian-analytics/server/grok/client.ts` (~L23–32); synthesis in `server/insights.ts` (~L64–77). Prod assistant: `POST /api/v1/assistant/chat` per hero prompts in `liquid-workflow/src/prompts/liq-24.ts` (BFF route on app `main` when merged) |

**Not the exercise (but we use them):** Cursor **skills/rules** for porting; **MCP** on a laptop; **shell/CLI** (`cli-trigger.ts`) as **operator glue** — the graded path is **SDK + Grok API in services you deploy** ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

**Boundary cheat sheet:** [11 · Starts and stops](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9).

---

## Live walkthrough: Cursor SDK (trigger → output)

**Say:** “I'll open `liquid-workflow` — this is the only place we call the Cursor SDK.”

| Step | Show | File:line (main branch) |
| --- | --- | --- |
| 1. **Credential / config** | `CURSOR_API_KEY`, `DRY_RUN` | `liquid-workflow/src/config.ts` (~L39–49) |
| 2. **HTTP entry** | Linear webhook or `POST /trigger` | `liquid-workflow/src/server.ts` (webhook ~L584+; manual trigger ~L515) |
| 3. **State routing** | In Progress → plan; In Review → implement | `liquid-workflow/src/linear-webhook.ts` (~L55–73 `routeLinearWebhook`) |
| 4. **SDK call** | `Agent.create({ mode, cloud.autoCreatePR, agents })` | `liquid-workflow/src/sdk-planner.ts` (~L144 `startPlanRun`, ~L213 `Agent.create`; ~L273 implement entry, ~L392 `Agent.create`) |
| 5. **Hero prompt (KAN-5)** | Bounded assistant parity scope | `src/prompts/liq-24.ts` ~L9–67; `isLiq24` ~L5–7 |
| 6. **Eval** | Deterministic pass/fail | `src/eval/harness.ts` KAN-5 ~L61–73 (plan), ~L192–198 (implement) |
| 7. **Output** | Run record, eval, PR URLs | Same file + public `GET /evals`, `/status`; artifacts under `liquid-workflow/runs/` |
| 8. **Stops** | No merge/deploy | `liquid-workflow/src/guardrails.ts` (`HUMAN_WRITE_GATE` ~L5); appended on implement ~L427 in `sdk-planner.ts` |

**Demo trigger (happy path):** Linear **KAN-5** (or hero) → **In Progress** → plan run → `/evals` → approve → **In Review** → implement → **GitHub PR** (human merge). Narrate [11 · Boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9).

**Dry-run path (no key):** `DRY_RUN=true` → synthetic plan in `sdk-planner.ts` ~L161–207 — still show `/evals`; say “real run needs `CURSOR_API_KEY`.”

---

## KAN-5 — official walk in two layers

Interviewers may ask you to tie the **hero UI** to the **SDK exercise**. Use two layers:

### Layer A — Product (Grok API in app, not SDK)

| Beat | Narration | Pointer |
| --- | --- | --- |
| Open assistant | “Same chrome in Core and Reporting” | `feature-map.ts` ~L11 |
| Send message | “Browser → loopback BFF, not workflow” | `liq-24.ts` ~L28–29 |
| Reply | “Grok or fixture — customer path” | Core/Reporting `server/server.mjs` on `main` when merged |

### Layer B — SDK (graded exercise)

| Beat | Narration | Pointer |
| --- | --- | --- |
| State move | “We deliberately move Linear to In Progress” | `linear-webhook.ts` ~L67–68 |
| Plan | “Cloud planner reads both repos, no PR yet” | `sdk-planner.ts` ~L213, `mode: "plan"` |
| Eval | “Server scores plan text — not MCP” | `harness.ts` ~L61–73 |
| Implement | “In Review after approve → PR” | ~L392, `autoCreatePR: true` |

**One-liner:** “The email wants SDK trigger → output; KAN-5’s *bug* is product Grok/BFF; KAN-5’s *fix* is SDK implement → PR.”

Full map: [22 · Codebase map](./22-interview-sdk-codebase-map.md).

---

## Signal vs SDK (email confusion killer)

**Common interviewer mistake:** Clicking Reporting notifications or `/signal` and asking “where’s the SDK?”

| Path | Trigger | Code entry | Workflow route | Counts for email exercise? |
| --- | --- | --- | --- | --- |
| **Signal** | Broken bell / demo bridge | `reporting/src/demoSignal.ts` ~L7–21 | `POST /signal` → `handleSignal` ~L279 (`triage_only` ~L319) | **No** — Todo + Slack only |
| **SDK plan** | **In Progress** / `/trigger` | `linear-webhook.ts` → `server.ts` | `startPlanRun` ~L144 | **Yes** |
| **SDK implement** | **In Review** + gates | same | `startImplementRun` ~L273 | **Yes** → PR |

**Say:** “Signal **raises** the ticket; SDK **plans and implements** after workflow states — [10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) explains why skills aren’t enough for that.”

---

## Live walkthrough: Grok API (trigger → output)

**Say:** “Insights is our Grok API exercise — server-side only, no SDK.”

| Step | Show | File:line |
| --- | --- | --- |
| 1. **HTTP entry** | Chat API | `meridian-analytics/server/app.ts` (~L181 `POST /api/v1/insights/chat`) |
| 2. **Session / auth** | Access code gate | `server/auth.ts` + `POST /api/v1/session` routing ~L165 |
| 3. **Retrieve** | Linear docs, GitHub, workflow | `server/chatTurn.ts` → retrieval modules |
| 4. **Grok call** | xAI chat completions | `server/grok/client.ts` (~L23 `XAI_CHAT_URL`, ~L32 POST) |
| 5. **Parse + citations** | Enforced ids | `server/insights.ts` (~L172–181 `synthesize`) |
| 6. **Output** | Streamed answer + citation list | UI `src/` or curl against BFF |

**Optional second Grok surface:** In-app **AI Assistant** — user message → app BFF → Grok/fixture → UI rail (KAN-5); document from prod or `liq-24.ts` if local clone lags `main`.

**Insights actions (not Grok spawn):** Confirm-gated `POST /api/v1/actions/linear-transition` ~L189 — still not `Agent.create` ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).

---

## Why not a skill? (email-ready)

| Interviewer concern | Liquid answer |
| --- | --- |
| “You used Cursor to build this — where’s the SDK?” | **`liquid-workflow/src/sdk-planner.ts`** — programmatic `Agent.create`, not just IDE chat. |
| “Why not a skill in Core/Reporting?” | Skills don’t give **webhook state machine**, **cross-repo cloud sandboxes**, **`/evals` artifacts**, or **PR-only** policy across operators ([10 · SDK vs skills](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)). |
| “Why Grok in a second repo?” | Email allows **Grok API**; Insights is a **real product BFF** (auth, retrieval bounds, confirm-gated actions) — not a slide-only chatbot ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)). |
| “What if the demo breaks?” | Point to **gate** (`EVAL_GATE`, missing key, `WORKFLOW_ENABLED`), **intentional hero defect**, or **CI** — explain layer, don’t bluff ([17 · Constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec)). |
| “Is MCP the integration?” | MCP is IDE/laptop tooling; prod path is HTTP APIs + workflow host — eval is **not** MCP ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)). |

---

## If they push back (official framing)

| Pushback | Response |
| --- | --- |
| “This is two products, not one exercise.” | Email allows **SDK or Grok**; we implemented **both** with a single governance story — acceptable and stronger. |
| “CLI trigger isn’t SDK.” | Correct — operator glue; graded path is `Agent.create` in service code. |
| “Assistant could be a skill.” | No persisted eval, no Linear-driven implement, no cross-repo cloud checkout ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)). |
| “Insights chat is just RAG.” | Grok HTTP + enforced citations + confirm-gated actions — product surface, not IDE skill. |
| “Show me merge.” | Human on GitHub — SDK stops at PR; that’s intentional ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)). |

---

## Failure modes (explain why breakage is OK)

| What broke | Layer to name | Evidence |
| --- | --- | --- |
| Plan 401/500 | Missing/invalid `WORKFLOW_API_TOKEN` on `/trigger` | `server.ts` ~L515 |
| “Need CURSOR_API_KEY” | `DRY_RUN=false` without key | `config.ts` ~L33–34 |
| Implement refused | `EVAL_GATE` or formal approval | `/evals/latest?issue=KAN-5` |
| Reporting assistant send fails | **Intentional KAN-5 defect** pre-fix | `liq-24.ts` ~L27–35 |
| Signal 503 | `WORKFLOW_ENABLED` or `SIGNAL_ENABLED` false | `handleSignal` ~L288–293 |
| Insights fixture answer | Missing `XAI_API_KEY` | `server/config.ts` Grok key |
| CI red on PR | Bugbot / proof jobs — separate from eval pass | [09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67) |

---

## ~1 minute slide + demo (session shape)

1. **Slide (~60s):** Two APIs — SDK control plane + Grok discovery; humans merge; Linear states; link to [12 · One-liners](https://linear.app/liquid-accounting/document/12-interview-prep-talking-points-and-one-liners-144703f45120).
2. **Demo:** Deck → Core/Reporting → Linear state change **or** workflow `/status` → PR/CI; optional Insights Grok question with citations.
3. **Own it:** “I can open `sdk-planner.ts` and `grok/client.ts` and show trigger → output.”
4. **Depth on request:** Insights handbook RAG, eval check ids, routing — [07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888), [22](./22-interview-sdk-codebase-map.md).

Arc timing: [19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624).

---

## Anti-patterns for this exercise (do not claim)

- “`/signal` started the cloud agent.”
- “Skills satisfy the email requirement alone.”
- “Insights holds `CURSOR_API_KEY`.”
- “Eval is an MCP tool agents call.”
- “Agents merge when CI is green.”
- “We merged Reporting into Core in the demo.”

---

## Side-by-side: SDK vs Grok (email scoring)

| Dimension | Cursor SDK path | Grok API path |
| --- | --- | --- |
| **Repo to open** | `liquid-workflow` | `meridian-analytics` |
| **Import / HTTP** | `@cursor/sdk` `Agent.create` | `fetch` to xAI chat completions |
| **Trigger** | Linear In Progress / `/trigger` | `POST /api/v1/insights/chat` |
| **Output** | Plan text, eval, PR URLs | Answer + citation ids |
| **Secrets** | `CURSOR_API_KEY` (workflow host) | `XAI_API_KEY` (analytics host) |
| **Human gate** | Approve before implement; merge on GitHub | Confirm token for Linear moves only |
| **Skills sufficient?** | No ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)) | N/A — API is the product integration |

Both satisfy the email; together they tell one governance story ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

---

## Narration script (~90 seconds, combined walk)

1. “Email requires SDK **or** Grok — we have both.”
2. Open **`sdk-planner.ts` ~L213** — “This is `Agent.create` for plan mode.”
3. Open **`linear-webhook.ts` ~L67** — “In Progress is the trigger, not `/signal`.”
4. Open **`grok/client.ts` ~L23** — “Separate service, xAI HTTP, no SDK import.”
5. Open **`app.ts` ~L181** — “Chat entrypoint for Insights.”
6. “KAN-5: Grok in the assistant rail; SDK when we move Linear to implement Reporting’s BFF.”
7. “Humans merge — [11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9).”

---

## Checklist before “open the repo” moment

- [ ] `liquid-workflow` tab: `sdk-planner.ts` bookmarked (~L213, ~L392)
- [ ] `meridian-analytics` tab: `server/grok/client.ts` (~L23)
- [ ] Linear KAN-5 (or hero) visible — state machine story ready
- [ ] `/evals` or `/status` URL ready on workflow host
- [ ] Signal vs plan distinction rehearsed ([22](./22-interview-sdk-codebase-map.md))
- [ ] [10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) / [11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) / [07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) links mentally loaded

---

## Sample bot / interviewer questions

- **Open the repo and show where the SDK starts.** → `liquid-workflow/src/sdk-planner.ts` → `Agent.create` (~L213).
- **Walk trigger to output for a plan run.** → Linear In Progress → `linear-webhook.ts` ~L67 → `server.ts` ~L609 → `startPlanRun` → `/evals` + run JSON.
- **Does Reporting `/signal` count as the SDK exercise?** → **No** — triage only; SDK starts In Progress / `/trigger`.
- **Where does Grok API start for Insights?** → `server/grok/client.ts` xAI POST; orchestrated from `server/insights.ts`.
- **Why is this not “just a skill”?** → Persisted workflow + eval + cloud agents + PR integration ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).
- **Walk KAN-5 in one minute.** → Product BFF path + SDK plan/implement path ([22](./22-interview-sdk-codebase-map.md)).
- **Where do SDK stops get enforced?** → Prompt law in `guardrails.ts`; humans merge on GitHub ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).
- **What improves next on this harness?** → [24 · Workflow harness improvements](./24-interview-workflow-harness-improvements.md).

*Last updated: 2026-09-26.*
