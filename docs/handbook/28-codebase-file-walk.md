> 📌 **Manual sync:** GitHub handbook + Linear in the same change ([documentation-sync.md](./documentation-sync.md)).

# Codebase file walk: ask Insights these

Ask Meridian Insights any question below. Each section names the sidebar folder on the demo machine and the symbol to jump to. Insights reads this page from Linear and from `docs/handbook/` on GitHub.

Sidebar roots in one Cursor window: **Accounting-core**, **Accounting-reporting**, **liquid-workflow**, **accounting-presentation**. Insights itself is **meridian-analytics**. Quick Open (Cmd+P) the filename, then Cmd+Shift+O the symbol. Check the breadcrumb starts with the right root.

**Accounting-reporting must be on `main` before a file walk.** On `main` the New chat click clears the thread (Reporting PR 34). The failure from the 27 Sep rehearsal is the previous commit. With `AiAssistant.tsx` focused, open Timeline at the bottom of the Files sidebar and pick **File a ticket when Reporting New chat fails to start** (Reporting PR 33).

## The whole path in one sentence

The browser posts a product signal. liquid-workflow opens a Linear ticket in Todo and does not plan. You move that ticket to In Progress to plan. Approve, then move it to In Review, and that opens the PR. You merge on GitHub. The merge webhook moves the ticket to Done and posts Slack.

## Lines to have cold

Say **Grok**. The Reporting error posts the product signal. The workflow opens the Linear ticket. PostHog and Sentry are the detection record. They do not create the ticket. You merge on GitHub. Slack and the cloud agent do not merge. Planner preference is Intelligence. **Composer is the fallback** when Cursor Router is not entitled, not the planner preference. Security reviewer is Intelligence. Quality reviewer is Cost. Implementer is Balance. BugBot autofix commits onto the open PR. It does not open a second PR and it does not merge.

## Where does New chat live in the code

Reporting New chat lives in the code in **Accounting-reporting** `src/components/AiAssistant.tsx`. Search **New chat**. On `main` the click aborts the in-flight request, calls `setMessages([])`, clears the error, and clears busy. **Accounting-core** `src/components/AiAssistant.tsx` already did that. The rehearsal click kept the thread, showed "New chat failed to start", and posted the signal. That version is the Timeline commit on this file, not the working tree on `main`.

## What code filed the New chat ticket

The function was `reportAssistantNewChatFailed` in **Accounting-reporting** `src/productSignal.ts`. It posted `/api/v1/product/signal` with hash `assistant-new-chat`, source `reporting:ai-assistant`, once per page load. An empty thread did not file. Send still worked. That function is gone from `main` because the fix removed the seam. The POST shape still in the file is `reportAssistantRelatedQuestionsFailed` (hash `assistant-related-questions`) and `reportAssistantCalculationAccordionStuck`. Use Timeline on `productSignal.ts` to show the New chat reporter.

## What receives the product signal POST

Open **Accounting-reporting** `server/productSignal.mjs`, symbol `handleProductSignal`. The browser calls same-origin `/api/v1/product/signal`. The server looks up the hash in `SEAMS` and forwards to `WORKFLOW_SIGNAL_URL`. The browser never holds the Linear key. If the workflow cannot be reached and a Linear key is configured on the Reporting server, the same file can create the issue directly. The walkthrough path is the forward.

## Does the product signal start a Cursor SDK plan

No. The product signal does not start a Cursor SDK plan. Open **liquid-workflow** `src/server.ts`, symbol `handleSignal`, then `src/linear-client.ts`, symbol `createProductSignalIssue`. `/signal` opens a Linear issue in **Todo**, assignee set, description containing the phrase **product signal**, and Slacks. It does not call `Agent.create`. You move that issue to **In Progress** to plan. Nothing is pre-created. A second page load can file again. A duplicate webhook delivery does not double-plan.

## Walk the signal to SDK path in full

Walk the signal to SDK path in full. The signal does not start the SDK. It opens a Linear Todo. You start the SDK by moving that ticket to In Progress. This is the mechanism. It is not a recap of Done tickets or merged PRs.

