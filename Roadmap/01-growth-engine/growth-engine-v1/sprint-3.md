# Growth Engine v1 — Sprint 3: North Star engine v1

**Status:** ✅ Sprint 3 fully closed 2026-07-15. PR #3 (squash `bd154f1`) + PR #4 (squash `75134a7`,
the Postgres-connection fix) both merged to `main`, deployed, and the real revenue-sync run is
confirmed working against production — see Part B below for the full story, including a real
production network-topology finding.

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

### Part B — the real revenue sync, confirmed live 2026-07-15 (two corrections along the way)
Daniel authorized the live run, the credential lookups, and (as things unfolded) a temporary Cloud
Run Job to reach a network-isolated database. Two real, distinct problems surfaced and were fixed
in order — both are now durable lessons in `Roadmap/LEARNINGS.md`.

1. **First attempt — wrong database.** The original script assumed `financial_event` (Miyagi's
   revenue ledger) was reachable the same way `platform_flags` is: via Supabase's REST API. It
   isn't — `financial_event` is a Medusa **core module** table living in Medusa's own primary
   Postgres (`DATABASE_URL`), a completely different database from the small auxiliary Supabase
   project `platform_flags` uses. Failed loudly ("table not found in schema cache"), not silently.
   → **Fixed** in PR #4: rewrote the fetch to use a raw `pg` client against `MIYAGI_DATABASE_URL`.
2. **Second attempt — wrong network path.** `MIYAGI_DATABASE_URL` points at a Cloud SQL instance
   (`medusa-pg`, `us-east4`) with **no public IP** — reachable only from inside Google's network, not
   from any external machine, regardless of credentials. A local Cloud SQL Auth Proxy tunnel (the
   normal fix for this) still couldn't reach it — confirmed no VPN/Interconnect path exists from
   outside GCP into that VPC at all.
   → **Fixed** by running the sync from *inside* GCP: a temporary Cloud Run Job
   (`revenue-sync-oneoff`, `miyagisanchezback-497722`/`us-east4`) attached to `medusa-conn` (the same
   VPC connector the real `medusa-web` backend service uses), running as the `medusa-run` service
   account (Medusa's own backend identity — already had `DATABASE_URL` access; briefly granted
   `GROWTH_ENGINE_API_KEY` access too, revoked again immediately after). Both secrets were bound
   directly by Cloud Run from Secret Manager — never handled as plaintext by the agent.
   → **Confirmed:** job execution `revenue-sync-oneoff-wvd2z` completed successfully, logs show
   `Synced 1 day(s) of revenue: 1 new, 0 already present.`
3. **Cleanup, confirmed complete:** the Cloud Run Job, all 6 of its built container image versions,
   and the temporary `GROWTH_ENGINE_API_KEY` IAM grant on `medusa-run` were all deleted/reverted —
   no standing resources or permissions left behind beyond the original state.
4. `curl https://golden-beans-gamma.vercel.app/impact/miyagisanchez/setup_guide`.
   → **Confirmed:** `Attributed Revenue` now shows a real row — `2026-07-06`, value `0` (the one real
   `financial_event` revenue row found sums to $0 — reported honestly, not a bug). `Setup Guide
   Shares` still shows "No data yet" — correct, since nobody has tapped share from the setup guide
   yet (matches Sprint 2's close).
5. Re-running `scripts/sync-revenue-from-miyagi.mjs` later is always safe (idempotent, append-only —
   a re-synced day is a no-op, and a corrected day is flagged via `mismatchedDuplicates` rather than
   silently applied). It needs to run from somewhere with access to `medusa-conn`'s VPC (a fresh
   one-off Cloud Run Job following this same pattern, or a promoted scheduled job if this becomes
   routine) — a plain local/CI run will hang on the network, not fail loudly, so budget a short
   connection timeout if scripting this again.

If any step fails, note the step number + what you saw — that's the bug report.
