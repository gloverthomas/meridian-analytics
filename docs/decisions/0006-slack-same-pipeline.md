# 0006 — Slack uses the same pipeline, verified by signature, approvers allowlisted

- **Status:** Accepted · recorded 2026-09-26

## Context

People ask these questions in Slack. A separate Slack bot with its own logic would drift from the web app; a bot that lets anyone in a channel approve agent work would bypass 0001 in liquid-workflow.

## Decision

- `@Meridian Insights` mentions and DMs run the **same** `runChatTurn` → `answerQuestion` pipeline as the web app. Answers stream into the Slack message and threads carry history.
- Every Slack request is verified with the **signing secret** (HMAC over timestamp and raw body) and refused if older than 5 minutes. These routes don't use the web session. Slack retries and duplicate events are ignored.
- Slack needs a reply within 3 seconds, so the route acknowledges immediately and answers in the background (`waitUntil` on Vercel).
- **Approve / Move buttons** use the same signed confirmation tokens (0003) and a Slack confirm dialog, but only Slack user IDs in `SLACK_APPROVER_IDS` can press them. Anyone else gets a private note and nothing changes. The Linear audit comment names the Slack user who confirmed.
- The bot token and signing secret are server-side only; Slack display names are sanitised before going into Linear comments.

## Consequences

- Anyone in a channel the bot is in can ask read-only questions: the same exposure as the web access code. Only invite it to channels whose members should see this data.
- Some web-only visuals are summarised in Slack (charts become one-line summaries plus a link).

## Alternatives considered

- **Socket Mode bot** — needs a long-running process; we run on Vercel functions.
- **Everyone in the channel can approve** — rejected; approvals need a named, allowed person.

## Where it lives

`server/slack/*`, `docs/slack-app-manifest.json`, README "Slack".