1. Reporting posts `/api/v1/product/signal` once per page load. The browser holds no `CURSOR_API_KEY`.
2. `handleProductSignal` in **Accounting-reporting** `server/productSignal.mjs` forwards that post to the workflow.
3. `handleSignal` in **liquid-workflow** `src/server.ts` creates the Todo with the phrase **product signal** and stops. It does not call `Agent.create`.
4. You move the ticket to In Progress. That move is the SDK kickoff.
5. The Linear webhook starts `startPlanRun`. `Agent.create` uses `mode: "plan"` and `autoCreatePR: false`. `src/prompts/dynamic-ticket.ts` treats the Linear description as the source of truth.
6. `evaluateRun` scores the plan text. A fail means re-plan. Approve implement stays off.
7. You approve, then move to In Review. `startImplementRun` is a second `Agent.create`, `mode: "agent"`, `autoCreatePR: true`. The cloud agent opens the PR.
8. You merge on GitHub. The merge webhook moves the ticket to Done. Slack and the agent do not merge.

PostHog and Sentry record the failure. They do not create the ticket and they do not call `Agent.create`.

## How the signal kick off starts the SDK workflow

The signal does not kick off the SDK. The signal opens a Linear Todo. You kick off the SDK by moving that ticket to In Progress. Say that first, then walk these stages. PostHog and Sentry record the failure. They do not create the ticket and they do not call `Agent.create`.

1. Reporting UI posts `/api/v1/product/signal` once per page load.
2. `handleProductSignal` in Reporting forwards that body to the workflow.
3. `handleSignal` creates the Todo and stops.
4. You move the ticket to In Progress.
5. The Linear webhook starts `startPlanRun` (`autoCreatePR: false`).
6. `evaluateRun` scores the plan text. A fail means re-plan. A pass offers approval.
7. You approve, then move to In Review. That starts `startImplementRun` (`autoCreatePR: true`).
8. You merge on GitHub. The merge webhook moves the ticket to Done.

## Signal kickoff step 1: Reporting posts the signal

The product click is what kicks off the signal, not the SDK. On the planted New chat seam, `reportAssistantNewChatFailed` in **Accounting-reporting** `src/productSignal.ts` ran after a reply when New chat failed. It captured a PostHog event and a Sentry message, then `fetch` POSTed `/api/v1/product/signal` with hash `assistant-new-chat`, source `reporting:ai-assistant`, and the page URL. An empty thread did not file. That function is gone from `main` (Reporting PR 34). The same POST shape is still `reportAssistantRelatedQuestionsFailed` and `reportAssistantCalculationAccordionStuck`. The browser never holds the Linear key or `CURSOR_API_KEY`.

## Signal kickoff step 2: Reporting forwards to the workflow

**Accounting-reporting** `server/productSignal.mjs`, symbol `handleProductSignal`, receives the same-origin POST. It looks up the hash in `SEAMS` and forwards title plus detail to `WORKFLOW_SIGNAL_URL` (the Mac harness at `workflow.meridian-saas.local`). If that forward cannot run and `LINEAR_API_KEY` is set on the Reporting server, the same file can create the Linear issue itself. The walkthrough path is the forward. The browser still does not talk to Linear.

## Signal kickoff step 3: the workflow opens a Todo and stops

**liquid-workflow** `src/server.ts`, symbol `handleSignal`. If `WORKFLOW_ENABLED` or `SIGNAL_ENABLED` is off, it returns 503 and nothing is filed. Otherwise `createProductSignalIssue` in `src/linear-client.ts` opens a **Todo**, assigns it, and writes a description that contains the exact phrase **product signal** plus the seam detail. It Slacks that a signal arrived. It does not call `startPlanRun`, `startImplementRun`, or `Agent.create`. This is triage. The SDK has not started.

## Signal kickoff step 4: you move the ticket to In Progress

This is the kick off of the SDK workflow. In Linear, move the new issue from Todo to **In Progress**. Nothing in Slack, PostHog, Sentry, or the product click does that move for you. Insights can propose a move only after you confirm (`server/actions/linearTransition.ts`, `proposeTransition`). The signal ticket is eligible without a new allowlist entry because `isWorkflowEligible` in `src/workflow-eligibility.ts` accepts the phrase **product signal** in the title or description.

## Signal kickoff step 5: the webhook starts the plan

