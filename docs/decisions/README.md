# Decision records

Why Meridian Insights works the way it does. Each record gives the context, the decision, its costs, and the alternatives we didn't take. Insights reads these to answer "why did we…" questions, so when a decision changes, add a new record that supersedes the old one.

| # | Decision | Status |
| --- | --- | --- |
| [0001](0001-server-side-retrieval-grok-writes.md) | The server retrieves; Grok only writes up | Accepted |
| [0002](0002-enforced-citations-and-server-counts.md) | Every claim cited; numbers come from the server | Accepted |
| [0003](0003-confirm-gated-actions.md) | Actions are rule-detected and confirm-gated with signed 5-minute tokens | Accepted |
| [0004](0004-access-code-and-bff-secrets.md) | Access code + HttpOnly session; every secret stays in the BFF | Accepted (revisit for SSO) |
| [0005](0005-categories-only-question-log.md) | The question log records categories, never text | Accepted |
| [0006](0006-slack-same-pipeline.md) | Slack uses the same pipeline, verified by signature, approvers allowlisted | Accepted |
| [0007](0007-streaming-ndjson.md) | Answers stream as NDJSON; citations appear only after validation | Accepted |
| [0008](0008-web-and-slack-parity.md) | Every capability ships to web and Slack | Accepted |
