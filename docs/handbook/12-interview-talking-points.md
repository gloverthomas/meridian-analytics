> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Interview prep: Talking points, narrative, and live narration

**Audience:** Tom Glover — SpaceXAI Field Engineering. This page is the **story layer**; depth lives in [10 · SDK vs alternatives](./10-interview-sdk-vs-alternatives.md), [27 · Official brief](./27-interview-official-email-brief.md), and [07 · SDK reference](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888).

---

## Sound bites (open with these)

- **State machine:** In Progress plans → formal approve → In Review opens PRs → humans merge → GitHub webhook can close Linear Done.
- **Control plane:** Linear owns the ticket; `workflow.meridian-saas.local` owns eval and gates; `@cursor/sdk` in `liquid-workflow/src/sdk-planner.ts` owns cloud agents; Tom merges on GitHub.
- **vs skills:** Skills helped port UI fast; the **SDK service** is how we *operate* a multi-repo loop with persisted runs on `/evals`.
- **Two AIs:** Grok API in Insights (`server/grok/client.ts`) and in-app assistant BFF; Cursor SDK in workflow for repo surgery — different jobs ([15 · Grok vs SDK](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed)).
- **Signal ≠ plan:** Reporting `demoSignal.ts` → `/signal` is triage only; SDK starts on In Progress or `/trigger` ([11 · Boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9)).
- **Production honesty:** Enterprise-shaped **replica** — pattern we would productionise, not a claim that every Liquid customer runs this stack today.

---

## Why this story exists (personal → product)

Interviewers often ask “why did you build this?” before “how does it work?” Liquid Accounting is framed as **recognisable pain**:

1. **Split product surfaces** — Core (`meridian-saas.local`) is canonical; Reporting (`reporting.meridian-saas.local`) duplicated chrome and drifted.
2. **Slow, human-heavy lifecycles** — Defects in shared UI (especially **AI Assistant**) hurt trust; fixes need governance, not one-off IDE sessions.
3. **AI velocity vs safety** — Teams ship faster with agents; enterprises still need **PR review, CI, and explicit merge authority**.
4. **Demo thesis** — Show a **governed** path: discovery/plan → deterministic eval → human approve → implement → PR → human merge, without pretending we merged two repos in one heroic agent run.

If they push back (“Is this real Liquid?”): **Relatable constraints** (two repos, duplicated org BFF, observability) mirror real porting work; URLs and handbook are the **governed replica** we use to teach the pattern ([21 · Two-repo story](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00)).

---

## Narrative spine (45-minute arc)

Use this order in slides + live demo ([19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624)):

| Beat | What Tom says | What to show |
| --- | --- | --- |
| 1. Pain | “One product, two repos; shared chrome drifts.” | Deck or brief UI split |
| 2. Constraint | “Interview requires **SDK or Grok API** in code we can open.” | Tease `sdk-planner.ts` + Grok client ([27](./27-interview-official-email-brief.md)) |
| 3. Loop | “Linear states drive plan/implement; humans merge.” | Linear KAN-5 or hero ticket |
| 4. Hero | “**KAN-5** — assistant works in Core, broken or divergent in Reporting.” | Core + Reporting topbar **AI Assistant** rail |
| 5. Proof | “Eval + CI + Bugbot; not agent merge.” | `/evals`, GitHub PR checks |
| 6. Second act (optional) | “Same loop could classify org BFF vs report-only — not in this session’s merge.” | Narration only |
| 7. Coda | “Meridian Insights answers *how we built this* with citations.” | Optional `localhost:5173` |

**Hero surface:** Prefer **KAN-5 AI Assistant** (right rail). Help (KAN-17) and Notifications (KAN-18) are supporting cast for signal/triage story, not the primary 45-minute spine.

---

## KAN-5 narration (worked example)

**Setup:** Customer-facing assistant must behave the same in Core and Reporting. Prod/demo narrative: both should call the same BFF contract (`POST /api/v1/assistant/chat` when present on branch) with Grok or fixture fallback — see `liquid-workflow/src/prompts/liq-24.ts` and feature map in `src/feature-map.ts`.

**Say while clicking Core:**

