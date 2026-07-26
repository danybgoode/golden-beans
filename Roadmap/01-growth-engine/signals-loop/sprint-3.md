# Signals loop — Sprint 3: The closed loop (writes + flip)

**Status:** ⬜ not started

> Amended 2026-07-26 (see the epic README). The credential design changed materially (Amendment 2):
> the connector's plaintext, publicly-displayed URL token may **not** authorize a mutation, so the
> write surface gained its own hashed credential scope — which is now its own story, 3.1. Story 3.3
> absorbs the corrected competitor copy (Amendment 1) and the ladder-evidence addition (4.3).

## Stories

### Story 3.1 — The `agent_write` credential scope
**As** Daniel, **I want** write-capable agent credentials as a third `scope` on the existing
`api_keys` taxonomy — hashed, revocable, expirable, audited, on their own dashboard screen —
**so that** the first public mutation surface is authorized by a secret that has never been printed
on a public page.
**Why this is not the connector token:** `connector_tokens` are stored in plaintext *by design* and
are deliberately re-displayed on `/install`. A URL-borne credential travels through browser history,
`Referer` headers, proxy logs and screenshots — the `report_shares` migration already wrote this
down at length. See Amendment 2.
**Ships:** `scope = 'agent_write'` (+ the CHECK arm, wrapped in `IS TRUE` — a composite CHECK that
evaluates to NULL is a suggestion, not a constraint, per LEARNINGS) · an `active_agent_write_keys`
view with the scope filter welded in, service-role only, mirroring `active_ingest_keys` ·
`lib/agent-write-keys.ts` · a dashboard screen · `agent_write_key_minted` / `agent_write_key_revoked`
audit actions (their own labels — an audit label that can be chosen by picking an endpoint is worse
than no audit log).
**Acceptance:** an `agent_write` key is rejected by `/api/v1/track` (it is not in
`active_ingest_keys`) and an ingest key is rejected by the write tools (it is not in
`active_agent_write_keys`) — **both directions asserted, both mutation-checked**; a revoked key
fails; an expired key fails; minting and revoking each write their own audit row; the DB rejects a
`scope='agent_write'` row with a `share_lens`.
**Risk:** **HIGH — credential surface + migration. Architect only. Daniel merges.**

### Story 3.2 — Staged write tools (the connector's first public mutation path)
**As a** PM's agent, **I want** staged write tools — claim/resolve/dismiss via
**propose→confirm→apply** (propose returns a preview + a single-use confirmation token; nothing
mutates without apply) — dark behind `CONNECTOR_WRITES_ENABLED`, requiring **both** the connector
token and an `agent_write` Bearer key that resolve to the **same** project, fully audited, **so
that** the loop actually closes in my agent, not in a dashboard click.
**Addition (Amendment 4.2):** `resolve` accepts an **evidence pointer** — a commit SHA, PR URL or
note — stored on the task. A resolution with no resolvable pointer is recorded as resolved
*without evidence*, never silently as evidenced (the `pod-report` honesty rule, one layer in).
**Acceptance:** propose-without-apply mutates nothing (asserted by re-reading the row, not by
trusting the response); a confirmation token is single-use, project-bound and expires; gate OFF →
write tools absent from `tools/list`; connector token + ingest key (wrong scope) → refused;
connector token for project A + `agent_write` key for project B → refused; revoked key → refused;
every apply → an audit row. The connector manifest and `/install` describe the write tools
accurately (AGENTS rule #3 honesty).
**Risk:** **HIGH — first public write surface. Architect only. Daniel merges.**

### Story 3.3 — Landing §4 backfill, the dogfood loop, and ladder evidence
**As the** landing, **I want** §4 flipped teaser → live inverted-loop section (side-by-side with the
integrated-AI alternative, via the section↔epic registry) and the dogfood loop running — gb's own
errors → tasks → our agent fixes, loop events tracked in the engine itself — **so that** we demo
what we run.
**Corrected copy (Amendment 1):** PostHog Desktop is **announced, launching Summer 2026** — not
shipped. §4 says so. We do not compare our shipped loop against a competitor's unreleased one and
let the reader assume both exist.
**Addition (Amendment 4.3):** task-lifecycle facts become **ladder evidence** in `pod-report`'s
AI-adoption scoring, so landing §5's step claim is computed from real agent-resolved tasks rather
than asserted. See `references/Steps-of-AI-Adoption.md`.
**Acceptance:** §4 renders real task output through the registry; one real gb task shows the full
lifecycle in gb's own funnel; §5's ladder evidence count changes when a task is resolved by an
agent, and the section still renders its "not measured" list beside it.
**Risk:** LOW — delegable.

### Story 3.4 — Launch (flip + full-loop smoke)
**As** Daniel, **I want** the launch: flip `SIGNALS_ENABLED` then `CONNECTOR_WRITES_ENABLED`, run
the loop end-to-end in a fresh session — a customer's-own-agent-shaped session pulls a real task,
claims via propose→confirm→apply, resolves with an evidence pointer — then revoke-confirm-dead,
**so that** the differentiator demo is real before anyone hears about it.
**Rollout order is part of the design** (LEARNINGS, the router epic): migration → env vars →
commit to `main` (the redeploy that makes them live) → verify by exercising the surface, never by
`vercel env ls`.
**Acceptance:** flip recorded; one real task resolved by the external-shaped agent session;
revocation verified live (the same call 401s after revoke).
**Risk:** **HIGH — Daniel flips/merges**

## Sprint QA
- **api spec(s):** 3.1 → both-directions credential rejection + expiry + audit-label correctness ·
  3.2 → propose-without-apply no-mutation (re-read the row) · single-use/expiring confirmation
  token · gate-OFF → tools absent · wrong-scope, cross-project and revoked key all refused ·
  audit-row presence · 3.3 → §4 registry render + dogfood events present + ladder evidence wired
- **browser smoke owed:** yes — S3 full-loop smoke in a fresh session (pull → claim → confirm →
  resolve → revoke → confirm dead) + the production flip, **owed to Daniel by name**
- **deterministic gate:** `npm run typecheck` + `lint` + `build` + `test:unit` + Playwright `api`
- **review:** HIGH-risk PR → cross-family review is a **floor**, not a ceiling. Agy to clean, then
  Codex on the stabilized head; stop when a round from the *other* family comes back clean

## Sprint 3 — Smoke walkthrough (do these in order)
_Written at sprint close (real URLs, one action + one expected result per step)._
