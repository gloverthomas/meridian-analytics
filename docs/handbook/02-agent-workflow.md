# The agent workflow, end to end

How a ticket goes from "something's broken" to merged, and exactly where humans are in control. Background: [workflow decisions 0001–0003](https://github.com/gloverthomas/liquid-workflow/tree/main/docs/decisions).

## The lifecycle

| Step | Who | Happens in | What happens |
| --- | --- | --- | --- |
| 1. Signal | App or person | Linear (or `POST /signal`) | Someone files a ticket, or an app calls liquid-workflow's `/signal` → **Todo**. Triage only: no agent work yet. (No app calls `/signal` today; the demo defects that did were fixed on 26 Sep 2026.) |
| 2. Plan | Person moves ticket → **In Progress** | Linear → liquid-workflow | The Cursor SDK planner reads both repos, spawns read-only security and quality reviewers, and writes a plan. |
| 3. Eval | Automatic | liquid-workflow | A deterministic rubric scores the plan (names files and tests, states scope and the human gate, no big-bang). Results at `/evals`. |
| 4. Approve | **Person** | Insights "Approve & implement", Slack, Linear `/approve`, or `POST /approve` | Records a formal approval (valid 24 h). Insights also moves the ticket to In Review. |
| 5. Implement | Automatic, after approval + eval pass + CI green | liquid-workflow → GitHub | The implementer opens **PRs only**, with visual proof. It never merges or deploys. |
| 6. Review & merge | **Person** | GitHub | Required CI, BugBot, Security Agent, preview. Humans merge. |
| 7. Done | Automatic | GitHub webhook → Linear | The merge moves the mentioned `LIQ-N` to **Done** and posts a brief. |

## Asking Insights about it

- "What's the Cursor plan for KAN-5?" gives the plan summary, the eval verdict and an Approve & implement button.
- "Where is KAN-5 in the pipeline?" draws the stage-by-stage timeline.
- "How are our evals tracking?" gives the pass rate and the most-failed checks.

## Gotchas

- **Don't mention ticket ids in PR descriptions unless the PR fixes them.** Merging moves every mentioned ticket to Done.
- The most common eval failure is `human-write-gate`: the plan must *state* that a human approves before PRs.
- If the Mac running liquid-workflow is asleep, nothing happens on ticket moves. See [Runbooks](04-runbooks.md).
- Stop everything: set `WORKFLOW_ENABLED=false` and restart the service.
