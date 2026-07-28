# Sprint 1 — Slack parity

**Status:** 🟨 In progress

## Story 1.1 — Mechanical CI/CD pings

> **As an** operator, **I want** push and production-deploy results in Slack, **so that** the channel
> has the same deployment facts as Telegram.

**Acceptance:** Both events post tested, bounded Slack payloads; absent secrets skip cleanly;
rejected webhooks turn the observer workflow red; push/deploy filters and resolved values cannot
drift between channels.

## Story 1.2 — Product prose reports

> **As a** product stakeholder, **I want** the reviewed merge report in Slack too, **so that** the
> product meaning accompanies the mechanical deployment facts.

**Acceptance:** `commit-report --post` sends the same prose to every configured channel, records
plain-text Slack failures, and returns failure unless all configured destinations accept the report.
The exactly-once runner therefore retries partial delivery instead of silently advancing.

## Story 1.3 — Regression and operating notes

> **As a** future maintainer, **I want** the escaping, response, credential, and state semantics
> pinned, **so that** adding another channel does not rediscover this rail’s failures.

**Acceptance:** Slack mirrors Telegram’s convergence and delivery tests; shared text behavior has
one implementation; workflow handoff has a structural test; the roadmap and ways-of-working name
both destinations and the live channel check still owed after merge.

