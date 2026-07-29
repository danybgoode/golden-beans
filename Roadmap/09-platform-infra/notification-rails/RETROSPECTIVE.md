# Retrospective — Notification rails

**Shipped:** 2026-07-28 · **Golden Beans PR:** [#51](https://github.com/danybgoode/golden-beans/pull/51)

## What shipped

Slack became a peer destination for mechanical deployment facts and locally reviewed merge prose.
The rail resolves facts once, uses shared bounded text behavior, treats Slack's plain-text webhook
response as its real contract, and advances its retry checkpoint only after every configured
destination accepts the same message.

## What went well

- Shared formatting and per-destination verdicts prevent Telegram and Slack from drifting.
- Tests cover the response contract, escaping, truncation, workflow handoff, and partial-delivery
  retry behavior.

## Remaining follow-up

Run one real configured Slack-channel acceptance check as an operator action; its secrets and
destination are deliberately outside the repository.

## Durable learning

The relevant durable rule is already captured in `Roadmap/LEARNINGS.md`: resolve reviewed prose
once, then require an explicit success checkpoint for each configured destination.
