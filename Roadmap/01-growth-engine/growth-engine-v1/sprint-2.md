# Growth Engine v1 — Sprint 2: TARS funnel v1

**Status:** 🚧 in progress

## Stories

### Story 2.1 — Feature registry seeded from live `platform_flags` rows ✅
**As a** builder, **I want** a feature registry (key · target rule · retention window) seeded by the
**client pushing** its live `platform_flags` rows (SDK `syncFeatures()`, or a one-command seed run
from Miyagi), **so that** the Targeted denominator reflects real production flag state, never
`lib/flags.ts` code defaults (code defaults are fail-safe fallbacks and systematically say OFF).
**Acceptance:** running the seed/sync from Miyagi populates the registry with live rows; a
stale/never-synced registry is visibly stale (timestamped), not silently wrong. Registry sync stays
a command, not a product surface.
**Implementation:** `apps/web/supabase/migrations/20260715090000_feature_registry.sql` (`features`
table: `key`, `enabled`, optional `target_event`/`adopted_event`/`retained_event`, `retention_days`,
`synced_at`) + `lib/feature-schema.ts` (zod) + `app/api/v1/features/sync/route.ts` (same Bearer-key →
project_id auth as `/v1/track`; upserts on `(project_id, key)`, always bumping `synced_at`) +
`packages/sdk/src/index.ts` (`syncFeatures()`) + `scripts/lib/feature-sync-payload.mjs` (pure mapping,
unit-tested) + `scripts/sync-features-from-miyagi.mjs` (the one-command seed run — reads Miyagi's live
`platform_flags`, pushes via the SDK's wire shape; `isMain`-guarded). `platform_flags` rows carry no
event-name mapping, so `target_event`/`adopted_event`/`retained_event` are optional in the sync
payload — set explicitly for the known `setup_guide` feature (mapped from
`growth.telemetry_enabled`'s live value), falling back to Story 2.2's honest "any event" reading for
anything else.
**Risk:** LOW

### Story 2.2 — TARS aggregation ✅
**As a** PM, **I want** Targeted (registry-declared) / Adopted (first event) / Retained (repeat
event inside the feature's retention window) computed from Sprint 1's event stream, **so that**
funnel numbers are trustworthy.
**Acceptance:** a synthetic event sequence produces the expected Targeted/Adopted/Retained counts.
Funnel numbers are labeled **registry-declared**, not gateway-observed — v1's honest boundary (flags
are served by Miyagi, not this engine), noted so the funnel isn't oversold.
**Implementation:** `lib/tars.ts` — pure `computeTars(events, feature)`. Targeted = 0 whenever the
registry declares the feature disabled (the "registry-declared" gate), else distinct users on
`target_event` (fallback: any event). Adopted = distinct users on `adopted_event` (fallback: any
event — the literal "first event" reading). Retained = the subset of Adopted with a qualifying
repeat event (`retained_event`, fallback: any second distinct event) within `retention_days` of their
earliest event. Proven via `apps/web/e2e/tars.spec.ts` against a synthetic `setup_guide`-shaped fixture
(4 users: fully retained, adopted-not-retained, targeted-not-adopted, retained-just-outside-window) —
observed **red** on a deliberate mutation (dropping the retention-window bound) before being fixed
green.
**Risk:** LOW

### Story 2.3 — Funnel page for the S1.3 feature
**As a** PM, **I want** a funnel page rendering Targeted/Adopted/Retained for the feature
instrumented in Sprint 1, **so that** the first real funnel is visible from live traffic.
**Acceptance:** with `growth.telemetry_enabled` ON and real Miyagi traffic flowing, the funnel page
shows non-zero, correct-looking TARS numbers for the S1.3 feature. This is one of the epic's
headline acceptance checks (Decision 2 of the scope doc).
**Risk:** LOW

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 2.1 (sync populates the registry),
  2.2 (aggregation math against a fixture event stream), 2.3 (funnel endpoint/page returns the
  expected shape).
- **browser smoke owed:** **yes, to Daniel by name** — the funnel-renders-real-data smoke (open the
  funnel page, confirm it reflects live Miyagi traffic for the S1.3 feature).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
_TBD — write this section before sprint close, per the epic Definition of Done. Must include the
funnel-renders-real-data smoke (owed to Daniel by name) as numbered, real-URL steps._

If any step fails, note the step number + what you saw — that's the bug report.
