# Signals loop — Sprint 1: Signals in (capture + grouping, internal)

**Status:** ⬜ not started

> Amended 2026-07-26 (see the epic README). Story 1.0 is new: the shared surface, built first and by
> the architect, because every later branch inherits it. Story 1.3's evaluation model changed from
> an implied sweep to lazy project-scoped evaluation (Amendment 3).

## Stories

### Story 1.0 — The shared surface (architect-owned, built first)
**As the** team, **I want** the flags, migrations and pure logic seams that every later story
imports landed *first and in one commit*, **so that** parallel story branches inherit a stable
foundation instead of conflicting over it.
**Ships:** `SIGNALS_ENABLED` + `CONNECTOR_WRITES_ENABLED` in `lib/flags.ts` · the `signals` +
`tasks` migration (additive, RLS-on/no-policies, service-role grants) · zero-import pure modules:
`lib/signal-fingerprint.ts`, `lib/signal-scrub.ts`, `lib/friction-rules.ts`, `lib/signal-rank.ts`.
**Acceptance:** both flags read `=== 'true'` and are OFF unset; migration applies clean and is
re-runnable; every pure module is unit-tested directly (no HTTP needed to reach a branch).
**Risk:** **HIGH — migration + shared seam. Architect only, never delegated.**

### Story 1.1 — Error capture through the existing envelope
**As an** app builder, **I want** `captureError` + a global error handler in the SDK — batched,
sampled, payload-capped, **PII/secret-scrubbed at SDK and ingest** — landing as reserved `$error`
events through the existing `/v1/track` envelope (`tags`/`metadata`, `track-schema.ts`), **so
that** error capture is a one-line add and needs no schema migration.
**Acceptance:** a thrown error in a demo app → event row with fingerprint fields; malformed/
oversized payload → 4xx; scrub verified against a seeded secret-shaped payload; a real foreign
tenant key cannot read it. Specs fire through the normal SDK path **untagged** (no experiment/
feature convenience-tagging — S4 realistic-input lesson).
**The scrub is authoritative at INGEST, not at the SDK.** The SDK scrub is a courtesy that reduces
what crosses the wire; the server never trusts it, because the server cannot tell a scrubbed
payload from one sent by a hand-rolled client. Both call the same pure module.
**Risk:** LOW (the scrub module itself landed in 1.0 as HIGH)

### Story 1.2 — Deterministic grouping into signals
**As the** engine, **I want** `$error` events grouped deterministically into `signals` rows —
fingerprint on message + stack-frame + feature; first/last seen, event count, users affected —
with an impact rank (users × frequency, the language PostHog speaks), **so that** a thousand
repeats read as one problem.
**Counters are updated atomically in Postgres** (`INSERT … ON CONFLICT DO UPDATE SET
event_count = signals.event_count + 1`), never read-modify-write from Node. The
event-destination-router epic spent 24 review rounds on exactly this class of bug; the fix is to
not write the class of code.
**The fingerprint is computed server-side and never trusted from the payload** — a tenant may send
whatever tags they like, and the engine still decides what is one problem.
**Acceptance:** same error twice → one signal with count 2; distinct stacks → distinct signals;
rerun over the same inputs ⇒ identical grouping; concurrent ingest of the same fingerprint ⇒ count
equals the number of events, with no lost update.
**Risk:** MEDIUM (concurrency) — architect-owned.

### Story 1.3 — Derived friction detectors (rules as data, lazily evaluated)
**As a** PM, **I want** friction detectors — rules declared as **data** over existing funnel
aggregates (`tars-query.ts`): adoption drop-off, dead-end, abandoned-adoption — emitting
`$friction` signals with conservative default thresholds, **so that** friction detection needs
zero new client code and can be tuned without deploys.
**Evaluation is lazy and project-scoped** (Amendment 3): `evaluateFrictionForProject(projectId)`
runs from the already-tenant-scoped read paths, behind a Postgres advisory lock and a
`friction_evaluated_at` throttle. **No cron, no cross-tenant read, no new AGENTS.md exemption.**
**Acceptance:** a seeded funnel fixture produces the expected friction signal; changing a
threshold (data, not code) changes the output; deterministic on rerun; a second concurrent
evaluation of the same project is a no-op rather than a duplicate; evaluation inside the throttle
window does no work.
**Risk:** MEDIUM (locking) — architect-owned.

## Sprint QA
- **api spec(s):** 1.0 → flag dark-default + pure-module branch tests · 1.1 → ingest validation 4xx
  + scrub assertion (server-side, with a hand-rolled unscrubbed payload) + foreign-tenant 403 with a
  **real** foreign key · 1.2 → fingerprint/grouping determinism + concurrent-ingest counter
  integrity · 1.3 → friction-rule determinism on a fixture + throttle/lock no-op
- **browser smoke owed:** no (API-level; dashboard views land in Sprint 2)
- **deterministic gate:** `npm run typecheck` (four projects — NOT `tsc -p apps/web`, which is a
  subset) + `npm run lint` + `npm run build` + `npm run test:unit` + Playwright `api` green before merge
- **mutation check:** every scrub and tenancy spec is broken deliberately once and observed red,
  then reverted and the tree re-diffed clean (LEARNINGS: a half-applied mutation is the worst case)

## Known gap carried into Sprint 2 (cross-review, Codex round 2 — 2026-07-26)

**`evaluateFrictionForProject()` has no production caller yet.** Story 1.3's design (Amendment 3) is
that friction evaluates lazily *from the tenant-scoped read paths* — and those read paths are the
dashboard (Story 2.2) and `list_tasks` (Story 2.3). Sprint 1 ships no read surface, so the function
is reachable only from its spec.

This is stated here rather than left to look finished, because it is exactly the failure
`Roadmap/LEARNINGS.md` records from pod-report Sprint 2: *"a module the doc said was built had ZERO
callers"*, found by one grep after the sprint was declared done.

**What IS proven, and what is not — precisely:**

| Layer | Status |
|---|---|
| Rule evaluation (`lib/friction-rules.ts`) — thresholds, `minSample` floors, rule exclusivity, determinism, rules-as-data | ✅ unit-tested directly, 13 specs |
| The SQL half — `claim_friction_evaluation` grants one winner per window, `record_signal` groups and denies `anon` at function level | ✅ verified against a real Postgres |
| The TypeScript orchestration in `evaluateFrictionForProject()` — loading rules, calling the TARS seam, writing `$friction` rows | ❌ **UNPROVEN** |

An earlier attempt to close that last row with an e2e spec was **deleted rather than kept**:
`friction-eval.ts` imports `server-only` (correctly — it uses the service-role client), so a
Playwright spec cannot import it, and there is no HTTP surface to reach it through until Sprint 2.
Every other lib module the e2e suite imports is a pure, zero-framework file; there is no precedent
for reaching a `server-only` one, and manufacturing an exception would have weakened a real guard to
produce a proof. Writing "exercised end-to-end" when it is not is the precise failure LEARNINGS
calls *"a comment asserting a check the code does not actually perform"*.

**Story 2.3 owes the caller AND this proof**, and its acceptance criterion names both.

## Sprint 1 — Smoke walkthrough (do these in order)
_Written at sprint close (real URLs, one action + one expected result per step). Owed per Stage 8b:
throw a real error in the demo app → watch the signal appear (**owed to Daniel by name**)._
