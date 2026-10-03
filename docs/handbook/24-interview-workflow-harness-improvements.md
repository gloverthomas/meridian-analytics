> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Improving this Cursor SDK + Linear + eval harness

**Purpose:** Concrete improvements to the **exact** stack we shipped — for “what’s next?” and senior tradeoff questions.

**Related:** [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) · [08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) · [10 · SDK vs alternatives](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) · [11 · SDK boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) · [18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c) · [22 · Codebase map](./22-interview-sdk-codebase-map.md) · [23 · Retro](./23-interview-retro-rebuild.md)

---

## Sound bites (improvements)

- **“I’d harden idempotency and signal auth before I’d add another hero prompt file.”**
- **“Eval changes get `rubricVersion` + golden fixtures — agents still don’t self-grade ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).”**
- **“Insights reads workflow; it never becomes a second SDK host ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).”**
- **“KAN-5 improvements co-locate prompt + harness checks — same folder, same PR ([22](./22-interview-sdk-codebase-map.md)).”**
- **“Live extensions stay bounded: one check id or one specialist — same gates ([18](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)).”**

---

## Cursor SDK layer

| Improvement | Problem today | Direction | Pointer |
| --- | --- | --- | --- |
| **Structured run metadata** | Run JSON on disk; dashboard reads files | Emit run lifecycle to structured logs + optional webhook for Insights “pipeline” tile | `sdk-planner.ts` `persist()` |
| **Repo checkout policy** | Two fixed URLs in config | Per-ticket **repo set** in Linear custom field (Core-only vs both) | `Agent.create` cloud.repos ~L220–223 |
| **Specialist budget** | Security + quality always spawn | Configurable per hero; skip quality on docs-only plans | `src/agents.ts` |
| **Implement quirk** | Write-gate appended twice on some heroes | Normalize in `startImplementRun` only | `sdk-planner.ts` ~L427 vs `liq-24.ts` ~L64–66 |
| **DRY_RUN ergonomics** | Silent synthetic plans | Clearly label dry-run in Linear comment + `/evals` | `sdk-planner.ts` ~L161–207 |
| **KAN-5 routing clarity** | `isLiq24()` in prompt module | Single registry map issue id → prompt builder + eval pack | `liq-24.ts` ~L5–7, `sdk-planner.ts` ~L238 |

**Keep:** `mode: plan` vs `agent`, `autoCreatePR: false|true`, read-only specialists — this maps cleanly to interviewer mental model ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

---

## Linear integration

| Improvement | Today | Better |
| --- | --- | --- |
| **Webhook idempotency** | File-backed `alreadyProcessed` / issue locks (`src/ops.ts`) | Shared idempotency store; visible “stuck lock” admin action |
| **State guardrails** | Webhook drives plan/implement | Reject implement if issue skipped **In Progress** eval window |
| **Human-readable briefs** | Slack + eval links | Standard Linear comment template: plan summary, eval pass/fail, PR links, preview |
| **Insights as alternate UI** | Confirm-gated “Move to In Progress” | Same webhook path — document that Insights is **not** a second workflow engine ([16](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e)) |
| **Comment `/approve`** | `routeLinearCommentApproval` ~L80+ | Audit log row per approval id tied to eval run |

**Routing anchor:** `linear-webhook.ts` `routeLinearWebhook` ~L55–73 — In Progress → plan; In Review → implement.

**Formal approve:** `REQUIRE_FORMAL_APPROVAL` + `/approve` — improvement: **time-boxed approve tokens** tied to eval id so stale plans can’t be implemented.

---

## Eval harness (`src/eval/harness.ts`)

| Improvement | Rationale | KAN-5 example |
| --- | --- | --- |
| **Versioned rubric** | Export `rubricVersion` on every eval; Insights answers “which checks applied?” | Bump when editing ~L61–73 |
| **Issue-specific packs** | KAN-5 checks live beside `liq-24.ts` prompts | Co-locate `mentions-ai-assistant`, `implement-ai-assistant` |
| **Negative tests** | CI job: known-bad plan snippets must fail specific check ids | Fail `no-big-bang` when plan proposes shared BFF ~L169–181 |
| **Implement gate clarity** | When `EVAL_GATE` blocks `/implement`, return **actionable** eval id + failing check list | Partially in `sdk-planner.ts` today |
| **Not an MCP** | Resist turning harness into MCP “tool” — keep **server-side only** | [10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) |

