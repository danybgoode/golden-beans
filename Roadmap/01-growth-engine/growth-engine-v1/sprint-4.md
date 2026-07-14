# Growth Engine v1 — Sprint 4: A/B v1

**Status:** ⬜ not started

## Stories

### Story 4.1 — Deterministic client-side hash bucketing
**As an** app builder, **I want** the SDK to deterministically bucket a user into a variant (same
user → same variant), computed **client-side, with no lookup and no resolve endpoint**, **so that**
experiment assignment works without standing up a flag-serving gateway. This is experiment
assignment, not flag serving — Decision 1 (telemetry-first) stands; on/off gating stays with the
client's own flags (`isEnabled()`).
**Acceptance:** the same `userId` + experiment key always resolves to the same variant across
repeated calls.
**Risk:** LOW

### Story 4.2 — Exposure events
**As a** PM, **I want** an exposure event fired when a user is bucketed, **so that** variant
comparison has a denominator.
**Acceptance:** bucketing a user fires an exposure event, queryable alongside Sprint 1's event
stream.
**Risk:** LOW

### Story 4.3 — Side-by-side variant comparison (basic lift)
**As a** PM, **I want** a side-by-side view comparing variants on a chosen metric, **so that** I can
eyeball an experiment's effect.
**Acceptance:** the view shows basic lift (no statistical-significance engine — that's a later
epic) for a real or fixture experiment. Variant resolution returns the Sprint 1.2 payload envelope;
targeting rules are stored as data (cohort %, region — telemetry/GeoIP properties only, never
Medusa's `Region` currency/tax concept), so v2 chaos scenarios can reuse the same shape.
**Risk:** LOW

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 4.1 (determinism), 4.2 (exposure
  event fires), 4.3 (comparison view/endpoint).
- **browser smoke owed:** no money/auth step here — confirm at build time.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 4 — Smoke walkthrough (do these in order)
_TBD — write this section before sprint close, per the epic Definition of Done._

If any step fails, note the step number + what you saw — that's the bug report.
