# Growth Engine v1 — Sprint 3: North Star engine v1

**Status:** ⬜ not started

## Stories

### Story 3.1 — North Star metric + leading-inputs data model
**As a** PM, **I want** a North Star metric defined with its leading inputs modeled, **so that**
feature impact has a place to roll up to.
**Acceptance:** the metric + at least one leading input are defined and queryable.
**Risk:** LOW

### Story 3.2 — Feature → input linkage
**As a** PM, **I want** features linked to the North Star inputs they're expected to move, **so
that** the per-feature report (3.3) has something to report against.
**Acceptance:** the S1.3 feature is linked to at least one input.
**Risk:** LOW

### Story 3.3 — Per-feature input-impact report over time
**As a** PM, **I want** a report showing a feature's linked-input movement over time, **so that** I
can see whether shipping the feature moved the number.
**Acceptance:** the report renders a time series for the S1.3 feature's linked input.
**Commerce-truth boundary:** any revenue/order input for Miyagi reads Medusa-owned order/payment
surfaces directly — golden-beans stores attribution telemetry + derived reports only, never a
commerce replica.
**Risk:** LOW

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 3.1 (metric/input CRUD), 3.2
  (linkage), 3.3 (report endpoint against a fixture).
- **browser smoke owed:** no money/auth step here (read-only reporting) — confirm at build time.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)
_TBD — write this section before sprint close, per the epic Definition of Done._

If any step fails, note the step number + what you saw — that's the bug report.