**Shared plan checks (all heroes):** `lists-files-or-repos` ~L127, `playwright-parity` ~L133, `ci-jobs` ~L139, `feature-map-path` ~L145, `human-write-gate` ~L157, `no-big-bang` ~L169.

**Optional extension (live demo safe):** Add one check id + fixture plan in PR — bounded, same gates ([18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)).

---

## Gates stack (workflow + GitHub + Cursor)

Today: `EVAL_GATE`, `CI_GATE`, `REQUIRE_FORMAL_APPROVAL`, Bugbot, Security Agent ([09](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).

| Friction | Improvement |
| --- | --- |
| CI gate latency | `CI_GATE_STRICT` vs soft mode in `config.ts` — document when demo uses soft |
| Overlapping reviews | Matrix: eval (plan text) vs Bugbot (diff) vs specialists (read-only) — **no single replacement** |
| Merge → Done | GitHub webhook hero allowlist — extend with **PR label** requirement (`hero:KAN-5`) |
| Implement without merge | Reinforce [11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) — agents open PRs only |

---

## Signal path improvements (without starting SDK)

| Today | Risk | Improvement |
| --- | --- | --- |
| Public `POST /signal` (`access.ts` ~L20) | Spam / abuse on tunnel | Signed JWT from Reporting BFF |
| `handleSignal` ~L319 `triage_only` | Interviewers think plan started | Response body + Linear comment template says “Todo only” |
| Default issue id in body | Confusion | Require `issueIdentifier` in prod; demo keeps default |

**Signal vs SDK table:** [22 · Signal vs SDK](./22-interview-sdk-codebase-map.md) · boundaries [11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9).

---

## KAN-5 harness + prompt co-evolution

When improving KAN-5, change **both**:

1. **Prompt law** — `buildLiq24PlanPrompt` / `buildLiq24ImplementPrompt` in `liq-24.ts` (~L9–67) — mentions `assistant-unit`, `/api/v1/assistant/chat`, feature-map path.
2. **Eval needles** — `harness.ts` plan ~L61–73, implement ~L192–198 — keep needles aligned with prompt vocabulary.

**Failure mode:** Prompt says “assistant” but eval expects “AI Assistant” only — mitigate with case-insensitive `requireMention` (already substring-based).

**Product proof jobs:** Core `assistant-unit` + `parity-proof`; Reporting `assistant-unit` + `help-proof` — prompt and eval should name the same job strings (~L142 in harness).

---

## Meridian Insights ↔ workflow coupling

Improvements without blurring boundaries:

- **Read-only by default** — Workflow approve implement stays confirm-gated + `SLACK_APPROVER_IDS` pattern on Slack.
- **Citation of `/evals`** — Retrieval bundle includes latest eval summary URL from workflow API.
- **No SDK from Insights** — Never pass `CURSOR_API_KEY` to analytics; workflow token is **invoke control plane**, not **spawn agent in browser** ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).
- **Grok separate from SDK** — Insights `server/grok/client.ts` ~L23 — email allows both; don’t merge control planes ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

**Workflow implement from Insights:** `server/app.ts` ~L190 `POST /api/v1/actions/workflow-implement` — confirm token + same gates as Slack approve.

---

## If they push back (“why not X?”)

| Pushback | Answer |
| --- | --- |
| “Make eval an MCP tool for agents.” | Agents would self-grade; harness stays server-side ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)). |
| “Let Insights spawn plan runs.” | Blurs boundary; Insights proposes allowlisted Linear moves only ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)). |
| “Auto-implement on eval pass.” | Eval is floor; formal approve + human plan review remain ([14](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae)). |
| “Remove `/signal` entirely.” | Loses demo narrative for KAN-18 triage; harden auth instead ([23 · Retro](./23-interview-retro-rebuild.md)). |
| “One repo for workflow + apps.” | Meta-repo for docs/CI ok; still two deployables until convergence PR. |

