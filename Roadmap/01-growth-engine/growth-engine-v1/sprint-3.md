# Growth Engine v1 — Sprint 3: North Star engine v1

**Status:** 🚧 merged + deployed 2026-07-16 (PR #3, squash `bd154f1`) — engine confirmed working
against real production data; the real revenue-sync run is owed to Daniel by name (see walkthrough).

## Scope note (revised at kickoff)

The original 3-story slice is split into 4. Story 3.3 grew a real component: Daniel confirmed (at
kickoff) he wants a **real Medusa-backed revenue input this sprint**, not a deferred/telemetry-only
placeholder. Research into `medusa-bonsai` found the exact reuse pattern already established by
Sprint 2's `scripts/sync-features-from-miyagi.mjs` (read Miyagi's live tables directly via its own
Supabase service-role credentials, push a derived value into golden-beans via its own API) — so this
does **not** need a new medusa-bonsai branch/PR. Miyagi's shipped `profit-analyzer` epic already
maintains an append-only `financial_event` ledger (`event_type='revenue'`, `amount_cents`,
`captured_at`) — the real source of truth this sprint reads from, never replicates.

Because this sprint ships **both a DB migration and a money-touching ingest endpoint**, the PR is
declared **HIGH risk** overall (same correction Sprint 1 got once a reviewer caught its migration),
even though most individual stories are LOW-risk-shaped.

## Stories

### Story 3.1 — North Star metric + leading-inputs data model
**As a** PM, **I want** a North Star metric defined with its leading inputs modeled, **so that**
feature impact has a place to roll up to.
**Acceptance:** the metric + at least one leading input are defined and queryable.
**Design:** North Star = `payable_sellers` ("Payable Sellers"). Two inputs modeled from day one:
`setup_guide_shares` (telemetry-native — derived from the already-flowing `setup_guide_share_tapped`
event, no new plumbing) and `attributed_revenue` (external-push — real revenue figures, Story 3.3).
An input's `value_source` (`telemetry_event` | `external_push`) decides how its time series is
resolved later (Story 3.4) — computed on the fly from `events`, or read from a pushed ledger.
**Risk:** LOW

### Story 3.2 — Feature → input linkage
**As a** PM, **I want** features linked to the North Star inputs they're expected to move, **so
that** the per-feature report (3.4) has something to report against.
**Acceptance:** the S1.3 feature (`setup_guide`) is linked to both inputs defined in 3.1.
**Risk:** LOW

