# Signals loop — Sprint 1: Signals in (capture + grouping, internal)

**Status:** ⬜ not started

## Stories

### Story 1.1 — Error capture through the existing envelope
**As an** app builder, **I want** `captureError` + a global error handler in the SDK — batched,
sampled, payload-capped, **PII/secret-scrubbed at SDK and ingest** — landing as reserved `$error`
events through the existing `/v1/track` envelope (`tags`/`metadata`, `track-schema.ts`), **so
that** error capture is a one-line add and needs no schema migration.
**Acceptance:** a thrown error in a demo app → event row with fingerprint fields; malformed/
oversized payload → 4xx; scrub verified against a seeded secret-shaped payload; a real foreign
tenant key cannot read it. Specs fire through the normal SDK path **untagged** (no experiment/
feature convenience-tagging — S4 realistic-input lesson).
**Risk:** LOW

### Story 1.2 — Deterministic grouping into signals
**As the** engine, **I want** `$error` events grouped deterministically into `signals` rows —
fingerprint on message + stack-frame + feature; first/last seen, event count, users affected —
with an impact rank (users × frequency, the language PostHog Code speaks), **so that** a thousand
repeats read as one problem. Additive `signals` migration (RLS-on/no-policies pattern); counters
append-derived, never retro-mutated (mb `profit-analyzer` prior).
**Acceptance:** same error twice → one signal with count 2; distinct stacks → distinct signals;
rerun over the same inputs ⇒ identical grouping.
**Risk:** LOW

### Story 1.3 — Derived friction detectors (rules as data)
**As a** PM, **I want** friction detectors — rules declared as **data** over existing funnel
aggregates (`tars-query.ts`): adoption drop-off, dead-end, abandoned-adoption — emitting
`$friction` signals with conservative default thresholds, **so that** friction detection needs
zero new client code and can be tuned without deploys.
**Acceptance:** a seeded funnel fixture produces the expected friction signal; changing a
threshold (data, not code) changes the output; deterministic on rerun.
**Risk:** LOW

## Sprint QA
- **api spec(s):** 1.1 → ingest validation 4xx + scrub assertion + foreign-tenant 403 (real
  foreign key) · 1.2 → fingerprint/grouping determinism · 1.3 → friction-rule determinism on a
  fixture
- **browser smoke owed:** no (API-level; dashboard views land in Sprint 2)
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge

## Sprint 1 — Smoke walkthrough (do these in order)
_Write the fool-proof numbered walkthrough here at sprint close (real URLs, one action + one
expected result per step). Owed per Stage 8b: throw a real error in the demo app → watch the
signal appear (owed to Daniel by name)._
