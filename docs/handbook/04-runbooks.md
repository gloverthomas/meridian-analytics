# Runbooks

## liquid-workflow isn't responding (502 at workflow.meridian-saas.local)

The tunnel restarts itself; **the service does not**. A 502 means the service is down: webhooks do nothing, and Insights says the workflow is unavailable.

1. On the Mac that hosts it, go to the `liquid-workflow` checkout on `main`.
2. Start it: `NODE_ENV=development npm start` (reads `.env.local`).
3. Check: `curl http://127.0.0.1:4100/health` returns 200, and `/runs` returns **401** (proof the API is still locked down).

## Stop all agent activity now

Set `WORKFLOW_ENABLED=false` in the workflow's `.env.local` and restart. Finer switches: `SIGNAL_ENABLED`, `LINEAR_AUTO_ENABLED`, `GITHUB_AUTO_DONE_ENABLED`. `/status` shows their state.

## A ticket moved to Done unexpectedly

A merged PR mentioned it: the GitHub webhook moves the **first** `LIQ-N` it finds in a merged PR's title, description or branch name. Move it back in Linear, and keep unrelated ids out of PR descriptions.

## Insights says "Not set up yet" or every API call returns 503

`LIQUID_INSIGHTS_ACCESS_CODE` or `LIQUID_SESSION_SECRET` is missing in Vercel. Add it and redeploy.

## The Slack bot doesn't reply

1. `http://localhost:5173/api/health` should show `"slack": true`. If it's false, `SLACK_BOT_TOKEN` or `SLACK_SIGNING_SECRET` is missing in Vercel.
2. In the Slack app settings, Event Subscriptions should say **Verified** (click Retry if not).
3. The bot must be invited to the channel (`/invite @Meridian Insights`).
4. Check the Vercel function logs for `slack_signature_rejected` (wrong signing secret) or `slack_post_failed` (missing scope or not in the channel).

## PostHog shows no events from Core or Reporting

Check `before_send` / `prepareEvent` still keeps `token` and `distinct_id`; stripping them silently drops every event. Check `VITE_POSTHOG_PROJECT_TOKEN` and the host at build time.
