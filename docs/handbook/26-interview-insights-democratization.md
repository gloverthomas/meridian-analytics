> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Democratizing Meridian Insights (access, guardrails, limits)

**Purpose:** How non-engineers use Insights safely — and what we **do not** expose.

**Related:** [16 · Insights demo](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e) · [Decision Insights 0003](https://linear.app/liquid-accounting/document/decision-insights-0003-actions-are-rule-detected-and-confirm-gated-208ee5ead2d9) · [Insights 0005 question log](https://linear.app/liquid-accounting/document/decision-insights-0005-the-question-log-records-categories-never-text-a4c4ff2037e9) · [15 · Grok vs SDK](./15-interview-grok-vs-sdk.md) · [25 · Tooling SoT](./25-interview-tooling-source-of-truth.md) · [27 · Official brief](./27-interview-official-email-brief.md) · [17 · Constraints](./17-interview-hard-constraints.md)

---

## Sound bites

- **“Access code in, HttpOnly session — not API keys in the browser.”**
- **“Grok sees retrieved bundles only; citations are validated before we show an answer.”**
- **“Move KAN-5 to In Progress? That’s rule-detected, confirm-gated, allowlisted — not autonomous implement.”**
- **“We log question *topics* in PostHog, not what someone typed.”**
- **“Insights orchestrates humans; workflow + SDK executes repo changes.”**

---

## Who it’s for

### Primary personas

- **Engineering leads / PMs** — ticket status, CI narrative, “what did we decide?” with citations to handbook / Linear docs.
- **Approvers** — Slack `@Meridian Insights` + confirm to move allowlisted Linear states or kick workflow approve (same gates as web).
- **Field engineering interviewers** — live Q&A against [20 · Q&A catalog](./20-interview-qa-catalog.md) with sources.

### Explicitly not for

- Arbitrary SQL over warehouse.
- Repo write, merge, prod deploy from chat.
- Unbounded MCP tool execution from browser.
- Replacing `liquid-workflow` SDK loop.

---

## Access model — table

| Surface | Auth | Code / config |
| --- | --- | --- |
| **Hosted web** | Shared **access code** → HttpOnly session (`LIQUID_INSIGHTS_ACCESS_CODE`, `LIQUID_SESSION_SECRET`) | `meridian-analytics/server/auth.ts` |
| **Local dev** | Vite proxy injects **demo bearer** (`LIQUID_BFF_DEMO_TOKEN`) | Never `VITE_` for secrets |
| **Slack** | Workspace install + signing secret; **approver allowlist** for action buttons | `SLACK_APPROVER_IDS` in `.env.example` |

Fail-closed: missing session config → API **503**, not open chat.

---

## Access model — long-form

### Why a shared access code (not SSO in demo)

The assignment optimizes for **fast democratization** in a controlled demo tenant. Production Liquid would map to SSO / RBAC; the **pattern** is what matters:

1. User proves membership (access code today).
2. Server sets **HttpOnly** session cookie.
3. All privileged routes check session middleware before Grok or connectors run.

**Pushback:** “Shared code is insecure.” — “For a replica demo, yes — production would rotate codes, SSO, and per-role action allowlists. The architecture is fail-closed without config.”

### Env vars (analytics host)

| Variable | Role |
| --- | --- |
| `LIQUID_INSIGHTS_ACCESS_CODE` | Gate web entry |
| `LIQUID_SESSION_SECRET` | Sign session cookies |
| `XAI_API_KEY` | Grok completions (optional degrade) |
| `LINEAR_API_KEY` | Read issues/docs |
| `LINEAR_ACTIONS_API_KEY` | Write transitions — empty → read-only |
| `LIQUID_ACTIONS_ALLOWED_STATES` | Default allow In Progress only |
| `WORKFLOW_API_TOKEN` | Read status / approve proxy — not Cursor key |

See `meridian-analytics/.env.example`.

### Local dev vs prod

Vite dev server proxies to BFF with **`LIQUID_BFF_DEMO_TOKEN`** — never expose as `VITE_*`. Prod: [localhost:5173](http://localhost:5173).

### Failure modes

| Symptom | Meaning |
| --- | --- |
| 503 on chat | Missing `LIQUID_SESSION_SECRET` or access code config |
| “Read-only Linear” | `LINEAR_ACTIONS_API_KEY` unset — intentional |
| Slack action ignored | User not in `SLACK_APPROVER_IDS` |

---

## Guardrails — numbered list (core)

1. **Retrieve then write** — Grok only sees bounded bundles; citations validated server-side ([Insights 0001](https://linear.app/liquid-accounting/document/decision-insights-0001-the-server-retrieves-grok-only-writes-up-e5d91c627e24)).
2. **Rule-detected actions** — e.g. “Move KAN-18 to In Progress” → `detectTicketAction` in `server/actions/linearTransition.ts`; **confirm token** before Linear write.
3. **Separate Linear keys** — read `LINEAR_API_KEY` vs write `LINEAR_ACTIONS_API_KEY`; empty write key → read-only messaging.
4. **Allowlisted states** — `LIQUID_ACTIONS_ALLOWED_STATES` (default In Progress only).
5. **Privacy** — PostHog `insights_question` logs **topics**, not question text ([0005](https://linear.app/liquid-accounting/document/decision-insights-0005-the-question-log-records-categories-never-text-a4c4ff2037e9)).
6. **No `CURSOR_API_KEY` in Insights** — workflow token calls **control plane** APIs only.

---

## Guardrails — long-form by theme

### Retrieve → Grok → cite (Insights 0001)

**Anti-pattern:** Browser sends full handbook + Linear dump to Grok. **Pattern:**

1. Server retrieves snippets (handbook sync docs, issue metadata, workflow status).
2. Grok composes answer with citation IDs.
3. `server/insights.ts` validates citations exist before response.

**Interview tie-in:** Same **Grok API** requirement as email — start at `server/grok/client.ts` ([27](./27-interview-official-email-brief.md)), different UX than in-app assistant ([15](./15-interview-grok-vs-sdk.md)).

### Confirm-gated actions (Insights 0003)

Detected intents (regex / rules, not free-form tool use):

| User says (example) | Detected | After confirm |
| --- | --- | --- |
| “Start KAN-5” / “Move to In Progress” | `linearTransition` | Linear API write if allowlisted |
| “Approve plan” | workflow approve proxy | `/approve` with token |

**Not detected / refused:** merge PR, deploy prod, delete resources.

### KAN-5 and KAN-18 through Insights

| Ticket | Safe Insights action | Unsafe expectation |
| --- | --- | --- |
| **KAN-5** | Explain SDK path; maybe move to In Progress after confirm | “Implement and merge for me” |
| **KAN-18** | Explain `/signal` vs SDK; read Sentry narrative | “Fix Notifications automatically” |

Democratization means **answers with citations**, not **autonomous repo surgery**.

### Separation from SDK

| Capability | Insights | liquid-workflow |
| --- | --- | --- |
| `Agent.create` | **Never** | Yes |
| Eval artifacts | Read via API | Authoritative `/evals` |
| Open PR | **Never** | Implement run |
| Grok chat | Yes | No |

[10 · SDK vs alternatives](./10-interview-sdk-vs-alternatives.md) · [11 · Boundaries](./11-interview-sdk-boundaries.md).

---

## What we would **not** expose

- Merge buttons, deploy promote, raw GitHub write.
- Customer PII dumps, full PostHog export.
- Arbitrary MCP tool execution from the browser.
- **Unconfirmed** agent implement or shadow workflow engine.
- **`CURSOR_API_KEY`** or **`XAI_API_KEY`** to clients.

---

## Slack parity with web

`@Meridian Insights` uses same BFF logic — democratization includes **chat surface** approvers already live in. Action buttons respect **`SLACK_APPROVER_IDS`**; others get read-only replies.

**SoT reminder:** Slack is not authoritative — [25 · Tooling](./25-interview-tooling-source-of-truth.md).

---

## Observability without surveillance

PostHog event **`insights_question`** records **category/topic** (e.g. “sdk-boundary”, “eval”) — never raw user text ([0005](https://linear.app/liquid-accounting/document/decision-insights-0005-the-question-log-records-categories-never-text-a4c4ff2037e9)).

**Pushback:** “Can you audit what PMs asked?” — “We audit *demand themes*, not verbatim questions — balances learning vs privacy.”

---

## Demo script beats (45 min session)

1. Show access code login → session cookie in devtools (HttpOnly) — **not** localStorage secrets.
2. Ask “Where does SDK start?” — cited answer pointing `sdk-planner.ts` ([22](./22-interview-sdk-codebase-map.md)).
3. Ask “Move KAN-5 to In Progress” — show confirm UI → Linear write if keyed.
4. Clarify merge still human on GitHub ([14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).

Arc: [19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624).

---

## Failure modes (interview)

| Failure | Explanation |
| --- | --- |
| Grok hallucinated path | Citation validation should catch — show retrieve bundle |
| Action without confirm | Bug — 0003 requires confirm token |
| User expects Insights to open PR | Redirect story to workflow implement after In Review |
| 503 on prod | Misconfigured secrets — fail-closed by design |

---

## Cross-links (07–27)

| Doc | Insights angle |
| --- | --- |
| [07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) | SDK not in analytics |
| [10](./10-interview-sdk-vs-alternatives.md) | Grok vs SDK |
| [15](./15-interview-grok-vs-sdk.md) | Third surface table |
| [16](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e) | Demo Q&A |
| [17](./17-interview-hard-constraints.md) | Insights doesn’t implement code |
| [20](./20-interview-qa-catalog.md) | Bot practice questions |
| [25](./25-interview-tooling-source-of-truth.md) | Read vs write SoT |
| [27](./27-interview-official-email-brief.md) | Grok API start file |

---

## Sample bot questions (from earlier sections)

- **How do business users get in?** → Access code + session cookie on prod Insights URL.
- **Can Insights merge my PR?** → No — propose/read workflow status; merge stays GitHub human.
- **What happens if I ask to delete prod?** → No action intent; Grok answers from docs or refuses.
- **Is my question stored?** → Topic category only in PostHog, not verbatim text.

---

## Sample Meridian Insights bot questions (practice)

1. **Why separate `LINEAR_API_KEY` and `LINEAR_ACTIONS_API_KEY`?** → Read for RAG/chat; write only when actions key set — empty write key keeps read-only UX.
2. **Can Insights call `Agent.create` for KAN-5?** → No — workflow holds `CURSOR_API_KEY`; Insights may confirm-gate Linear In Progress only ([11](./11-interview-sdk-boundaries.md)).
3. **What happens without `LIQUID_SESSION_SECRET`?** → API 503 — fail-closed, not anonymous Grok.
4. **How is democratization different from giving everyone MCP?** → Bounded server connectors + confirm actions, not arbitrary tools ([26 · this doc] guardrails).
5. **Does moving KAN-18 to In Progress via Insights run `/signal`?** → No — Linear state change ≠ product `/signal`; SDK still needs plan/implement path ([20](./20-interview-qa-catalog.md)).

*Last updated: 2026-09-26.*