Linear POSTs `/webhooks/linear` with a valid HMAC. `routeLinearWebhook` in `src/linear-webhook.ts` sees an Issue update into In Progress and returns action `plan`. `startPlanRun` in `src/sdk-planner.ts` calls `Agent.create` with `mode: "plan"` and `autoCreatePR: false`, so this run cannot open a PR. The prompt is `src/prompts/dynamic-ticket.ts`. The Linear description is the source of truth. `src/feature-map.ts` is only a hint. Specialists from `src/agents.ts` are read-only. Cursor Router picks the planner model (Intelligence). Composer is the fallback when the router is not entitled.

## Signal kickoff step 6: the eval scores the plan

`evaluateRun` in `src/eval/harness.ts` is a deterministic checklist over the plan text. It is not an MCP and not a model judge. Slack posts the result. If the eval fails, move the ticket back to **In Progress** to re-plan. **Approve implement** stays off. If it passes, Slack offers **Approve implement**. Approval records the write gate in `src/write-gate.ts` for 24 hours. Approval does not open the PR and does not start a second agent.

## Signal kickoff step 7: In Review opens the PR

After approval, you move the ticket to **In Review**. That state starts `startImplementRun`: `Agent.create` with `mode: "agent"` and `autoCreatePR: true`. The cloud agent opens the PR. The GitHub `pull_request` opened webhook calls `markIssueInReview` in `src/linear-in-review.ts`, which Slacks that the PR is open even if Linear was already In Review, and suppresses a second implement. Next you review BugBot, CI, and the preview. BugBot autofix commits onto that open PR. It does not open a second PR and it does not merge.

## Signal kickoff step 8: you merge and the ticket is Done

You merge on GitHub. Slack and the cloud agent do not merge. The merge webhook calls `markIssueDone` in `src/linear-done.ts` when `GITHUB_AUTO_DONE_ENABLED` is on. Linear moves to **Done** and Slack posts Done. That is the end of the kick off. A refresh of Reporting can file another signal and another Todo. A duplicate webhook delivery does not double-plan: `src/server.ts` skips a delivery id it has already processed and holds a per-issue lock.

## Why was a brand-new ticket eligible

Open **liquid-workflow** `src/workflow-eligibility.ts`, symbol `isWorkflowEligible`. Plan and implement run when `TRIGGER_ISSUE_IDS` is empty, the identifier is in that list, or the title or description contains the exact phrase **product signal**. Signal tickets include that phrase, so they do not need a new allowlist entry. The harness does not change per bug. A Linear `/approve` comment that omits the description is looked up with `findIssueByIdentifier` so the phrase still counts.

## The feature map still mentions related questions

Open **liquid-workflow** `src/feature-map.ts`, then `src/prompts/dynamic-ticket.ts`. The map still describes the related-questions render error. That is a hint for older seams. The dynamic prompt says the **Linear description is the source of truth** for scope. The New chat ticket body carried the New chat writeup. Do not edit the feature map for every new seam.

## What starts the plan

Open **liquid-workflow** `src/linear-webhook.ts`, symbol `routeLinearWebhook`. An Issue update into a trigger state (In Progress) returns action `plan`. Then `src/sdk-planner.ts` `startPlanRun` calls `Agent.create` with `mode: "plan"` and `autoCreatePR: false`. The plan cannot open a PR. Moving the ticket is the trigger. `/signal` is not.

## Is the eval an MCP

Open **liquid-workflow** `src/eval/harness.ts`, symbol `evaluateRun`. The eval is a deterministic checklist in this repo over the plan text. It is not an MCP and not a model judge. A failed plan tells you to move the ticket back to **In Progress**. **Approve implement stays off** when `evalPassed` is false. Do not approve a failed plan. An empty agent result becomes a fallback sentence that only names the issue id, so content checks fail. Re-plan from In Progress.

## Which models and who writes code

Open **liquid-workflow** `src/models.ts`, symbol `ROLE_POLICY`, then `src/agents.ts`, symbol `buildSpecialistAgents`. Planner and security use Intelligence. Quality uses Cost. Implementer uses Balance. The router id is `auto-smart` with param `optimize_for`. Fixed overrides are `CURSOR_MODEL_PLANNER`, `CURSOR_MODEL_SECURITY`, `CURSOR_MODEL_QUALITY`, `CURSOR_MODEL_IMPLEMENTER`. If the router is not entitled, `src/config.ts` falls back to `composer-2.5`. The two specialists are `security-reviewer` and `quality-reviewer`. Their prompts say stay read-only and still mention KAN-6 because that was the original scope example. They do not implement the fix.

