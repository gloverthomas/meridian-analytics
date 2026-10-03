> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Hard constraints and anti-patterns

From assignment + Liquid decisions — **violating these fails the story**.

**Linear:** [17 · Hard constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec) · **Related:** [27 · Official brief](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59) · [11 · Boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) · [14 · Evals](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)

---

## Sound bites

- **“Prototype must call `@cursor/sdk` — skills-only is not the exercise.”**
- **“Two repos stay separate in the hero fix — no big-bang merge outcome.”**
- **“Eval is deterministic TypeScript — not MCP, not LLM judge.”**
- **“`/signal` ≠ SDK; In Progress ≠ signal.”**
- **“Agents open PRs; humans merge and deploy.”**
- **“Breakage OK if you explain which gate or intentional defect failed.”**

---

## Must be true (evidence table)

| Constraint | Evidence | Where to point |
| --- | --- | --- |
| Prototype uses **Cursor SDK** | `import { Agent } from "@cursor/sdk"` | `liquid-workflow/src/sdk-planner.ts` |
| **Grok API** path exists | xAI HTTP client | `meridian-analytics/server/grok/client.ts` |
| **Two repos** in demo fix | Core + Reporting PRs | KAN-5 prompts, eval needles |
| **Deterministic eval** | Keyword harness | `liquid-workflow/src/eval/harness.ts` |
| **Linear** curated tickets | Hero `LIQ-*` | KAN-5 plan/implement |
| **Signal → Todo only** | Public `/signal` | `demoSignal.ts`, `access.ts` |
| **Agents open PRs; humans merge** | WRITE-POLICY, ADRs | Workflow/Core 0001, 0005 |
| Presentation-grade UI | Core + Reporting prod shells | Vercel deploys |
| Synthetic / demo data | BFF fixtures | `server/server.mjs` loopback |
| Clear Grok vs SDK split | Two services | [15 · Grok vs SDK](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed) |

---

## Must not claim

| Anti-claim | Why dangerous |
| --- | --- |
| Production Liquid fleet runs this exact stack today | Demo is assignment-shaped prototype |
| Agents merge or deploy prod | Violates email + Workflow 0001 |
| Eval is LLM-judged or MCP-based | Wrong architecture story |
| PostHog auto-spams Linear | Curated ticket creation; human/agent intent |
| Big-bang shared BFF or full repo merge in one LIQ run | Eval forbids; wrong migration story |
| `/signal` started the cloud agent | Common interviewer trap |
| Insights implements code autonomously | Confirm-gated actions only |
| “We used MCP for eval in prod” | MCP is dev optional |

---

## Official email constraints (quote)

From [27 · Official brief](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59):

1. Build with **Cursor SDK or Grok API** — not skill-only.
2. Interviewers **open repo** — show **where API/SDK starts**, walk **trigger → output**.
3. **Own** the code AI helped write.
4. **~1 min slides**, then **working demo** — breakage OK with explanation.

---

## Security / hygiene (non-negotiable)

### Secrets

