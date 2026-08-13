# Scenarios made PM-operable — define, launch, and kill a scenario from the UI — Retrospective

_Shipped dark: 2026-08-13 · PR #98 · `5bca24c`_

## What shipped

- Sprint 1 replaced the six-table scenarios screen with the shared product shell and gave owners a
  closed-choice definition flow over existing immutable fault-flag versions. Target verification is
  visible, external cohorts are excluded, and the same server-side parser remains authoritative.
- Sprint 2 added owner launch, retry, stop, and target revoke controls through service-role-only,
  project-scoped RPC facades. A human stop remains a scenario lifecycle transition, not a breaker
  trip, and legacy running rows can still be stopped when disclosure metadata is unavailable.
- Sprint 3 made control and treatment evidence legible side by side, kept blockers and cohort
  qualifications at the same visual weight as the numbers, and linked runs to their immutable
  experiment and definition evidence. The table is the deliberate fallback while #14 remains open.
- The additive migration landed before the application. `SCENARIO_AUTHORING_ENABLED` exists as
  `false` in Development, Preview, and Production, so the shipped production surface remains
  read-only until the named synthetic exercise is completed.

## What went well

- Architecture lock found the consequential boundary before code: an API-key command cannot be
  relabelled as an owner-session command without falsifying attribution. The approved facade shares
  the transactional cores and re-proves tenant ownership at the database.
- The feature reused the scenario, flag, impact, experiment, and breaker primitives already in the
  engine. No second control plane, telemetry path, or request-derived project identity appeared.
- Two cross-family review passes plus a fresh context-independent review found real edge cases after
  the basic flow was green: malformed disclosure data, safe stopping of old runs, stale shared auth
  fixtures, and immutable evidence links. The final review and GitHub rail were clean.
- The authenticated browser suite exercised a signed-in launch → running → stop loop and the
  undisclosed legacy stop path. The final rail passed 37 tests with 11 intentional skips.

## What we learned

- A fail-closed eligibility/disclosure read must not also gate the emergency control that makes an
  already-running operation safe. Launch and retry correctly require trusted immutable disclosure;
  stop needs only the minimal project-scoped run identity and lifecycle state.
- Shared authenticated test tenants are shared product state. Adding a fixture for one browser spec
  changes what every other spec sees, so shared smoke expectations must move with the seed or each
  spec must own an isolated tenant.

## Gaps / follow-ups

- `SCENARIO_AUTHORING_ENABLED` remains OFF. Enabling it requires the production walkthrough's
  verified synthetic target, launch, observed running state, confirmed stop, and then a Git-tracked
  redeploy.
- The product owner still owes the named judgment on whether the rendered impact comparison could be
  misread as a causal customer claim. Automated checks pin the labels and caveats, but cannot make
  that product judgment.
- #14 remains the explicit chart-dependency decision. This epic ships the design-system comparison
  table and does not choose or hand-roll a charting runtime.
- The full local API rail saw one repeated-fixture collision in `north-star-sync`; the hermetic
  GitHub static/build and local-Supabase Playwright jobs were green and are authoritative for PR #98.