## How do you approve and does that open the PR

Open **liquid-workflow** `src/write-gate.ts`, symbol `formalApprovalBlockReason` and `parseApproveCommand`. Approval is Slack **Approve implement**, a Linear comment `/approve` or `approve implement`, or `POST /approve`. It lasts `APPROVAL_TTL_HOURS` (default 24). Approval records the gate. It does not open the PR. You then move the issue to **In Review**, and that starts implement.

## What opens the PR

Open **liquid-workflow** `src/sdk-planner.ts`, symbol `startImplementRun`. In Review starts `Agent.create` with `mode: "agent"` and `autoCreatePR: true`, after a valid approval. The cloud agent opens the PR. There is no separate Create PR click in Slack. Slack buttons appear when the agent text contains a `github.com/.../pull/N` URL.

## Why did Slack say the PR is open

Open **liquid-workflow** `src/linear-in-review.ts`, symbol `markIssueInReview`. The GitHub `pull_request` opened handler in `src/server.ts` calls it. Slack says the PR is open and Linear is In Review, with Open PR and Open Linear. It posts even when the issue was already In Review. If it was not In Review yet, the handler arms implement suppress so the Linear status webhook does not start a second implement. Next step in that message: BugBot, CI, and the preview, then you merge. That merge moves Linear to Done.

## What does BugBot do

BugBot is advisory. Autofix commits onto the **open PR** as Cursor Agent. It does not open a second PR and it does not merge. On an open PR, review that commit. If the PR was already squash-merged, the autofix commit stays on the old branch and needs a follow-up PR onto main. The GitHub webhook in **liquid-workflow** `src/server.ts` can Slack a BugBot review. Fix in Cursor / Fix in Web / Open PR are the manual path. Do not open a second PR from those buttons when the finding is already on an open PR.

## Who is allowed to merge

You merge on GitHub. Slack and the cloud agent do not merge. Open **liquid-workflow** `src/linear-done.ts`, symbol `markIssueDone`. The GitHub merge webhook calls it when `GITHUB_AUTO_DONE_ENABLED` is on. It moves the ticket to **Done**, comments on Linear, and posts Slack **Done**. Branch protection stops agents merging `main`.

## Where do credentials live

Open **liquid-workflow** `src/access.ts`, symbol `routeAccess`. Public routes are GET `/health`, `/status`, `/`, `/evals`, POST `/signal`, and POST `/webhooks/linear` and `/webhooks/github`. Webhooks need a valid HMAC or they are refused. Everything else needs `Authorization: Bearer` `WORKFLOW_API_TOKEN` and fails closed when the token is missing. `/approve` accepts the API bearer or `APPROVE_TOKEN`, compared in constant time after hashing. The browser never holds Cursor, Linear, GitHub, or Slack secrets. `CURSOR_API_KEY` lives only on the Mac harness. Leave `.env.local` closed in the room.

## Where does the harness run and how would this scale

Open **liquid-workflow** `docs/decisions/0005-mac-behind-cloudflare-tunnel.md`. One Node process on this Mac at `127.0.0.1:4100`, reached through the named tunnel `workflow.meridian-saas.local`. The tunnel restarts itself. The Node process does not. A git pull does not change the running process until you restart `npm start`. Scale is one harness, many seams, the same states, idempotent webhooks, one run per issue, and kill switches. Hosting that process is the next step before a team depends on it. Cloudflare Access was considered and is not configured.

## Kill switches

In **liquid-workflow** config: `WORKFLOW_ENABLED`, `SIGNAL_ENABLED`, `LINEAR_AUTO_ENABLED`, `GITHUB_AUTO_DONE_ENABLED`, and the GitHub auto In Review switch. `DRY_RUN` skips a real `Agent.create`. Gates you can name: `EVAL_GATE`, `CI_GATE`, `REQUIRE_FORMAL_APPROVAL`. `/signal` returns 503 when the workflow or signal kill switch is off.

## Grok or the Cursor SDK

Grok answers product questions. The Cursor SDK plans and implements. They are different processes. **Accounting-reporting** `server/assistant.mjs`, symbol `answerAssistant`, calls xAI when `XAI_API_KEY` is set (model `grok-4-fast-non-reasoning`) and otherwise returns a fixture. The key stays on the server. **meridian-analytics** `server/chatTurn.ts`, symbol `runChatTurn`, is the one Insights path for the web app and Slack. `server/grok/client.ts` is the xAI client. `Agent.create` exists only in **liquid-workflow** `src/sdk-planner.ts`. Grok does not plan the fix. The SDK does not answer the accounting question. Say Grok, not Groq.

