---
status: shipped
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
  both delivery steps. A failed resolve suppresses both payloads rather than emitting empty facts.
- A product report counts as delivered only when every configured destination accepts it. The local
  mainline baseline never advances past a failed Slack or Telegram post. Slack becomes configured
  for that local rail only when its webhook exists in the ignored root `.env.local`.

## Sprint

See [sprint-1.md](sprint-1.md).

## Shipped

Sprint 1 shipped in Golden Beans PR [#51](https://github.com/danybgoode/golden-beans/pull/51)
on 2026-07-28. It added Slack delivery for the mechanical push/deploy rail and the local reviewed
prose rail, with shared bounded text handling, plain-text webhook verdicts, and retry-safe
per-destination delivery state. The remaining live-channel configuration check is an operating
follow-up, not unshipped product scope.
