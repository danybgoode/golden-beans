# Entity journeys — Sprint 2: Cohort, aging and trustworthy operating reads

**Status:** ✅ complete — merged in PR #18 at `5005044`; migration aligned and production OFF smoke complete

## Stories

### ✅ Story 2.1 — Cohort conversion, aging and drop-off

**As an** activation lead, **I want** stage conversion, aging and drop-off for a cohort, **so that** I can see
where a lifecycle stalls and which subjects need attention elsewhere.

**Acceptance:** one resolver returns stage counts/conversion, median/p90 age, missing-next-stage and configured
retention; cohort/window/timezone and definition version are explicit; every count drills to bounded opaque
subject ids; late events repair results; zero subjects, no qualifying events, stale source and query failure are
distinct; source timing and relevant-event count are recorded without subject data.

**Risk:** low — read-only aggregation over existing events.

**Implementation status:** the shared resolver evaluates an explicit immutable definition version over an
inclusive/exclusive `[from,to)` **cohort-entry** window and a non-future `asOf` observation snapshot (captured
by the server when omitted, returned, then replayed for cursor pages). The IANA timezone is display/context only;
window semantics come from the offset-bearing instants. A configured stage-1 entry selects the cohort; without
one, first qualifying fact time does. Each stage reports two unmistakably different facts: **actual
satisfaction** from history (the conversion numerator), and positional **at or beyond** occupancy from the
highest independently satisfied stage. A jump can affect occupancy without fabricating a missing history event.
Continuation conversion is the actual intersection with the previous stage, so it cannot exceed 100%.
Current-stage median/p90 age, missing-next-stage, and eligible/matured/met/missed/pending retention use exact
microsecond deadlines; retention rate is met ÷ matured, never met ÷ eligible while outcomes remain pending.
Every count drills through a query-bound keyset cursor to opaque ids (25 by default, 100 maximum).

The DB snapshot projects only the five allow-listed bounded scalar tag fields—never the caller's open-ended tag
object—and fails closed beyond 50,000 candidate facts, 10,000 subjects or 32 MiB. These are per-request raw
payload safety caps, distinct from Sprint 3's **>1M scanned relevant events** materialization tripwire. Because
the current-stage answer can depend on older facts, narrowing only the entry window is not promised as recovery;
the honest remedy is reduce matching history/split the definition or groom materialization. Late receipts up to
`asOf` repair a fixed cohort. Population (`no qualifying events` / `zero subjects` / `nonzero`) and freshness
(`unknown` / `fresh` / `stale`) are independent, so zero and stale render together; resource-limit and
query-failure paths remain separate.

### ✅ Story 2.2 — UI, API and MCP read parity

**As an** authorized teammate or agent, **I want** the same journey reads through every operating channel, **so
that** decisions do not depend on scraping or reconciling different calculations.

**Acceptance:** the project/journey page, API and read-only MCP tools share one resolver/version;
members see only their projects; MCP retains `CONNECTOR_ENABLED` and revocable-token gates; foreign/public reads
fail; responses paginate and exclude PII; legacy TARS and existing connector tools remain compatible.

**Risk:** high — membership and connector-token authorization boundary; Daniel merges.

**Implementation status:** `getJourneyCohortByProjectId()` is the single project-scoped/version-explicit
resolver used by the Bearer-authenticated cohort API, signed-in member page and `get_journey_cohort` MCP tool.
The API key, membership and connector token each resolve the project server-side; no surface accepts a project
id. The MCP tool appears only when both the existing connector route gate and journey enablement gate pass,
and token revocation remains immediate. Existing TARS/North Star/experiment tools are unchanged. Responses
contain aggregates, bounded query diagnostics and selected opaque subject ids only—never tags or contact data.
Query-bound keyset cursors retain their definition version, window, as-of and bucket identity, so late insertion
before a page boundary cannot create offset duplicates/skips.

## Sprint QA

- **pure/api specs:** aggregate fixtures for narrowing stages, age percentiles, retention, late-event repair,
  zero-vs-broken and definition-version mismatch.
- **parity specs:** identical UI/API/MCP fixture output; connector OFF, revoked token, two-project isolation,
  pagination and PII allowlist.
- **browser smoke owed:** yes, to Daniel — authenticated cohort page plus live MCP read using a disposable token.
- **deterministic gate:** typecheck + build + API/MCP suite green; one real non-zero cohort renders.

**Evidence:** clean migration reset; focused pure/resource/index/function suite 6/6 green, including exact
50,000-fact success, 32-MiB failure, 50,001-fact failure and function-level anonymous denial; revised two-project
Bearer/MCP parity 1/1 green; typecheck and production build green. Exact sensitive tag values are seeded and
proven absent from both API and MCP output. Mutation checks proved positional at-or-beyond and inclusive
retention-boundary assertions fail when their exact evaluator comparisons are broken. The authenticated rendered
page smoke remains owed to Daniel. Exact-head Agy and Devin reviews returned clean, GitHub's build and isolated
local-Supabase Playwright jobs passed, migration `20260729100000_journey_cohort_snapshot.sql` is aligned in
production, and deployment `5575079705` reports success for merge SHA `5005044`. With the gate still OFF, the
production cohort API and journey page return 404 while `/llms.txt` and the legacy public experiment comparison
return 200.

## Sprint 2 — Smoke walkthrough (do these in order)

Env: production · https://golden-beans-gamma.vercel.app

1. Sign in and open
   https://golden-beans-gamma.vercel.app/app/journeys/miyagisanchez/merchant_activation.
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