---

## Failure modes when improving the harness

| Mistake | Symptom | Guard |
| --- | --- | --- |
| Tighten rubric without fixtures | False fails block demo | Golden plans in CI before enabling stricter checks |
| Expose eval via MCP | Agents optimize plan text for keywords | Keep eval server-only |
| Insights gets `CURSOR_API_KEY` | Browser-adjacent secret leak | Workflow host only ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)) |
| Public `/signal` unchanged while adding heroes | Noise Todo tickets | Rate limit + JWT |
| Duplicate gate injection | Agent confusion / token burn | Single inject in `startImplementRun` |

---

## Webhook & server hardening

| Route | Improvement | File anchor |
| --- | --- | --- |
| `POST /webhooks/linear` | Replay window + idempotency key on delivery id | `server.ts` ~L584+ |
| `POST /webhooks/github` | Require merge commit sha in payload audit log | github handler |
| `POST /implement` | Return `{ evalId, failedChecks[] }` on 403 | `server.ts` ~L530 + `sdk-planner.ts` |
| `GET /health` | Include rubric version + config flags | health handler |

Kill switches stay — document demo vs prod values on `/status` (~L105 in `server.ts`).

---

## Specialist subagents — targeted improvements

| Specialist | Today | Improvement |
| --- | --- | --- |
| security-reviewer | Always spawned | Skip on pure copy/doc plans |
| quality-reviewer | Playwright / scope | Hero-specific checklist from `feature-map.ts` row |
| Parent planner | Spawns both | Cap total subagent minutes per run (cost) |

Definitions live in `src/agents.ts`; models in `src/models.ts` — changes are workflow-only PRs ([07](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888)).

---

## Formal approval flow improvements

| Step | Today | Better |
| --- | --- | --- |
| Plan completes | Slack + eval link | Linear comment template with `/evals/latest` URL |
| Human approves | `/approve` route or Linear comment | Approve token bound to `runId` + expiry |
| Implement | Gated POST | Reject if plan eval older than N days |

Aligns with [14 · Evals & merge policy](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) — eval pass ≠ auto-implement.

---

## Documentation & Insights coupling

| Problem | Improvement |
| --- | --- |
| Handbook 22–27 drift | Same PR updates GitHub + Linear ([documentation-sync](./documentation-sync.md)) |
| Insights cites wrong hash | Publish pipeline writes canonical Linear doc id |
| “Skip fake GitHub hash” footgun | CI check that handbook frontmatter matches Linear |

Retro context: [23 · Retro rebuild](./23-interview-retro-rebuild.md).

---

## Prioritized roadmap (say this if asked “what first?”)

1. **Idempotency store + lock visibility** — unblocks multi-instance workflow.
2. **Handbook publish pipeline** — unblocks Insights trust.
3. **Signal JWT** — unblocks prod-shaped security without changing triage semantics.
4. **Golden eval fixtures** — unblocks safe rubric iteration.
5. **Run lifecycle webhook** — nice-to-have for Insights pipeline UI.

Deeper retro context: [23 · Retro rebuild](./23-interview-retro-rebuild.md).

---

## Sample bot questions

- **How would you make evals safer to change?** → Versioned rubric + CI golden plans ([08](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a)).
- **What’s the weakest link in the harness?** → Public `/signal` + file-backed locks — auth and durable idempotency ([22 · Codebase map](./22-interview-sdk-codebase-map.md)).
- **Can Insights replace Linear for workflow?** → No — it proposes allowlisted moves; Linear webhooks remain SoT for auto plan/implement.
- **How do you extend live without breaking the demo?** → One rubric check or one specialist — [18](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c).
- **Why isn’t eval an MCP tool?** → Agents must not self-grade; server-side harness only ([10](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221)).
- **How would you improve KAN-5 specifically?** → Co-locate prompt + harness pack; align CI job names in eval needles.
- **Where does SDK improvement stop?** → At human merge and prod deploy ([11](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).

*Last updated: 2026-09-26.*
