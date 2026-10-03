# Keeping Linear documentation in sync

**Audience:** Humans and cloud agents editing Liquid handbook, workflow, or demo docs.

**Why:** **Meridian Insights** retrieves **Linear Documents** (team *Liquid accounting*) when answering workflow and “how we built this” questions. If GitHub or the Project store moves ahead of Linear, Insights cites stale text.

---

## Two sync paths

| Content | Edit first (canonical) | Linear |
| --- | --- | --- |
| Handbook **00–06** | [meridian-analytics/docs/handbook/](https://github.com/gloverthomas/meridian-analytics/tree/main/docs/handbook) on GitHub | **Automatic** — GitHub→Linear sync |
| Repo **decision records** | Each repo `docs/decisions/*.md` | **Automatic** — “Decision · …” pages |
| Handbook **07–28** (SDK, eval, PR stack, **interview prep**) | GitHub `docs/handbook/` + Project store `docs/handbook/` | **Manual in the same change** — Linear doc via UI or MCP `save_document` |
| **liquid-workflow** runtime copy | [liquid-workflow](https://github.com/gloverthomas/liquid-workflow) | **Manual** — Linear **07** / **08** / **09** + handbook markdown |
| Demo / prod facts | `docs/live-demo-talk-track.md`, product docs | **Manual** — any Linear section Insights cites |

---

## Definition of done

1. Code or repo markdown updated.
2. **Linear** handbook updated in the **same session**.
3. Project store drafts aligned if used.

Cloud agents: handbook/workflow doc work is **incomplete** without Linear (except pure 00–06 / decision edits on GitHub auto-sync path).

**Insights trap:** Never put `📌 Published from GitHub:` on manual-sync Linear pages unless the file is actually on GitHub `main` with an auto-sync hash. That substring makes prod Insights **skip** the Linear copy (and GitHub may not have the file yet).

---

## Linear index (manual-sync)

| Linear | Store / GitHub draft |
| --- | --- |
| [07 · SDK](https://linear.app/liquid-accounting/document/07-cursor-sdk-and-cloud-agents-reference-d455f9df1888) | `07-cursor-sdk-cloud-agents.md` |
| [08 · Eval](https://linear.app/liquid-accounting/document/08-deterministic-eval-rubric-reference-53c129d9cb9a) | `08-deterministic-eval-rubric.md` |
| [09 · PR stack](https://linear.app/liquid-accounting/document/09-pr-review-ci-bugbot-security-agent-7880d8721b67) | `09-pr-review-ci-bugbot-security.md` |
| [10 · Interview SDK vs alternatives](https://linear.app/liquid-accounting/document/10-interview-prep-sdk-vs-skills-api-mcp-b038d0f2c221) | `10-interview-sdk-vs-alternatives.md` |
| [11 · SDK boundaries](https://linear.app/liquid-accounting/document/11-interview-prep-sdk-boundaries-starts-and-stops-4f31fcd000d9) | `11-interview-sdk-boundaries.md` |
| [12 · Talking points](https://linear.app/liquid-accounting/document/12-interview-prep-talking-points-and-one-liners-144703f45120) | `12-interview-talking-points.md` |
| [13 · Model routing](https://linear.app/liquid-accounting/document/13-interview-prep-model-routing-qanda-a73e9b66315c) | `13-interview-model-routing.md` |
| [14 · Evals & merge](https://linear.app/liquid-accounting/document/14-interview-prep-evals-merge-policy-and-gates-9e3f786bb7ae) | `14-interview-evals-merge-policy.md` |
| [15 · Grok vs SDK](https://linear.app/liquid-accounting/document/15-interview-prep-grok-in-product-vs-cursor-sdk-f4a4c98f7eed) | `15-interview-grok-vs-sdk.md` |
| [16 · Insights Q&A](https://linear.app/liquid-accounting/document/16-interview-prep-liquid-insights-for-demo-qanda-f422477fd02e) | `16-interview-liquid-insights.md` |
| [17 · Hard constraints](https://linear.app/liquid-accounting/document/17-interview-prep-hard-constraints-and-anti-patterns-8983f48643ec) | `17-interview-hard-constraints.md` |
| [18 · Live extension](https://linear.app/liquid-accounting/document/18-interview-prep-live-extension-playbook-150e6d661a6c) | `18-interview-live-extension.md` |
| [19 · Session arc](https://linear.app/liquid-accounting/document/19-interview-prep-45-minute-session-arc-ff4bbb70e624) | `19-interview-session-arc.md` |
| [20 · Q&A catalog](https://linear.app/liquid-accounting/document/20-interview-prep-qanda-catalog-quick-reference-61c3e71eadda) | `20-interview-qa-catalog.md` |
| [21 · Two-repo story](https://linear.app/liquid-accounting/document/21-interview-prep-two-repo-convergence-story-2d1c943c6e00) | `21-interview-two-repo-convergence.md` |
| [22 · SDK codebase map](https://linear.app/liquid-accounting/document/22-interview-prep-sdk-in-the-codebase-where-to-look-17cc55ba90a1) | `22-interview-sdk-codebase-map.md` |
| [23 · Retro rebuild](https://linear.app/liquid-accounting/document/23-interview-prep-retro-if-we-built-this-again-a1a0df7a4b7b) | `23-interview-retro-rebuild.md` |
| [24 · Harness improvements](https://linear.app/liquid-accounting/document/24-interview-prep-improving-this-cursor-sdk-linear-eval-harness-58917d3c525e) | `24-interview-workflow-harness-improvements.md` |
| [25 · Tooling SoT](https://linear.app/liquid-accounting/document/25-interview-prep-tooling-source-of-truth-vs-notification-vs-execution-36bbd0a06822) | `25-interview-tooling-source-of-truth.md` |
| [26 · Insights democratization](https://linear.app/liquid-accounting/document/26-interview-prep-democratizing-liquid-insights-access-guardrails-9f0e114ebe1c) | `26-interview-insights-democratization.md` |
| [27 · Official email brief](https://linear.app/liquid-accounting/document/27-interview-prep-official-exercise-brief-sdk-grok-live-repo-walk-cc97a48fac59) | `27-interview-official-email-brief.md` |
| [28 · Codebase file walk](https://linear.app/liquid-accounting/document/28-codebase-file-walk-2acef5f9bbde) | `28-codebase-file-walk.md` |

Full interview index for Tom: [linear-interview-knowledge-index.md](../linear-interview-knowledge-index.md) (Project store).

*Last updated: 2026-09-26.*
