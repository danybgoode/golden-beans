# Entity journeys — Sprint 3: Miyagi founding-merchant proof and scale decision

**Status:** 🟨 in progress

## Stories

### ✅ Story 3.1 — Miyagi 13-stage founding-merchant proof

**As Miyagi's** activation team, **I want** its activation lifecycle represented as a Golden Beans journey, **so
that** the scorecard consumes reusable analytics while Miyagi keeps merchant work records and Medusa facts.

**Acceptance:** one versioned definition covers scouted through retained-at-30-days; opaque merchant fixtures
reach permission, preview, claim, payments, three-products, share, inquiry, sale and retention from the event
router contract; replay/out-of-order delivery is stable; no name, phone, email, notes, consent body or copied
commerce state enters Golden Beans; both repos share the same contract fixture.

**Risk:** high — cross-repo identity/event contract and real tenant smoke; Daniel merges both PRs.

**Build contract:** the byte-identical canonical fixture is
`apps/web/e2e/_fixtures/merchant-lifecycle.fixtures.json`, pinned to the same SHA-256 as Miyagi's
`e2e/_fixtures/merchant-lifecycle.fixtures.json`. The journey is the 13 `merchant.<stage>` events;
the separate `merchant.preview_approved` delivery signal remains valid but is not a fourteenth analytical stage.
The definition is import-free application data in `lib/founding-merchant-journey.ts`, with no tag predicates or
place to carry merchant PII/CRM/commerce state.

**Implementation status:** Golden Beans now holds the canonical JSON fixture at the exact same
`b53f300b…f3671` digest pinned by Miyagi's active Sprint 3 branch. The valid versionable definition consumes the
13 lifecycle stage events and explicitly leaves `merchant.preview_approved` as the independent fourteenth
delivery signal. Pure proof reverses receipt order, replays canonical ids, and still reaches all 13 stages in
definition order with exact boundary retention. The serialized fixture/definition is structurally checked for
merchant PII and copied workflow/Medusa identifiers.

### ✅ Story 3.2 — Query-time scale decision from measured evidence

**As a** platform owner, **I want** evidence for or against materialization, **so that** Golden Beans adds
projection infrastructure only after the simple architecture stops serving real use.

**Acceptance:** production-safe p50/p95 query timing and relevant-event counts are visible per journey without
subject data; thresholds are p95 >2s or >1M relevant events per project/journey scan; the epic closes with an
evidence-backed keep-query-time decision or a separate materialization scope seed—never hidden work in this epic.

**Risk:** low — bounded operational telemetry and documentation.

**Build contract:** every successful subject/cohort resolver records only project, journey/version, query kind,
duration and relevant-event count through a service-role-only RPC. Each series retains its latest 100 samples
and returns p50/p95 plus the strict `p95 > 2,000 ms` / `max relevant events > 1,000,000` decision. Telemetry
failure never breaks the analytical read and is reported as unavailable; no subject id, tags or result payload
may enter the observation table.

**Implementation status:** migration `20260730100000_journey_query_telemetry.sql` adds a no-policy RLS table
with no subject-shaped columns and a service-role-only transactional RPC. A per-series advisory lock keeps the
latest-sample cap exact under concurrent serverless requests. Subject and cohort queries record their own
duration/relevant count after evaluation, then expose bounded samples, p50, p95, maximum relevant-event count,
thresholds and the descriptive keep/materialize signal through the existing API/UI/MCP result. Instrumentation
errors degrade to `telemetry_unavailable` without changing the valid analytical answer.

## Sprint QA

- **contract specs:** identical 13-stage fixtures in Golden Beans and Miyagi, including duplicates, late events,
  definition version and PII allowlist.
- **scale specs:** bounded timing/count telemetry, no subject identifiers, threshold-boundary behavior.
- **browser smoke owed:** yes, to Daniel — authenticated production Miyagi merchant lifecycle + Golden Beans
  journey/scorecard comparison.
- **deterministic gate:** both repos' typecheck/build/API suites green before merge.

**Local evidence:** clean local migration reset through `20260730100000`; 16/16 definition/fixture/telemetry
property specs passed, including function-level anonymous denial, cross-project version refusal, direct
service-role table denial, exact percentile values, exact 100-row cap and schema redaction. Existing
subject/cohort/API/MCP suites passed 12/12 with telemetry assertions; typecheck and production build are green.
Production query evidence and the authenticated rendered comparison remain owed until the gate-on deployment.

## Sprint 3 — Smoke walkthrough (do these in order)

Env: https://golden-beans-gamma.vercel.app + https://miyagisanchez.com

1. Create the documented disposable Miyagi merchant and send the 13-stage fixture through normal SDK/router paths.
   → Golden Beans receives only opaque subject and lifecycle facts.
2. Open the merchant in Miyagi and its journey in Golden Beans.
   → Current stage/history agree while contact/tasks remain only in Miyagi.
3. Replay and shuffle the fixture.
   → Both systems still show one logical lifecycle with identical stage timestamps.
4. Inspect the Golden Beans subject, MCP and query-telemetry outputs.
   → No PII appears; query timing/counts contain no subject identifiers.
5. Compare production evidence to the p95/1M tripwires and record the close-out decision.
   → Query-time remains, or a separate materialization seed exists with measured justification.

If any step fails, note the step number + event/subject id — that's the bug report.
