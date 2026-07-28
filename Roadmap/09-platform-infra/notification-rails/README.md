---
status: in-progress
slug: notification-rails
---

# Epic: Notification rails — Telegram and Slack in lockstep

> **Area:** 09-platform-infra · **Risk:** medium

## Why

Golden Beans already reports mechanical push/deploy facts and locally drafted product prose to
Telegram. The same audiences now work in Slack. This epic adds Slack as a peer destination while
preserving one resolved event, one reviewed prose report, explicit delivery verdicts, and retry-safe
state.

## Decisions

- Mechanical CI/CD messages use a channel-scoped Incoming Webhook. A bot token, channel id, and
  workspace-wide posting scope buy nothing while the destination is fixed.
- Slack webhook responses are plain text (`ok` or an error token), not Telegram-shaped JSON.
- Shared truncation operates on raw text before platform escaping. Platform limits remain separate.
- Deploy metadata is resolved once in a dedicated workflow step and exported via `$GITHUB_ENV` for
  both delivery steps.
- A product report counts as delivered only when every configured destination accepts it. The local
  mainline baseline never advances past a failed Slack or Telegram post.

## Sprint

See [sprint-1.md](sprint-1.md).

