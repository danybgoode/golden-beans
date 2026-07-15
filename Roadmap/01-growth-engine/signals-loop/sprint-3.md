# Signals loop — Sprint 3: The closed loop (writes + flip)

**Status:** ⬜ not started

## Stories

### Story 3.1 — Staged write tools (the connector's first public mutation path)
**As a** PM's agent, **I want** staged write tools — claim/resolve/dismiss via
**propose→confirm→apply** (mb `catalog-management` lift: propose returns a preview + confirmation
token; nothing mutates without apply) — dark behind `CONNECTOR_WRITES_ENABLED`, on write-scoped
credentials (E2 `api_keys`, or the additive scope column on E1 tokens if E2 slipped), fully
audited, **so that** the loop actually closes in my agent, not in a dashboard click.
**Acceptance:** propose-without-apply mutates nothing; gate OFF → write tools absent; unscoped or
revoked key → 401/403; every apply → an audit row. Connector manifest describes the write tools
accurately (Rule-3 honesty, SCOPE.md panel adjudication #4).
**Risk:** **HIGH — Daniel merges** (first public write surface + credential scope)

### Story 3.2 — Landing §4 backfill + the dogfood loop
**As the** landing, **I want** §4 flipped teaser → live inverted-loop section (side-by-side with
the integrated-AI alternative, via the section↔epic registry) and the dogfood loop running — gb's
own errors → tasks → our agent fixes, loop events tracked in the engine itself, **so that** we
demo what we run. Re-verify PostHog Code's shipped state first so the comparison copy stays
checkable.
**Acceptance:** §4 renders real task output through the registry; one real gb task shows the full
lifecycle in gb's own funnel.
**Risk:** LOW

### Story 3.3 — Launch (flip + full-loop smoke)
**As** Daniel, **I want** the launch: flip `CONNECTOR_WRITES_ENABLED`, run the loop end-to-end in
a fresh session — a customer's-own-agent-shaped session pulls a real task, claims via
propose→confirm→apply, resolves — then revoke-confirm-dead, then announce, **so that** the
differentiator demo is real before anyone hears about it.
**Acceptance:** flip recorded; one real task resolved by the external-shaped agent session;
revocation verified live.
**Risk:** **HIGH — Daniel flips/merges**

## Sprint QA
- **api spec(s):** 3.1 → propose-without-apply no-mutation · gate-OFF → tools absent ·
  revoked/unscoped key 401/403 · audit-row presence · 3.2 → §4 registry render + dogfood events
  present
- **browser smoke owed:** yes — S3 full-loop smoke in a fresh session (pull → claim → confirm →
  resolve → revoke → confirm dead) + the production flip, owed to Daniel by name
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 3 — Smoke walkthrough (do these in order)
_Write the fool-proof numbered walkthrough here at sprint close (real URLs, one action + one
expected result per step)._