## Why two repos

Core and Reporting are separate apps with the same chrome. Open the `cloud.repos` list on `Agent.create` in **liquid-workflow** `src/sdk-planner.ts`. The agent is given both repo URLs. New chat was already correct in Core, so the fix PR was Reporting only. A shared BFF is out of scope and fails the eval on purpose.

## Is CI the same thing as the cloud agent

No. CI is GitHub Actions on the PR. Reporting's proof script includes `assistant-unit` and Playwright proof. The cloud agent is the SDK run from `startPlanRun` / `startImplementRun`. You wait for CI, BugBot, and the preview, then you merge. The agent finishing is not the test suite. Cursor Agents UI: filter Source to SDK. The agent link shape is `https://cursor.com/agents/{agentId}`.

## Can Insights create or move the ticket

Open **meridian-analytics** `server/actions/linearTransition.ts`, symbol `proposeTransition`. Insights can read status and, after you confirm, move a ticket. `server/actions/workflowImplement.ts` can record approval and move toward implement, still behind a confirm. In the demo the ticket was created by the product signal, not by Insights, PostHog, or Sentry.

## Two design systems

**Accounting-core** `package.json` and **Accounting-reporting** `package.json` both depend on `lucide-react` `^0.468.0`. Do not claim two design-system versions.

## Idempotency and a second click

Webhook handlers in **liquid-workflow** `src/server.ts` skip a delivery id that was already processed and take a per-issue lock. The browser signal flags in `productSignal.ts` are once per page load. A refresh, or New chat after another reply on the planted build, can file another ticket. Say that if they ask why a second click made LIQ-N+1.

## What the Slack cues mean

Signal received: a Todo exists, move it to In Progress to plan. Plan complete and eval passed: Approve implement, then move to In Review. Plan complete and eval failed: move back to In Progress. Do not use Approve implement. PR is open: review BugBot, CI, and the preview, then you merge. Done: the GitHub merge already happened. Slack is attention. It does not deploy and it does not merge.

## Empty thread and send still works

On the planted New chat seam, clicking New chat with no messages did nothing and did not file. After a reply, New chat kept the thread and filed once. Send still worked the whole time. Core still cleared. On `main` both apps clear.

## Related questions is not this walkthrough

The earlier seam was hash `assistant-related-questions`: after a reply, an empty related-questions list showed an error and posted `/signal`. Reporting PR 32 restored chips when the assistant returns related questions. That is not the New chat walkthrough. The feature map still mentions it. Trust the Linear description on the current ticket.

## PII and retention

**liquid-workflow** `src/pii.ts` scrubs tokens before they land in Slack briefs. Run records retain for `RUN_RETENTION_DAYS` (14). Dead letters go to `runs/ops/dead-letter.jsonl`. Do not read secrets out of `.env.local` to prove this. Point at `access.ts` and `pii.ts`.

## Public eval page versus run JSON

GET `/evals` is public HTML. GET `/evals/latest` and the runs JSON need the bearer token. Do not promise a public JSON dump of the plan.

## Mac process versus git

The demo harness that was restarted for this walkthrough is **liquid-workflow** `main` at `b1ff7cc` (signal body keeps the bug writeup, Slack on PR open, failed plans do not ask for approval). Leave `npm start` and `cloudflared` running. A later merge of workflow code does not apply until fetch, reset to `origin/main`, and a restart. The New chat seam did not require a workflow restart.

## What to do when they ask for a secret

Leave `.env.local` closed. Open `liquid-workflow/src/access.ts`. Say the values stay on the harness, the browser posts same-origin, and agents can open PRs but cannot merge.

## How does the Cursor SDK facilitate the workflow

How does the Cursor SDK facilitate the workflow? It facilitates the workflow only after you move a ticket. `Agent.create` in **liquid-workflow** `src/sdk-planner.ts` is the only SDK call. One `CURSOR_API_KEY` on the harness creates the cloud agent. An engineer does not facilitate this from their own IDE key. Say facilitating, not "the signal started the agent."