### Story 3.3 — Revenue ingest + one-command sync from Miyagi's real ledger
**As a** PM, **I want** `attributed_revenue` backed by Miyagi's real, already-shipped
`financial_event` revenue ledger, **so that** the North Star report reflects real money, not a
fixture.
**Acceptance:** running the sync script pushes a real daily revenue aggregate into golden-beans;
the ingest endpoint rejects pushes to a `telemetry_event`-sourced input (those are computed, never
pushed) and is idempotent on re-run (same day pushed twice → no duplicate).
**Commerce-truth boundary:** the sync script reads Miyagi's `financial_event` table **directly**
(read-only, no mutation, mirroring how Sprint 2's registry sync reads `platform_flags` directly) and
pushes only a **derived daily sum** — golden-beans never stores a copy of Medusa's order/payment
rows, only this attribution rollup.
**Risk:** HIGH — real revenue data; a new ingest endpoint that writes production financial figures;
the live sync run is a real pull from + push to production, confirmed with Daniel before running
(idempotent/append-only makes it safe to re-run, but the first real run is still flagged, not just
executed).

### Story 3.4 — Per-feature input-impact report over time
**As a** PM, **I want** a report showing a feature's linked-input movement over time, **so that** I
can see whether shipping the feature moved the number.
**Acceptance:** the report renders a time series for `setup_guide`'s linked inputs — both
`setup_guide_shares` (from real event data) and `attributed_revenue` (from the real pushed ledger,
once 3.3 has run at least once).
**Risk:** LOW (read-only)

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 3.1
  (`north-star-sync.spec.ts`: sync + list), 3.2 (`feature-input-link.spec.ts`: link/404/idempotent),
  3.3 (`input-values.spec.ts`: push/400-wrong-source/dedupe/tenant isolation, synthetic data — no
  live Miyagi credentials in CI, matching the existing features-sync script precedent), 3.4
  (`impact.spec.ts`: report endpoint + page against a fixture).
- **script unit tests:** `scripts/lib/revenue-sync-payload.test.mjs` (pure aggregation), picked up
  by the existing `scripts-guard.yml` CI gate automatically.
- **browser smoke owed:** no money/auth UI step here (read-only reporting) — confirm at build time.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` + `node --test
  'scripts/lib/*.test.mjs' 'scripts/*.test.mjs'` green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

### Part A — agent-verified 2026-07-16 (production infra, no Miyagi involvement)
1. PR #3 merged to `main` (squash `bd154f1`); migration `20260716100000_north_star.sql` pushed to
   production Supabase (ref `slweidgffcfndnskcskc`); merged code deployed via `vercel --prod` (this
   project has no Git-integration auto-deploy — same manual step as Sprints 1–2).
   → **Confirmed:** `supabase migration list` shows `20260716100000` synced;
   `https://golden-beans-gamma.vercel.app/` → 200.
2. Defined the `payable_sellers` North Star metric + both leading inputs (`setup_guide_shares`,
   `attributed_revenue`) for the real `miyagisanchez` project, and linked `setup_guide` to both — the
   same DB operations `POST /v1/north-star/sync` + `POST /v1/features/setup_guide/link-input`
   perform (done directly via the service-role client; this session has no plaintext `miyagisanchez`
   API key for the HTTP routes, same limitation as Sprints 2–3's other Part A's).
   → **Confirmed:** metric + both inputs created, both linked to `setup_guide`.
3. Queried real `setup_guide` events for `miyagisanchez`: `provisioning_smoke_test` (1),
   `setup_guide_viewed` (3) — no `setup_guide_step_completed`/`setup_guide_share_tapped` yet (matches
   Sprint 2's close — nobody has completed a step or shared since Daniel's initial view).
   → **Confirmed** via direct query.
4. `curl https://golden-beans-gamma.vercel.app/impact/miyagisanchez/setup_guide`.
   → **Confirmed:** renders `Impact — setup_guide (miyagisanchez)`, both `Attributed Revenue`
   (`external_push`) and `Setup Guide Shares` (`telemetry_event`) correctly show **"No data yet"** —
   honest given the real state: no revenue has been pushed, and no `setup_guide_share_tapped` event
   exists yet. Not a bug — the report is working exactly as designed against real (currently empty)
   data.

### Part B — owed to Daniel by name
The real revenue-sync run needs Miyagi's own Supabase service-role key — a different system's
production credential this session correctly did not fetch on its own (confirmed blocked even after
an explicit go-ahead; Daniel will run it himself or hand the credential over directly):

1. Run `scripts/sync-revenue-from-miyagi.mjs` with `MIYAGI_SUPABASE_URL` /
   `MIYAGI_SUPABASE_SERVICE_ROLE_KEY` (Miyagi's own project) and `GROWTH_ENGINE_URL` /
   `GROWTH_ENGINE_API_KEY` (the real `miyagisanchez` credential) set.
   → **Expected:** prints `Synced N day(s) of revenue: N new, 0 already present.`
2. Reload `https://golden-beans-gamma.vercel.app/impact/miyagisanchez/setup_guide` in a real browser.
   → **Expected:** `Attributed Revenue` now shows a real time series instead of "No data yet".
   `Setup Guide Shares` will remain empty until a real seller (or Daniel) taps share from the
   setup guide — that's real future usage, not a gap in this sprint's build.
3. Re-running step 1 later is always safe (idempotent, append-only — a re-synced day is a no-op, and
   a corrected day is flagged via `mismatchedDuplicates` rather than silently applied).

If any step fails, note the step number + what you saw — that's the bug report.
