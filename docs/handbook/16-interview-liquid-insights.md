> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Meridian Insights for demo Q&A

**Prod:** [http://localhost:5173](http://localhost:5173) · **Repo:** [meridian-analytics](https://github.com/gloverthomas/meridian-analytics) · **Linear:** [16 · Insights Q&A](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)

**Related:** [26 · Insights democratization](https://linear.app/liquid-accounting/document/26-interview-prep-democratizing-liquid-insights-access-guardrails-9f0e114ebe1c) · [15 · Grok vs SDK](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed) · [19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624)

---

## Sound bites

- **“Insights is Grok over retrieved bundles — not free-form hallucination.”**
- **“Same BFF as Slack `@Meridian Insights` — one pipeline, two clients.”**
- **“Actions are rule-detected and confirm-gated — no silent Linear moves.”**
- **“Handbook 07–27 on Linear is RAG fuel — ask a doc question to prove sync.”**
- **“Insights never holds `CURSOR_API_KEY` — workflow bearer for reads/approve only.”**
- **“Optional beat in closing Q&A — not the middle of the SDK live demo.”**

---

## When to use in the 45-minute session

### Placement

- **Optional** during **closing Q&A** — not a scripted middle beat ([19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624)).
- Use when interviewer asks documentation, eval, merge policy, or “what was KAN-5?”
- **Do not** replace live Linear → plan → PR walk with only Insights chat.

### What it proves

- **RAG** over Linear handbook + tickets + GitHub + workflow `/evals` + connectors.
- **Citations** enforced server-side — bad ids stripped or flagged.
- **Democratized ops** without giving everyone Cursor SDK keys ([26](https://linear.app/liquid-accounting/document/26-interview-prep-democratizing-liquid-insights-access-guardrails-9f0e114ebe1c)).

---

## Architecture (30–90 sec talk track)

### One BFF

**`meridian-analytics/server/app.ts`** — routes, CORS, session.

Pipeline per chat turn:

1. **Auth** — `server/auth.ts` (`LIQUID_INSIGHTS_ACCESS_CODE`, `LIQUID_SESSION_SECRET`)
2. **Intent** — classify question shape (handbook vs ticket vs GitHub vs workflow)
3. **Retrieve** — bounded bundles from Linear docs, GitHub API, workflow HTTP, PostHog/Sentry when configured
4. **Grok stream** — `server/grok/client.ts` → xAI chat completions
5. **Validate citations** — `server/insights.ts` synthesis / parse
6. **Optional action** — detect allowlisted action → confirm token → execute

**Pattern:** [Insights 0001](https://linear.app/liquid-accounting/document/decision-insights-0001-the-server-retrieves-grok-only-writes-up-e5d91c627e24) — server retrieves, Grok only writes up.

### Actions (not SDK)

**`server/actions/linearTransition.ts`** — allowlisted Linear state transitions with confirm gate ([Insights 0003](https://linear.app/liquid-accounting/document/decision-insights-0003-actions-are-rule-detected-and-confirm-gated-208ee5ead2d9)).

Workflow calls use **`WORKFLOW_BASE_URL`** + **`WORKFLOW_API_TOKEN`** from analytics `.env.example` — read status, evals, approve — **not** `Agent.create`.

---

## Strong demo prompts

| Prompt | What it exercises | Ground truth |
| --- | --- | --- |
| “What was KAN-5?” | Linear + narrative | Hero assistant parity |
| “Did Reporting PR #14 merge?” | GitHub connector | Human merge policy |
| “What’s the workflow eval for KAN-5?” | Workflow `/evals` | **`harness.ts`**, not MCP |
| “How does the human write gate work?” | Handbook 07 / guardrails | **`guardrails.ts`** |
| “Is eval an MCP?” | Handbook 08 / Workflow 0003 | TypeScript harness |
| “Why duplicated org BFF?” | Core/Reporting 0002 | Two-repo seam |
| “What CI jobs must pass on Core?” | Handbook 09 | `ci.yml` job names |
| “Where does SDK start?” | Handbook 11 / 27 | **`sdk-planner.ts`**, not `/signal` |
| “Does signal start the SDK?” | 11, 22 | KAN-18 **`demoSignal.ts`** |

---

## KAN-5 via Insights

Ask: **“Walk me through KAN-5 from defect to PR.”**

Expected retrieval mix:

- Linear ticket body / comments
- Handbook **11**, **14**, **21**, **27**
- Workflow eval artifact summary if connector live

**You narrate live demo gaps** if Insights citation lags manual-sync docs — mention [documentation-sync.md](./documentation-sync.md) and that 07–27 require same-session Linear update.

---

## KAN-18 via Insights

Ask: **“What happens when Reporting notifications break?”**

Should cite:

- **`demoSignal.ts`** → `/signal` → Todo
- Contrast with SDK on **In Progress**
- E2E parity spec on Core side

**Teaching moment:** Insights answers **ops** questions; it does not fix notifications without human/agent PR loop.

---

## Privacy and logging

[Insights 0005](https://linear.app/liquid-accounting/document/decision-insights-0005-the-question-log-records-categories-never-text-a4c4ff2037e9) — question log stores **topics/categories**, not raw question text.

**Say:** “We can tune retrieval without storing customer questions verbatim in analytics DB.”

---

## Relation to interview docs (07–27)

Handbook **10–21** (interview series) publish to Linear for Insights retrieval.

**Verification prompt:** “Where should I read about SDK vs skills?” → should cite [10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) with Linear URL.

**Trap:** Never add `📌 Published from GitHub:` on manual-sync Linear pages unless file is on GitHub `main` with auto-sync — prod Insights may skip stale Linear ([documentation-sync.md](./documentation-sync.md)).

---

## Tradeoffs

### Insights vs opening repos live

**Pros:** Fast answers for broad Q&A; shows product thinking. **Cons:** Less impressive than `sdk-planner.ts` walk for SDK grading — do SDK first.

### Grok synthesis vs retrieved-only template

**Pros:** Natural language answers with citations. **Cons:** Model can overreach — citation validation mitigates, not eliminates.

### Confirm-gated actions

**Pros:** Safer than auto Linear moves. **Cons:** Extra UI step — intentional for demo trust.

---

## Failure modes

| Symptom | Cause | Response |
| --- | --- | --- |
| Wrong citation id | Stale Linear doc | Same-session sync; GitHub vs Linear drift |
| “Insights merged PR” | User phrasing | Clarify humans merge; Insights may only **read** GitHub |
| No workflow eval answer | Token/base URL | Check analytics env; workflow public `/evals` |
| Access denied | `auth.ts` | Demo access code — not interview failure |
| Conflicts with live demo | Timing | Insights is **closing** optional |

---

## If they push back

### “Just use Insights instead of SDK for the exercise”

**Response:** Assignment requires **`Agent.create`** path — Insights is Grok API exercise, not cloud agent + PR ([27](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59)).

### “RAG will hallucinate our merge policy”

**Response:** Retrieve handbook 14 + decisions 0001/0005; citations force grounding; disagree → open **`harness.ts`**.

### “Give everyone MCP instead of Insights”

**Response:** MCP is dev harness; Insights is **deployed BFF** with auth and confirm gates ([10 · SDK vs MCP](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).

---

## Files to show (if deep dive)

| Concern | Path |
| --- | --- |
| Grok API start | `server/grok/client.ts` |
| HTTP surface | `server/app.ts` |
| Auth | `server/auth.ts` |
| Linear action | `server/actions/linearTransition.ts` |
| Handbook chunks | `server/handbook/` (layout per repo) |

Compare workflow: **`liquid-workflow/src/sdk-planner.ts`** — no Grok import.

---

## Cross-links to SDK demo

| Insights says | Verify in workflow |
| --- | --- |
| Eval pass/fail | `GET /evals/latest?issue=KAN-5` |
| Gates | `GET /status` |
| Model roster | `GET /models` |
| Signal vs plan | `access.ts` + `demoSignal.ts` |

[22 · Codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1)

---

## Pre-open checklist

- [ ] Logged into Insights prod or local `:4200`
- [ ] One handbook question + one KAN-5 question tested morning-of
- [ ] Know access code rotation story (server env only)

---

## Sample bot questions

1. **Does Insights call the Cursor SDK?** No — Grok + HTTP connectors; workflow API with bearer token only.
2. **Can Insights merge my PR?** No — read GitHub; merge is human on GitHub.
3. **Where is Grok invoked?** **`server/grok/client.ts`**.
4. **Why citations?** Enforce grounding on Linear handbook and decisions ([Insights 0001](https://linear.app/liquid-accounting/document/decision-insights-0001-the-server-retrieves-grok-only-writes-up-e5d91c627e24)).
5. **When in the session?** Closing Q&A optional — SDK live demo is core ([19](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624)).

*Last updated: 2026-09-26.*
