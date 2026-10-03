> 📌 **Manual sync:** Edit this file and [Linear 10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) in the same change ([documentation-sync.md](./documentation-sync.md)). Insights RAG reads Linear.

# Interview prep: Cursor SDK vs skills, API, MCP, and scripts

**Audience:** Tom Glover — SpaceXAI Field Engineering live Q&A and extension prompts.

**Related:** [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [11 · SDK boundaries](./11-interview-sdk-boundaries.md) · [15 · Grok vs SDK](./15-interview-grok-vs-sdk.md) · [17 · Hard constraints](./17-interview-hard-constraints.md) · [22 · Codebase map](./22-interview-sdk-codebase-map.md) · [27 · Official brief](./27-interview-official-email-brief.md) · [Decision Workflow 0001](https://linear.app/liquid-accounting/document/decision-workflow-0001-agents-open-prs-humans-approve-merge-and-deploy-9e0dc91029a3) · [12 · Talking points](https://linear.app/liquid-accounting/document/12-interview-prep-talking-points-and-one-liners)

---

## The assignment constraint (official email)

Quotable rules from the interview email ([27 · Official brief](./27-interview-official-email-brief.md)):

- Build with the **Cursor SDK or Grok API**. A skill, CLI, or IDE-generated app **without** calling the SDK or API is **not** the exercise.
- Using AI to write code is **expected**; you must **own** it — interviewers will **open the repo**, show **where SDK or API starts**, and **walk trigger → output**.
- Be ready for **why SDK/API vs skill/product**; if there is no real answer, pick a different use case.

Liquid’s answer: **`liquid-workflow`** (`@cursor/sdk` `Agent.create()` for plan/implement → PR) **plus** **`meridian-analytics`** (Grok xAI API in `server/grok/client.ts` for Insights). Skills/MCP accelerate development; they are **not** the graded prototype path.

### How to say it in one breath

**“We used skills to port React shells fast; the interview grades two HTTP APIs we operate — `@cursor/sdk` on the workflow host and xAI on the Insights BFF.”**

Cross-check the email table in [27](./27-interview-official-email-brief.md) and anti-patterns in [17](./17-interview-hard-constraints.md).

---

## Comparison matrix (memorize for Q&A)

| Approach | Best for | What Liquid uses it for | Why not *only* this for the demo |
| --- | --- | --- | --- |
| **Cursor SDK** (`Agent.create`, cloud agents, subagents) | Durable, webhook-driven, multi-step automation with PR output | `liquid-workflow` plan/implement; specialists in `agents` block | Requires a service you own (gates, eval, tokens) |
| **IDE skills / rules** | Author guidance inside a repo; repeatable local edits | Prior porting velocity; project rules in Cursor | No persisted eval, no Linear state machine, no formal write-gate across machines |
| **Raw LLM API** (xAI Grok, OpenAI, etc.) | Product features needing chat/completion in *your* UX | **In-app AI Assistant** BFF (`POST /api/v1/assistant/chat`); **Meridian Insights** chat | No built-in repo tools, cloud sandbox, or PR workflow |
| **MCP servers** | Tooling surface for agents (Linear, GitHub, PostHog) | Optional on Tom’s laptop; **Insights** uses server-side connectors, not MCP in prod path | Eval harness is **not** an MCP ([Workflow 0003](https://linear.app/liquid-accounting/document/decision-workflow-0003-plans-are-scored-by-a-deterministic-rubric-not-2984bc0eccfd)) |
| **Shell scripts / cron** | Glue, one-shot triggers | Tunnel install, local dev, `cli-trigger.ts` | No model routing, specialists, or Cursor cloud isolation |

---

## Cursor SDK — what you get that skills do not

### Control plane you own

The SDK is invoked from **`liquid-workflow/src/sdk-planner.ts`**, not from Core or Reporting. Liquid wraps every run with:

| Concern | Path | Interview pointer |
| --- | --- | --- |
| HTTP + webhooks | `src/server.ts` | Linear ~L584+; `/trigger` ~L515 |
| State routing | `src/linear-webhook.ts` | In Progress → plan; In Review → implement |
| Eval floor | `src/eval/harness.ts` | KAN-5 needles ~L61–73 / ~L192–198 |
| Model policy | `src/models.ts` | Planner vs implementer roles |
| Write gate | `src/guardrails.ts` | `HUMAN_WRITE_GATE` — no merge in agent prompt |
| Kill switches | `src/config.ts` | `WORKFLOW_ENABLED`, `EVAL_GATE`, `CI_GATE` |

**Env (workflow host):** `CURSOR_API_KEY`, `WORKFLOW_API_TOKEN`, `APPROVE_TOKEN`, `DRY_RUN` — see `liquid-workflow/.env.example` and [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888).

### KAN-5 as the SDK proof ticket

**KAN-5** drives bounded plan/implement prompts in `src/prompts/liq-24.ts`. The **customer** sees a broken AI Assistant in Reporting (Grok/fixture path — [15](./15-interview-grok-vs-sdk.md)). The **interviewer** sees **`Agent.create`** when Linear moves to In Progress / In Review. Same hero, two APIs — do not collapse them in answers.

**Walk trigger → output:** Linear **In Progress** → webhook → `startPlanRun` → `/evals` → approve → **In Review** → `startImplementRun` → GitHub PR (human merge). Full script: [27](./27-interview-official-email-brief.md) · map: [22](./22-interview-sdk-codebase-map.md).

### Failure modes (SDK path)

| Symptom | Likely cause | What to say |
| --- | --- | --- |
| No cloud run | Missing `CURSOR_API_KEY` or `DRY_RUN=true` | Show synthetic plan in `sdk-planner.ts` ~L161–207; real run needs key |
| Plan blocked | Eval fail on `harness.ts` | Open `/evals/latest?issue=KAN-5` — deterministic, not LLM judge |
| Implement blocked | No approve / eval / CI gate | [14 · Evals & gates](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) |
| “Agent merged” | Misread of automation | Workflow 0001 — humans merge; point at `WRITE-POLICY.md` |

---

## IDE skills and rules — accelerators, not the exercise

### What skills did for Liquid

Skills and `.cursor/rules` helped **port** Liquid Accounting UI into Core and Reporting quickly. They encode conventions (loopback BFF, Playwright proof paths, seam tickets). That is **authoring ergonomics** on a developer laptop.

### What skills cannot replace

| Gap | Why it matters for SpaceX brief |
| --- | --- |
| No cross-repo cloud sandbox | KAN-5 touches Reporting BFF + Core parity — SDK clones both |
| No persisted eval artifacts | `/evals` and `runs/` are workflow truth |
| No webhook-driven state machine | Linear In Progress is the demo trigger |
| No enforced PR-only policy | Specialists + `HUMAN_WRITE_GATE` on implement |

**Pushback:** “Couldn’t a skill in each repo open a PR?” — A skill runs where the IDE runs; it does not give you HMAC webhooks, approve tokens, or a single operator dashboard at `workflow.meridian-saas.local`. The SDK path is **durable automation**, not **local edit assistance**.

---

## Raw LLM API (Grok) — product surface, not repo surgery

### Two Grok call sites (both valid for “Grok API”)

1. **Meridian Insights** — `meridian-analytics/server/grok/client.ts` (~L23–32 xAI chat completions); synthesis in `server/insights.ts`.
2. **In-app assistant (when deployed)** — loopback BFF `POST /api/v1/assistant/chat` on Core/Reporting; secrets **`XAI_API_KEY`** server-side, never `VITE_*`.

Grok answers **accountants and operators in chat UX**. It does **not** replace `@cursor/sdk` for **editing two repos under eval**. See [15 · Grok vs SDK](./15-interview-grok-vs-sdk.md).

### KAN-18 contrast (not Grok, not SDK)

**KAN-18** is shell parity / Notifications chrome — Reporting fires **`POST /signal`** via `demoSignal.ts` with `issueIdentifier: "KAN-18"`. That path creates **Slack + Linear Todo** triage only ([11](./11-interview-sdk-boundaries.md)). Using KAN-18 to explain “our AI stack” without separating signal vs SDK is an anti-pattern ([17](./17-interview-hard-constraints.md)).

---

## MCP — developer steering, not production workflow

### Where MCP fits in Tom’s story

MCP connects the **IDE agent** to Linear, GitHub, PostHog, etc. Meridian Insights **does not** expose arbitrary MCP from the browser. Connectors are **bounded server modules** (handbook RAG, workflow status, GitHub read).

### What MCP is explicitly not

- **Not** the eval harness (`harness.ts` is TypeScript keywords — [08 · Eval rubric](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)).
- **Not** merge authority or deploy approval ([25 · Tooling SoT](./25-interview-tooling-source-of-truth.md)).
- **Not** a substitute for `CURSOR_API_KEY` on the workflow host.

**Pushback:** “We use MCP everywhere in prod.” — **Dangerous claim.** Say: “MCP is optional on my machine; graded automation is SDK + Grok HTTP in services we deploy.”

---

## Shell scripts, CLI, and cron — glue only

| Script / route | Role | SDK? |
| --- | --- | --- |
| `liquid-workflow` `cli-trigger.ts` | Operator plan kick | Calls same path as `/trigger` — still ends in `Agent.create` when not dry-run |
| Tunnel / systemd install | Reach `workflow.meridian-saas.local` | Infrastructure |
| `POST /signal` | Product → workflow triage | **No** `Agent.create` |

Scripts that **only** curl an LLM without Cursor cloud lifecycle are **not** the assignment answer. Scripts that **invoke** the workflow service **are** operator glue on top of the SDK.

---

## Decision tree (interviewer “why not X?”)

```
Need persisted plan/implement + PR across Core/Reporting?
  YES → Cursor SDK in liquid-workflow (KAN-5)
  NO → Need customer chat in app?
         YES → Grok API on loopback BFF or Insights BFF
         NO → Need Slack/Todo from broken chrome?
                YES → /signal (KAN-18) — triage only
                NO → Skill/MCP for local dev — not the graded demo
```

---

## Sound bites

- **“Skills helped us port fast; the SDK is how we *operate* the convergence loop.”**
- **“Grok answers customers in the app; the SDK fixes the repo seam across Core and Reporting.”**
- **“MCP is how *I* steer agents in the IDE; Meridian Insights and workflow use first-party APIs with bounded retrieval.”**
- **“Eval is deterministic TypeScript over plan text — not an MCP tool and not an LLM judge.”**
- **“KAN-5 is the hero SDK ticket; KAN-18 is the signal-only contrast — don’t swap them.”**
- **“If you only show a skill file, you haven’t shown `Agent.create` — open `sdk-planner.ts`.”**

---

## Pushback playbook (short answers)

| Challenge | Response |
| --- | --- |
| Why not Agents REST without SDK? | You reimplement sandbox lifecycle, subagents, PR creation — SDK is the supported cloud-agent path |
| Why not one monorepo skill? | Real Liquid has two repos; demo fixes seam without big-bang merge ([17](./17-interview-hard-constraints.md)) |
| Is Insights “the SDK”? | No — no `CURSOR_API_KEY`; confirm-gated Linear only ([26](./26-interview-insights-democratization.md)) |
| Does `/signal` satisfy SDK? | **No** — [11](./11-interview-sdk-boundaries.md) |

---

## Evidence to point at live

- `liquid-workflow/src/sdk-planner.ts`, `src/agents.ts`, `src/models.ts`
- Workflow `/status`, `/evals/latest?issue=KAN-5`
- GitHub PR opened by implement run (never merged by agent)
- Grok start: `meridian-analytics/server/grok/client.ts`
- [08 · Eval rubric](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) · [22 · Codebase map](./22-interview-sdk-codebase-map.md)

---

## Cross-links (07–27 handbook spine)

| Doc | Use when asked about |
| --- | --- |
| [07](./07-cursor-sdk-reference.md) | SDK API surface, env vars, subagents |
| [08](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) | Eval keywords, KAN-5 needles |
| [11](./11-interview-sdk-boundaries.md) | Starts/stops, `/signal` trap |
| [14](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) | Approve, CI gate, merge policy |
| [15](./15-interview-grok-vs-sdk.md) | Two APIs, one KAN-5 |
| [17](./17-interview-hard-constraints.md) | Anti-patterns, breakage OK |
| [19](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624) | ~1 min slides + demo |
| [20](./20-interview-qa-catalog.md) | Flash Q&A + long-form themes |
| [22](./22-interview-sdk-codebase-map.md) | File:line walk |
| [25](./25-interview-tooling-source-of-truth.md) | Linear vs GitHub vs Slack |
| [26](./26-interview-insights-democratization.md) | Access code, guardrails |
| [27](./27-interview-official-email-brief.md) | Email rules verbatim |

---

## Sample interviewer questions (from this doc)

1. **Why not just a Cursor skill in each repo?** — Skills don’t give you webhook-driven plan/implement, cross-repo cloud sandboxes, eval artifacts on `/evals`, or enforced PR-only policy across operators.
2. **Could you replace the SDK with the Agents API only?** — You’d reimplement sandbox lifecycle, subagent roster, and PR creation; the SDK is the supported path for cloud agents + `autoCreatePR`.
3. **Where does MCP fit?** — Developer ergonomics and Insights-style connectors; not the workflow eval or merge authority.
4. **Is Meridian Insights part of the SDK demo?** — Separate product ([Decision Insights 0001](https://linear.app/liquid-accounting/document/decision-insights-0001-the-server-retrieves-grok-only-writes-up-e5d91c627e24)): retrieve → Grok → citations; optional Q&A surface during closing Q&A.

---

## Sample Meridian Insights bot questions (practice)

1. **Where does the Cursor SDK start in our stack?** → `liquid-workflow/src/sdk-planner.ts` `Agent.create`; not `/signal` ([11](./11-interview-sdk-boundaries.md)).
2. **Why did we use skills if they’re not the exercise?** → Porting velocity; graded path is SDK + Grok API in deployed services ([27](./27-interview-official-email-brief.md)).
3. **Can MCP replace our eval harness?** → No — `src/eval/harness.ts` is deterministic TypeScript ([08](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)).
4. **What ticket proves the SDK loop?** → **KAN-5** plan/implement; contrast **KAN-18** signal-only ([22](./22-interview-sdk-codebase-map.md)).
5. **What env var enables real cloud runs?** → `CURSOR_API_KEY` on workflow; `DRY_RUN=true` for local without key ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

*Last updated: 2026-09-26.*
