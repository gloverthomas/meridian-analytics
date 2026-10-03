> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Tooling — source of truth vs notification vs execution

**Purpose:** Why Slack, Linear, Cursor, GitHub, Vercel, PostHog, Sentry each exist — and what Meridian Insights may **read** vs **write**.

**Related:** [27 · Official brief](./27-interview-official-email-brief.md) · [16 · Insights Q&A](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e) · [12 · Talking points](https://linear.app/liquid-accounting/document/12-interview-prep-talking-points-and-one-liners-144703f45120) · [11 · Boundaries](./11-interview-sdk-boundaries.md) · [17 · Constraints](./17-interview-hard-constraints.md) · [22 · Codebase map](./22-interview-sdk-codebase-map.md) · [26 · Insights access](./26-interview-insights-democratization.md)

---

## Matrix (memorize)

| Tool | Source of truth? | Notification / mirror | Execution |
| --- | --- | --- | --- |
| **Linear** | **Yes** — ticket state, hero scope, handbook docs for Insights RAG | Webhooks to workflow; Slack links | State drives plan/implement; Insights confirm-gated moves (allowlist) |
| **GitHub** | **Yes** — code, PRs, CI checks, merge | Bugbot, Security Agent comments | Humans merge; agents open PRs only |
| **Cursor SDK** | No | Cloud agent URLs in run records | Plan/implement in isolated workers |
| **liquid-workflow** | **Yes** — eval artifacts, approve tokens, run history | `/status`, Slack briefs | Invokes SDK; never merges |
| **Vercel** | **Yes** — prod/preview deploy truth | Preview URLs in PRs | **Humans** promote prod |
| **PostHog** | Analytics truth (usage) | Dashboards (narrate off-stage) | Does **not** auto-create tickets |
| **Sentry** | Error truth | Alerts optional | Product **signal** → curated Linear hero (not auto-fix) |
| **Slack** | No | Plan/eval/approve pings; `@Meridian Insights` | Approve buttons → workflow `/approve` |
| **Meridian Insights** | No — **synthesizes** with citations | Same answers as Slack bot | Confirm-gated Linear + workflow approve only |
| **Cursor IDE / skills** | No | Dev ergonomics | Not the interview exercise path ([27](./27-interview-official-email-brief.md)) |

---

## Sound bites

- **“Linear owns the ticket lifecycle; GitHub owns the diff; I own merge and prod.”**
- **“PostHog and Sentry inform **one curated Linear hero** — they don’t replace the SDK loop.”**
- **“Insights is read-mostly discovery with **bounded** writes — not a second workflow engine.”**
- **“Workflow `/evals` is truth for ‘did the plan pass?’ — not Slack thread length.”**
- **“Vercel tells you what shipped; Linear tells you what we *intended* to ship.”**

---

## Linear — workflow authority

### What Linear is authoritative for

- Issue **state** (Todo → In Progress → In Review → Done).
- Hero identifiers (**KAN-5**, **KAN-18**, etc.) and scope text interviewers read.
- **Handbook documents** mirrored for Insights RAG (manual sync 07–27 with GitHub — [documentation-sync](./documentation-sync.md)).

### What Linear is not

- Code truth (GitHub).
- Eval pass/fail detail (workflow `runs/` + `/evals`).
- Deploy truth (Vercel).

### Webhook execution chain

Linear HMAC → `liquid-workflow/src/server.ts` → `routeLinearWebhook` in `linear-webhook.ts`:

| State entered | Workflow action |
| --- | --- |
| **In Progress** | `startPlanRun` → SDK plan |
| **In Review** | `startImplementRun` when approve + eval + CI gates pass |

**Env:** `LINEAR_WEBHOOK_SECRET`, `LINEAR_API_KEY` — workflow `.env.example`.

### KAN-5 vs KAN-18 in Linear

| Ticket | Linear role | Typical state for demo |
| --- | --- | --- |
| **KAN-5** | Hero SDK + assistant parity | In Progress / In Review for SDK |
| **KAN-18** | Signal-created or curated Todo | Stays Todo until human promotes |

Insights may **propose** allowlisted state moves (`LINEAR_ACTIONS_API_KEY`) — confirm-gated ([26](./26-interview-insights-democratization.md)).

### Failure modes

| Symptom | Likely cause |
| --- | --- |
| Webhook 401 | HMAC / secret mismatch |
| State changed, no run | `WORKFLOW_ENABLED=false` or wrong team routing |
| Done without merge | Should not happen — Done tied to GitHub evidence |

---

## GitHub — code and merge authority

### Source of truth

- **`main`** branch content after human merge.
- Open PRs from SDK implement (`autoCreatePR: true`).
- CI checks (unit, Playwright) as merge prerequisites.

### Notification layer

- Bugbot / Security Agent comments on PR diff — **not** eval replacement ([14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)).
- PR preview links → Vercel.

### Execution boundary

Agents **never** merge. Evidence webhook → Linear Done path: `github-webhook.ts`, `linear-done.ts`.

**Pushback:** “GitHub Actions could merge.” — Out of scope for interview story; human merge is Workflow 0001.

---

## liquid-workflow + Cursor SDK — execution, not SoT for code

### Workflow as SoT for automation artifacts

| Artifact | Location |
| --- | --- |
| Eval JSON | `/evals`, `runs/` directory |
| Approve consumption | Approve routes in `server.ts` |
| Run metadata | `/status`, Cursor cloud URLs in records |

### Cursor SDK role

Executes in Cursor cloud — **ephemeral workers**. Liquid persists **pointers** and **eval**, not the sandbox filesystem.

**Env:** `CURSOR_API_KEY`, `DRY_RUN` — [07 · SDK](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888).

### KAN-5 evidence chain

1. Linear In Progress → plan eval pass on `/evals/latest?issue=KAN-5`.
2. Implement → GitHub PR URL in run record.
3. Human merge → GitHub webhook → Linear Done.

---

## Vercel — deploy truth

### Prod vs preview

- **Production** URLs for Core, Reporting, Insights, workflow tunnel — what interviewers hit live.
- **Preview** per PR — narrate briefly; don’t debug preview in 45 min unless asked.

### Execution

Humans promote production. Agents do not hold Vercel tokens in Liquid demo path.

### Failure modes

| Symptom | Narration |
| --- | --- |
| Preview works, prod old | Human hasn’t promoted — not SDK failure |
| Env missing on preview | Vercel project env — separate from workflow secrets |

---

## PostHog — analytics truth, not ticket SoT

### What we use it for

- Product analytics (`src/analytics.ts` on apps).
- Insights **question topics** only — not verbatim text ([Insights 0005](https://linear.app/liquid-accounting/document/decision-insights-0005-the-question-log-records-categories-never-text-a4c4ff2037e9)).

### What we do not claim

- PostHog does **not** auto-create Linear issues on every spike.
- Dashboards are **off-stage** in session arc ([19](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624)).

**Narration beat:** “We’d *detect* funnel drop in PostHog; the hero ticket stays curated.”

---

## Sentry — error truth → human curation

### Reporting KAN-18

`src/sentry.ts` tags shell parity failures (`seam: KAN-18`). Product may call **`/signal`** via `demoSignal.ts` — workflow notifies Slack; Linear Todo.

### Not auto-fix

Sentry does not invoke SDK. Engineers (or operator) move hero to In Progress when ready.

---

## Slack — notification and approve, not SoT

### Channels of truth Slack mirrors

- Plan ready / eval fail briefs with links to `/evals`.
- `@Meridian Insights` bot — same BFF answers as web ([16](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)).

### Approve buttons

Slack approve → workflow `/approve` with **`APPROVE_TOKEN`** or configured auth — unlocks implement path when formal approval required.

**Env:** `SLACK_SIGNING_SECRET`, `SLACK_BOT_TOKEN`, `SLACK_APPROVER_IDS` (Insights `.env.example`).

### Failure modes

| Symptom | Fix narrative |
| --- | --- |
| Button does nothing | Approver not in allowlist |
| Duplicate pings | Expected on retries — SoT still workflow eval |

---

## Meridian Insights — synthesizer with bounded writes

### Read paths

- Handbook / Linear doc RAG.
- Workflow `/status` read via server connector.
- GitHub PR state read.

### Write paths (confirm-gated)

- Allowlisted Linear transitions (`LIQUID_ACTIONS_ALLOWED_STATES`).
- No merge, no deploy, no `CURSOR_API_KEY` ([26](./26-interview-insights-democratization.md)).

### Failure modes

| Request | Behavior |
| --- | --- |
| “Merge PR” | Refuse / explain human gate |
| “Delete prod” | No action intent |
| Missing write key | Read-only messaging |

---

## End-to-end: “Is KAN-5 done?”

| Question | Authoritative answer | Where to look |
| --- | --- | --- |
| Is code merged? | GitHub `main` contains fix | PR merged? |
| Is ticket Done? | Linear state + webhook evidence | Linear UI |
| Did plan pass? | Workflow eval | `/evals/latest?issue=KAN-5` |
| Is prod updated? | Vercel deploy | Prod URL smoke |
| Did agent merge? | **No** — must be false | WRITE-POLICY |

---

## Pushback playbook

| Challenge | Response |
| --- | --- |
| “Slack approved deploy” | Slack approves **implement** gate — humans deploy Vercel |
| “Insights moved ticket, so SDK ran” | Insights allowlist ≠ In Progress webhook unless state actually changed |
| “PostHog opened KAN-5” | Curated hero — observability informs, doesn’t replace intent |
| “Bugbot failed eval” | Different layers — show `harness.ts` |

---

## Cross-links (07–27)

| Doc | Tooling angle |
| --- | --- |
| [07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) | SDK execution |
| [11](./11-interview-sdk-boundaries.md) | `/signal` vs webhooks |
| [14](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) | Merge policy |
| [17](./17-interview-hard-constraints.md) | Anti-patterns |
| [20](./20-interview-qa-catalog.md) | Flash Q&A |
| [22](./22-interview-sdk-codebase-map.md) | Routes + env |
| [26](./26-interview-insights-democratization.md) | Insights writes |
| [27](./27-interview-official-email-brief.md) | Email exercise |

---

## Sample Meridian Insights bot questions (practice)

1. **What is source of truth for “is KAN-5 done”?** → Linear Done **after** merged GitHub PR evidence (webhook), not Slack emoji.
2. **Can PostHog move a ticket to In Progress?** → No — detection narrative; human/agent workflow handles execution.
3. **Does Slack approve production deploy on Vercel?** → No — formal approve unlocks implement; humans promote prod.
4. **Where do handbook answers for Insights live?** → Linear Documents + GitHub handbook manual sync 07–27 ([documentation-sync](./documentation-sync.md)).
5. **If eval passes but PR isn’t merged, is KAN-5 done?** → No — GitHub merge is separate human step; Linear may still be In Review.

*Last updated: 2026-09-26.*