- “User opens **AI Assistant** in the topbar → right rail → sends a message.”
- “Browser hits **loopback BFF** with demo bearer — secrets never in `VITE_*` ([Core decision 0001](https://linear.app/liquid-accounting/document/decision-core-0001-each-app-has-its-own-loopback-bff-secrets-stay-out-70ddc115826d)).”
- “Reply comes from Grok/xAI when keyed, else deterministic fixture — **product** path, not SDK.”

**Say while clicking Reporting (before/after fix story):**

- “Same chrome path; historically Reporting diverged — that’s the defect KAN-5 tracks.”
- “Fix lands via **SDK implement run** opening PR(s) on Reporting and/or Core — still **human merge**.”

**If they ask “where’s the SDK in KAN-5?”**

- “Not in the chat bubble. SDK runs when Linear hits **In Progress** → `liquid-workflow` → `Agent.create` in `sdk-planner.ts` → plan text → eval → after approve, **In Review** → implement → PR.”

---

## Signal vs plan (KAN-18 contrast — don’t conflate)

Use when interviewers mix up observability with agent orchestration:

| Path | Trigger | Code entry | Workflow route | Starts SDK? |
| --- | --- | --- | --- | --- |
| **Signal / triage** | Broken notifications bell in Reporting | `meridian-saas (reporting app)/src/demoSignal.ts` POST | `POST /signal` (public CORS) | **No** — Slack + Linear Todo |
| **SDK plan** | Linear **In Progress** or operator `/trigger` | `liquid-workflow/src/linear-webhook.ts` → `server.ts` | `startPlanRun` | **Yes** |
| **SDK implement** | Approve + **In Review** + gates | same | `startImplementRun` | **Yes** → PR |

**Narration line:** “Sentry/PostHog **inform** a curated hero ticket; `/signal` **raises** it; the **SDK** fixes it after we deliberately move workflow states.”

---

## Show live vs narrate only

| Show in the room | Narrate (don’t burn time) |
| --- | --- |
| Deck, Core + Reporting, AI Assistant path | PostHog dashboard tour |
| Linear Todo → In Progress → In Review | Sentry issue UI (mention “signal → ticket”) |
| `workflow.meridian-saas.local/status`, `/evals` | Every PostHog chart |
| GitHub PR, CI jobs, Bugbot comment | “Analytics team curated LIQ-* from trends” |
| Optional Insights one-shot with citations | Full Slack admin setup |

**Failure mode in demo:** If assistant or workflow fails, explain **layer**: missing `CURSOR_API_KEY`, `EVAL_GATE`, `WORKFLOW_ENABLED`, intentional defect, or CI — don’t imply agents merge ([17 · Constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec)).

---

## One-liners by interviewer angle

### “What did you actually build?”

- “A **workflow service** that calls the Cursor SDK for plan/implement PRs, plus **Meridian Insights** calling the Grok API for cited Q&A — and two demo apps that intentionally share/diverge at the seams.”

### “Why not Cursor Agent in the UI only?”

- “IDE sessions don’t give me **webhook idempotency**, `/evals` artifacts, cross-repo cloud sandboxes, and **PR-only** policy enforced for every operator.”

### “Who merges?”

- “Always a human on GitHub. `HUMAN_WRITE_GATE` in `liquid-workflow/src/guardrails.ts` is prompt law; merge webhook can mark Linear Done after evidence.”

### “Is eval your quality system?”

- “Eval is a **deterministic floor** on plan *text* (`harness.ts`). Bugbot + CI + specialists are **separate layers** ([14 · Evals & merge](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae), [09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67)).”

### “What about Insights / democratization?”

- “PMs get **read-mostly** discovery with citations; **confirm-gated** Linear moves only — not merge, not deploy ([26 · Democratization](./26-interview-insights-democratization.md)).”

---

## If they push back

| Pushback | Response |
| --- | --- |
| “This is just ChatGPT wrappers.” | “Two **programmatic** integrations: `Agent.create` and xAI HTTP — show both files; skills didn’t generate those services.” |
| “Eval is too brittle.” | “Agreed it’s a floor — that’s why humans approve plans and Bugbot reviews diffs; we’d add golden fixtures in CI ([23 · Retro](./23-interview-retro-rebuild.md)).” |
| “Why duplicate org BFF?” | “Intentional KAN-13 seam for **classification** in a later convergence story — eval rejects ‘one shared BFF in a single PR’ fantasy.” |
| “PostHog should auto-fix.” | “We **curate** one hero ticket; automation is SDK+human merge, not dashboard → prod.” |
| “45 minutes is short.” | “~1 min slides, then **working** path; depth in Q&A via Insights handbook RAG ([20 · Q&A catalog](./20-interview-qa-catalog.md)).” |

---

## Closing Q&A bridge phrases

- “Happy to go deeper on **model routing** (`models.ts`), **eval check ids**, or **tooling source of truth** ([13](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c), [08](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a), [25](./25-interview-tooling-source-of-truth.md)).”
- “If you want a **live extension**, we can add one harness check or tighten a specialist — bounded, same gates ([18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c)).”
- “Everything here is in **Linear handbook 07–27** — ask Meridian Insights the same question five different ways; citations should converge.”

---

## Anti-patterns (do not say)

- “Agents merge when CI is green.”
- “Eval is an MCP / LLM-as-judge.”
- “We merged Reporting into Core in the demo.”
- “This is exactly how all of Liquid production runs today.”
- “PostHog creates and closes tickets automatically.”
- “`/signal` kicked off the cloud agent.”

---

## Sample bot questions (same story, different words)

- “Give me the **elevator pitch** for Liquid Accounting in one minute.”
- “How do you tell **KAN-5** vs **KAN-18** in the demo narrative?”
- “What do you **show** vs **tell** in a 45-minute interview?”
- “How do you answer ‘is this real production Liquid’?”
- “What’s the **second act** after fixing the assistant?”

*Last updated: 2026-09-26.*