1. `startPlanRun` calls `Agent.create` with `mode: "plan"` and `cloud.autoCreatePR: false`.
2. `cloud.repos` clones Core and Reporting at `REPO_STARTING_REF` (default `main`).
3. `agent.send` delivers the prompt. The harness reads `stream()` then `run.wait()`.
4. `buildSpecialistAgents` attaches `security-reviewer` and `quality-reviewer`. The parent must spawn them. Their prompts say stay read-only.
5. `evaluateRun` scores the plan text. A fail stops the loop. A pass waits for your approval.
6. `startImplementRun` is a second `Agent.create` with `mode: "agent"` and `autoCreatePR: true`, after the write gate, a passing plan eval, and CI when `CI_GATE` is on.
7. The agent opens the PR. You merge. The SDK does not merge and does not deploy.

`DRY_RUN=true` skips `Agent.create` and writes a synthetic summary. The agent link is `https://cursor.com/agents/{agentId}`. In Cursor Agents, filter Source to SDK. Metadata is `liquid_issue`, `liquid_run`, and `workflow` (`convergence-planner` or `convergence-implement`).

## One Cursor key calls Agent.create

`startPlanRun` and `startImplementRun` both call `Agent.create` with `apiKey: config.cursorApiKey`. That value is `CURSOR_API_KEY` from the harness `.env.local` (`src/config.ts`). The same call sets `name` (`Liquid planner LIQ-N` or `Liquid implement LIQ-N`), `model` from `resolveRoleModel`, `mode`, `agents`, and `cloud`. Plan mode is `plan`. Implement mode is `agent`. There is no per-engineer key in this call. Insights, Core, Reporting, and the browser do not receive `CURSOR_API_KEY`. If the key is missing and `DRY_RUN` is false, the process fails closed on startup rather than running open.

## The cloud sandbox clones both repos

`Agent.create` `cloud.repos` is two entries: `CORE_REPO_URL` and `REPORTING_REPO_URL`, each with `startingRef` from `REPO_STARTING_REF` (default `main`). Defaults are the Core and Reporting GitHub URLs. The cloud agent clones both. It does not clone liquid-workflow or Insights. `autoCreatePR` is false on the plan call and true on the implement call, so only the second run may open a pull request. `cloud.metadata` records `liquid_issue`, `liquid_run`, `workflow`, and the model id. The harness stores `agent.agentId` and `https://cursor.com/agents/{agentId}`.

## The harness sends the prompt and waits

After `Agent.create`, `buildPlanPromptForIssue` picks the prompt. Heroes KAN-5, KAN-18, KAN-17, KAN-16, and KAN-6 use `src/prompts/liq-*.ts`. Every other ticket, including a product-signal ticket, uses `src/prompts/dynamic-ticket.ts`. That prompt says the Linear description is the source of truth and injects `LIQUID_FEATURE_MAP` only as a hint. `agent.send(prompt)` returns a run. The harness collects `run.stream()` then `run.wait()`. If the text is empty, the summary becomes `Cloud agent {id} completed plan mode for {LIQ-N}.` That fallback names the id only, so eval content checks fail and you re-plan. Implement appends `HUMAN_WRITE_GATE` and `visualProofGate` again after the issue prompt.

## Specialists are attached and stay read-only

`buildSpecialistAgents` in `src/agents.ts` builds the `agents` map passed into `Agent.create`. `security-reviewer` uses the security model (Intelligence). `quality-reviewer` uses the quality model (Cost). The parent is not inside that map. Its model is the `model` field on `Agent.create` (planner Intelligence, implementer Balance). The parent prompt requires spawning both specialists before the plan is final or before PRs open. Each specialist prompt says PASS or FAIL, do not implement fixes, stay read-only. The prompt text still says KAN-6 because that was the original example. On a signal ticket the parent scope is the Linear description. Specialists cannot merge.

## Implement is a second Agent.create

`startImplementRun` does not continue the plan agent. It checks gates, then calls `Agent.create` again. The write gate (`formalApprovalBlockReason`) must be clear unless bypassed. `EVAL_GATE` requires a passing plan eval. `CI_GATE` requires `main` CI green via `checkMainCiGreen`. Then the new agent uses `mode: "agent"`, the implementer model, the same two repos, and `autoCreatePR: true`. The name is `Liquid implement {LIQ-N}`. Metadata `workflow` is `convergence-implement`. The cloud agent opens the PR. `github.com/.../pull/N` URLs in the agent text become Slack buttons. Humans merge. This call does not deploy.

