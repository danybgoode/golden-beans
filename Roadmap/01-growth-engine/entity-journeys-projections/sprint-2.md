# Entity journeys — Sprint 2: Cohort, aging and trustworthy operating reads

**Status:** ⬜ not started

## Stories

### Story 2.1 — Cohort conversion, aging and drop-off

**As an** activation lead, **I want** stage conversion, aging and drop-off for a cohort, **so that** I can see
where a lifecycle stalls and which subjects need attention elsewhere.

**Acceptance:** one resolver returns stage counts/conversion, median/p90 age, missing-next-stage and configured
retention; cohort/window/timezone and definition version are explicit; every count drills to bounded opaque
subject ids; late events repair results; zero subjects, no qualifying events, stale source and query failure are
distinct; source timing and relevant-event count are recorded without subject data.

**Risk:** low — read-only aggregation over existing events.

### Story 2.2 — UI, API and MCP read parity

**As an** authorized teammate or agent, **I want** the same journey reads through every operating channel, **so
that** decisions do not depend on scraping or reconciling different calculations.

**Acceptance:** the project/journey page, API and read-only MCP tools share one resolver/version;
members see only their projects; MCP retains `CONNECTOR_ENABLED` and revocable-token gates; foreign/public reads
fail; responses paginate and exclude PII; legacy TARS and existing connector tools remain compatible.

**Risk:** high — membership and connector-token authorization boundary; Daniel merges.

## Sprint QA

- **pure/api specs:** aggregate fixtures for narrowing stages, age percentiles, retention, late-event repair,
  zero-vs-broken and definition-version mismatch.
- **parity specs:** identical UI/API/MCP fixture output; connector OFF, revoked token, two-project isolation,
  pagination and PII allowlist.
- **browser smoke owed:** yes, to Daniel — authenticated cohort page plus live MCP read using a disposable token.
- **deterministic gate:** typecheck + build + API/MCP suite green; one real non-zero cohort renders.

## Sprint 2 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app

1. Sign in and open
   https://golden-beans-gamma.vercel.app/app/journeys/miyagisanchez/merchant-activation.
   → Stage counts, conversion, aging, definition version and source freshness render for the smoke cohort.
2. Select one stage count.
   → Its paginated opaque subject ids exactly explain the total.
3. Deliver one late higher-stage event and refresh.
   → The subject and aggregate repair without manual projection work.
4. Query the same cohort through the API and authorized MCP connector.
   → Values/version agree across all three channels and contain no contact data.
5. Revoke the token and try another project's journey.
   → Both reads fail while the signed-in owner's own UI remains available.

If any step fails, note the step number + URL/tool response — that's the bug report.