- No secrets in git; use `.env.example` patterns only.
- **`CURSOR_API_KEY`** — workflow host.
- **`XAI_API_KEY`** — analytics BFF / app server only.
- No **`VITE_`** privileged keys ([Core 0001](https://linear.app/liquid-accounting/document/decision-core-0001-each-app-has-its-own-loopback-bff-secrets-stay-out-70ddc115826d)).

### Observability allowlists

[Core 0003](https://linear.app/liquid-accounting/document/decision-core-0003-posthog-allowlisted-events-and-properties-only-1f7091a0fc6f) — PostHog events/properties allowlisted; no PII in demo analytics.

### Workflow route tokens

[Workflow 0006](https://linear.app/liquid-accounting/document/decision-workflow-0006-every-control-plane-route-needs-a-token-19fe07367fc6) — **`access.ts`** token policy; `/signal` public by design with **`SIGNAL_ENABLED`**.

### Insights access

**`server/auth.ts`** — access code + session secret; not a substitute for GitHub merge permissions.

---

## KAN-5 constraints (hero)

### Must demonstrate

- Assistant parity defect visible (Reporting vs Core).
- SDK plan/implement on **same ticket** after Linear state moves.
- Eval mentions both repos + write gate + CI names.
- PR opened by agent; **human merge** narrated or shown historical.

### Must not demonstrate as success

- Single-repo-only “fix” that ignores Reporting.
- Agent-merged PR to `main`.
- Skipping approve when `REQUIRE_FORMAL_APPROVAL` on.

---

## KAN-18 constraints (contrast)

### Must demonstrate (if asked)

- **`signalNotificationsIncident`** in **`demoSignal.ts`** POSTs KAN-18 payload.
- Workflow creates Todo + Slack — **no** `Agent.create`.

### Must not claim

- “We fixed notifications by signaling” — signal is triage, not implement.
- Signal path bypasses eval — there is no plan text to score.

---

## Linear / GitHub state constraints

[Workflow 0002](https://linear.app/liquid-accounting/document/decision-workflow-0002-linear-ticket-states-drive-the-workflow-376a80b98e7a):

- **In Progress** → plan
- **In Review** → implement (gated)
- **Done** ← merge webhook, not agent whim

**`linear-webhook.ts`** is SoT for automation mapping — not Slack message text alone.

---

## Eval constraints

[Workflow 0003](https://linear.app/liquid-accounting/document/decision-workflow-0003-plans-are-scored-by-a-deterministic-rubric-not-2984bc0eccfd):

- Harness in repo, versioned, reviewable.
- Implement runs checked for **no-merge-claim**.
- Plan runs checked for **no big-bang** language.

**Extension constraint:** live edits to **`harness.ts`** must keep PR-only story ([18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)).

---

## UI / product constraints

- Synthetic accounting data only — no real customer ledgers.
- Demo tokens for BFF (`LIQUID_BFF_DEMO_TOKEN`) — server-side validation in **`server/server.mjs`**.
- Reporting intentional drift until convergence — not “bug-free prod.”

---

## Tradeoffs (why constraints exist)

| Constraint | Tradeoff accepted |
| --- | --- |
| Human merge | Slower close; higher trust |
| Two repos | More CI matrix; realistic enterprise |
| Deterministic eval | False pass risk; human approve mitigates |
| Public `/signal` | Abuse surface — mitigated by curated payloads + kill switch |
| Manual Linear doc sync | Ops burden — Insights accuracy |

---

## Failure modes that are **OK** in demo

| Failure | Explanation |
| --- | --- |
| Eval fail on plan | Gate working — show `/evals` |
| Assistant 503 without xAI key | Fixture path — Grok on Insights still valid |
| CI red on open PR | Agent output imperfect — human won’t merge |
| Stale plan in Linear | Re-trigger plan — state machine literacy |
| Tunnel down | Show recorded `/evals` + merged PR |

---

## If interviewer pushes “why not X?”

| Push | Response |
| --- | --- |
| Merge repos now | Second act narrative; first act proves governed loop at seam ([21 · Two-repo](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)) |
| Skip eval | Ungoverned agent risk at enterprise scale |
| Let agent merge when CI green | Removes human accountability; violates assignment |
| Single monorepo | Real Liquid constraint is *not* monorepo yet — problem statement |
| Use only IDE agent | No webhook eval artifacts or formal write-gate across operators |
| Auto-implement on `/signal` | Conflates triage with execution ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)) |
| Replace Grok with OpenAI | Assignment allows Grok API path — product choice documented |

---

## Anti-patterns in live extension

Avoid during interview unless explicitly requested ([18](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)):

- Rotating webhook secrets on stage
- Implement without eval pass
- Merging `hello/*` PRs live
- Disabling `REQUIRE_FORMAL_APPROVAL` without calling it out

---

## Documentation sync constraint

Editing handbook **07–27** without Linear update **breaks Insights** for manual-sync pages ([documentation-sync.md](./documentation-sync.md)).

**Do not** add fake “Published from GitHub” banner on drafts.

---

## Quick self-audit before room

- [ ] Can open **`sdk-planner.ts`** and point to `Agent.create`
- [ ] Can recite `/signal` vs In Progress in one breath
- [ ] Can show **`harness.ts`** for “eval not MCP”
- [ ] Hero ticket reset to Todo
- [ ] Know `DRY_RUN` and `EVAL_GATE` from `/status`

---

## Sample bot questions

1. **Is a Cursor skill enough for the exercise?** No — need SDK or Grok API in deployed service ([27](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59)).
2. **Can the agent merge if CI passes?** No — humans only ([Workflow 0001](https://linear.app/liquid-accounting/document/decision-workflow-0001-agents-open-prs-humans-approve-merge-and-deploy-9e0dc91029a3)).
3. **Does signal start planning?** No — Todo curation only.
4. **Is eval an LLM?** No — **`harness.ts`** keyword rubric.
5. **One repo for KAN-5?** No — two-repo parity hero; eval expects both.

*Last updated: 2026-09-26.*