## Does every engineer use their own Cursor key

No. Every engineer does not use their own Cursor key. One `CURSOR_API_KEY` on the liquid-workflow harness calls `Agent.create`. Moving a Linear ticket to In Progress does not read anyone's IDE login. Insights does not hold the key. The browser does not hold the key. Core and Reporting do not hold the key. Spend and the cloud-agent identity belong to that one harness key. In Cursor Agents, filter Source to SDK to see those runs, separate from a person's IDE session. Putting a personal Cursor key in the product or in Insights is the model this workflow refuses.

## What would we need to be enterprise ready

What we would need to ensure this is enterprise ready starts with the key. Not everyone using their own Cursor key is already the design: one `CURSOR_API_KEY` on the harness calls `Agent.create`. The gaps are how that key is owned and where the process runs.

1. Keep one team-owned Cursor key. Do not issue a personal IDE key per engineer. Today the key sits in the demo Mac `.env.local`. Enterprise would keep it in a vault, rotate it, and put spend limits on it. The code already reads only `CURSOR_API_KEY` from the harness process (`src/config.ts`).
2. Run the harness on an always-on host. Decision 0005: the Cloudflare tunnel restarts itself; the Node process does not. Laptop sleep is a 502. A git pull does not update the running process until restart.
3. The key's Cursor account must be allowed to open PRs on Core and Reporting. Enterprise would use a team account on those two repos, not an informal share of a personal login.
4. Stop the public `POST /signal`. Decision 0006 leaves Cloudflare Access unconfigured because webhooks and the browser signal need exceptions. Enterprise would have the Reporting server sign the forward and refuse an anonymous post.

The demo is already the centralized shape. It is not yet the operated service. Say this gap list. Do not say each engineer brings a Cursor key.

## Enterprise ready: approval, audit, and what already holds

The rest of what we would need to ensure this is enterprise ready, after the single Cursor key:

5. Approval is still a demo list. Workflow approval is Slack **Approve implement**, a Linear `/approve` comment, or `POST /approve` with `APPROVE_TOKEN`. Insights Slack buttons are separate: only `SLACK_APPROVER_IDS` can press them, and they still confirm. Eligibility is `TRIGGER_ISSUE_IDS` or the phrase **product signal**. That is not per-team RBAC.
6. Ship run records off the laptop. `runs/` keep 14 days (`RUN_RETENTION_DAYS`) and `src/pii.ts` scrubs tokens. Enterprise would keep that audit in central storage. Metadata already has `liquid_issue` and `liquid_run`.
7. Lock model policy outside a laptop file. `CURSOR_MODEL_PLANNER`, `CURSOR_MODEL_SECURITY`, `CURSOR_MODEL_QUALITY`, and `CURSOR_MODEL_IMPLEMENTER` override the router. Set those on the host, not in an env someone can edit mid-demo.
8. Keep what already matches an enterprise write policy: humans merge, branch protection, read-only specialists, eval and CI gates, HMAC webhooks, a bearer on `/trigger` and `/implement`, and no `CURSOR_API_KEY` in Insights or the browser.

## Sidebar roots

- **Accounting-reporting** — the seam and the fix. On `main` before you start. `src/components/AiAssistant.tsx`, `src/productSignal.ts`, `server/productSignal.mjs`, `server/assistant.mjs`.
- **Accounting-core** — New chat already clears. `src/components/AiAssistant.tsx`.
- **liquid-workflow** — the harness. `src/server.ts`, `src/sdk-planner.ts`, `src/models.ts`, `src/agents.ts`, `src/eval/harness.ts`, `src/write-gate.ts`, `src/access.ts`, `src/linear-webhook.ts`, `src/linear-in-review.ts`, `src/linear-done.ts`, `src/workflow-eligibility.ts`, `src/feature-map.ts`, `src/prompts/dynamic-ticket.ts`.
- **meridian-analytics** — Insights. `server/chatTurn.ts`, `server/grok/client.ts`, `server/actions/linearTransition.ts`. This page is what it should cite for a file walk.
- **accounting-presentation** — `talk.html` is the room script. `LIVE-DELIVERY.md` is the cue card. Enterprise scale and credentials stay if-asked, off the live clock.
