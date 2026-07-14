# Growth Engine v1 — Sprint 1: Events flow end-to-end (skateboard)

**Status:** ✅ **Sprint 1 fully closed 2026-07-14.** All 3 stories shipped to `main` in both
repos — golden-beans [#1](https://github.com/danybgoode/golden-beans/pull/1) (`55b6606`) and
medusa-bonsai [#253](https://github.com/danybgoode/miyagisanchezcommerce/pull/253) (`6e8d912`),
both squash-merged by Daniel (HIGH risk — both ship a DB migration, corrected from an initial LOW
mislabel a fresh-reviewer pass caught). Infra live: Supabase project `golden-beans` (ref
`slweidgffcfndnskcskc`) + Vercel project `golden-beans` (https://golden-beans-gamma.vercel.app).
**Part B (the real browser flag-flip + live-UI-event smoke) is confirmed green by Daniel** — real
`setup_guide_viewed` events landed in golden-beans with his actual Clerk user id, within seconds of
his own live interaction. See the walkthrough below for the full story, including a real
production bug this smoke caught and the fix ([miyagi-product-management#92](https://github.com/danybgoode/miyagi-product-management/pull/92)).

## Stories

### Story 1.1 — `POST /v1/track` ingest + store ✅ `f03464b`
**As a** builder, **I want** `POST /v1/track` to reject malformed events (missing/invalid API key;
missing `userId`/`event`; `featureId` optional) and persist valid ones to Postgres, **so that**
funnels stay accurate.
**Acceptance:** a missing/invalid `Authorization: Bearer <key>` → 401; a malformed body (missing
`userId`/`event`) → 400; a valid request → 201 + the persisted row's id, queryable after.
Tenant-scoped by design: `project_id` is resolved server-side from the API key (never trusted from
the request body — a client-supplied `projectId` would be a spoofing vector), so no query path can
cross projects — v1 runs single-tenant, but the schema/credential shape never needs a migration to
go multi-tenant (Decision 8). The event schema carries an extensible `tags`/`metadata` object from
day one (so v2 friction/chaos tagging is additive, not a migration).
**Implementation:** `apps/web/app/api/v1/track/route.ts` + `lib/auth.ts` (API-key → project_id,
sha256-hashed at rest in `projects.api_key_hash`) + `lib/track-schema.ts` (zod) +
`supabase/migrations/20260713220000_track_events.sql` (`projects` + `events`, RLS on, no policies —
service-role only, mirrors Miyagi's `platform_flags` pattern).
**Risk:** LOW

### Story 1.2 — TS SDK (`track`, `trackAdoption`) ✅ `82b278b`
**As an** app builder, **I want** a TS SDK exposing `track(event, props)` and
`trackAdoption(featureKey)` that auto-appends context, **so that** integrating a new app takes
minutes.
**Acceptance:** a fresh Next.js app fires an event with ≤5 lines of integration code. Any SDK
resolve/config call returns an extensible **payload envelope** (not a bare boolean), so v2 fault
injection (`delay_ms`, `force_error_code`) is additive, never a breaking SDK change.
**Implementation:** `packages/sdk/src/index.ts` — `createGrowthEngineClient({ baseUrl, apiKey,
userId })` returns `{ track, trackAdoption }`; both return `TrackResult = { ok: true; id } | { ok:
false; error; code?; issues? }` and never throw (network errors are caught and normalized into the
same envelope). Proven via `apps/web/e2e/sdk.spec.ts` — a real consumer (2-line client creation + 1
call = the "≤5 lines" acceptance), not a mock.
**Risk:** LOW

### Story 1.3 — Setup-guide funnel instrumented behind `growth.telemetry_enabled` ✅ `6e8d912` (medusa-bonsai)
**As a** PM, **I want** the setup-guide funnel instrumented behind `growth.telemetry_enabled`
(enablement flag in `platform_flags`, default **OFF**), **so that** real traffic proves the loop
with an instant off-switch.
**Acceptance:** flag ON → events land in golden-beans; flag OFF → zero calls.
**GTM-events-first check — done at Sprint 1 kickoff:** research found `onboarding.three_doors_enabled`
(the scope doc's original proposed candidate) has only one thin event (`door_share`) and no
Targeted/Retained signal, while Miyagi's **setup-guide funnel already has a T/A/R-shaped event set**:
`guide_view` (Targeted) → `guide_step_complete` (Adopted) → `first_share_tap`/`time_to_payable`
(Retained), in `lib/analytics-events.ts` / `SetupGuideCard.tsx` / `ComparteClient.tsx` /
`CobrosWizardClient.tsx`. **Daniel confirmed: setup-guide funnel is the target** — least new Miyagi-FE
surface, forwarding existing signals through the new SDK rather than inventing new instrumentation
points.
**Risk:** LOW — **shared surface: this story's implementation touches the Miyagi frontend
(medusa-bonsai). Build it additive, behind the flag, default OFF, on a separate branch + PR in
medusa-bonsai. Announce the PR when opened — don't land it silently.**
**Implementation (medusa-bonsai, branch `feat/growth-engine-telemetry`, PR
[#253](https://github.com/danybgoode/miyagisanchezcommerce/pull/253)):** `lib/flags.ts` +
`lib/flags-admin.ts` (flag def, following `onboarding.three_doors_enabled`'s enablement/OFF
polarity exactly) + a seed migration · `lib/growth-track.ts` (pure flag-gating decision, unit-tested)
· `lib/growth-engine.ts` (fire-and-forget forwarder mirroring `lib/telegram.ts`'s shape — silently
no-ops until `GROWTH_ENGINE_URL`/`GROWTH_ENGINE_API_KEY` are set post-deploy) ·
`app/api/growth/track/route.ts` (Clerk-authed, resolves userId server-side, checks the flag once so
no client code is flag-aware) · `lib/growth-events.ts` (client-side `pushGrowthEvent`, a sibling to
`pushAnalyticsEvent`, deduped per the fresh-reviewer fix below) · wired at `SetupGuideCard.tsx`
(`guide_view`, `guide_step_complete`) and `ComparteClient.tsx` (`first_share_tap`) — additive, no
existing GTM call touched. **Shipped to medusa-bonsai's `main` as `6e8d912`.**

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 1.1 `apps/web/e2e/track.spec.ts`
  (reject/accept + tenant isolation, 5 cases, all green), 1.2 `apps/web/e2e/sdk.spec.ts` (SDK fires +
  envelope shape, 3 cases, all green), 1.3 `apps/miyagisanchez/e2e/growth-track.spec.ts` (pure
  flag-gating decision, both branches, green — observed red on a deliberate mutation first) +
  `growth-track-api.spec.ts` (anonymous-401 gate, green; the authed 200/202 path is Clerk-gated and
  owed to Daniel, matching this codebase's own `admin-flags-api.spec.ts` precedent).
- **browser smoke: ✅ done by Daniel.** Flipped `growth.telemetry_enabled` ON in `/admin/flags`,
  reloaded `/shop/manage`, saw the forward fire in the browser console. **This first pass caught a
  real bug** — see the walkthrough below (Part C) — fixed live same-day, then re-confirmed by a
  second reload landing real events in golden-beans.
- **What the agent verified independently (API-level, real production infra, no UI):** see Part A
  of the smoke walkthrough below — a real `curl` round-trip against the deployed golden-beans
  production API, using a real seeded `miyagisanchez` project credential.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green — confirmed in
  both repos (golden-beans for 1.1/1.2; medusa-bonsai for 1.3, including the existing
  `flags-admin.spec.ts` suite still green after the new flag). Both PRs merged to `main`.
- **Review:** each PR got an independent fresh-reviewer pass (a different agent, no shared context)
  plus an advisory cross-agent second opinion (codex). Real findings, all fixed before merge: a
  Postgres permission bug only reproducible on a newer local Supabase CLI (golden-beans), a missing
  event-dedupe that would have inflated the funnel (medusa-bonsai), plus assorted doc/dead-code
  cleanup on both sides.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · golden-beans: https://golden-beans-gamma.vercel.app · Miyagi:
https://miyagisanchez.com

### Part A — Engine-only, API-level (✅ agent-verified 2026-07-14, no UI, no Miyagi involvement)
Proves the golden-beans side of the loop is real and working on live infra. Uses a `miyagisanchez`
project row + API key seeded directly into production for this purpose (`projects.slug =
'miyagisanchez'`) — the same credential Story 1.3's `GROWTH_ENGINE_API_KEY` env var (already set on
medusa-bonsai's Vercel project, Production scope) uses.

1. `curl https://golden-beans-gamma.vercel.app/` → 200, renders the "Golden Beans — Growth Engine"
   placeholder page.
   → **Confirmed:** 200.
2. `curl -X POST https://golden-beans-gamma.vercel.app/api/v1/track` with no `Authorization` header.
   → **Confirmed:** 401 `{"ok":false,"error":"Missing or malformed Authorization header"}`.
3. `curl -X POST .../api/v1/track` with a valid `miyagisanchez` API key and a well-formed body
   (`{"userId":"smoke-test-user","event":"provisioning_smoke_test","featureId":"setup_guide"}`).
   → **Confirmed:** 201 `{"ok":true,"id":"6fa42139-..."}`.
4. Query `events` directly for that row.
   → **Confirmed:** row present — `event: provisioning_smoke_test, user_id: smoke-test-user,
   feature_id: setup_guide`, timestamped 2026-07-14.

### Part B — The real thing: flag-flip + live-UI event (✅ confirmed by Daniel 2026-07-14)
This is what "Story 1.3 works" actually means — Part A only proves the engine, not Miyagi's side.

1. Open `https://miyagisanchez.com/admin/flags`, find `growth.telemetry_enabled`.
   → **Confirmed:** flag listed, enablement polarity.
2. Flip `growth.telemetry_enabled` ON in `/admin/flags`.
   → **Confirmed** by Daniel.
3. Reload `https://miyagisanchez.com/shop/manage`. The setup-guide card fires `setup_guide_viewed`.
   → **First attempt:** Daniel saw the event fire in the browser console (Miyagi's own
   `/api/growth/track` route ran successfully) — **but it never reached golden-beans.** See Part C
   for the root cause + fix.
   → **Second attempt, after the Part C fix:** **Confirmed** — real `setup_guide_viewed` rows
   landed in golden-beans' `events` table with Daniel's actual Clerk `user_id`
   (`user_3EP4Vhhl43MuzQneHcyhlH75Ruu`), timestamped within seconds of the reload.
4. Flip `growth.telemetry_enabled` back OFF in `/admin/flags` once done observing, to return to the
   default-OFF state.

### Part C — Production bug found + fixed during Part B (2026-07-14)
Daniel's Part B smoke caught a real gap Part A's API-only check couldn't: **the event fired
client-side and Miyagi's own internal route ran, but the outbound hop to golden-beans silently
never happened.** Root cause: `GROWTH_ENGINE_URL`/`GROWTH_ENGINE_API_KEY` were set on **Vercel's**
production environment scope, but Miyagi's frontend production runtime moved to **Cloud Run**
(`miyagi-web`, us-east4) on 2026-07-10 (`frontend-vercel-to-cloudrun` epic, S4.5) — Vercel now only
serves PR previews. The vars never reached the actually-running service, so
`sendGrowthEvent()` correctly no-op'd (its designed-safe behavior when unconfigured) on every real
request — no error, no crash, just silence. Confirmed via a direct `gcloud run services describe`
env-var diff against the live service.

**Fix, same day:**
- Patched the live Cloud Run revision via an incremental `gcloud run services update
  --update-env-vars --update-secrets` (verified: all 52 pre-existing vars intact, site healthy).
- The original `GROWTH_ENGINE_API_KEY` was unrecoverable (Vercel's `--sensitive` flag makes a value
  permanently write-only, by design) and had never been live, so it was **rotated** with zero blast
  radius — golden-beans' `projects.api_key_hash` for `miyagisanchez` updated to match, verified by
  SHA-256 hash comparison (the raw key itself was never printed at any point).
- Created a proper GCP Secret Manager secret + granted the Cloud Run service account IAM access,
  matching every other credential's existing pattern in this codebase.
- Fixed the durability gap: `infra/gcp/deploy-frontend.sh` / `provision-frontend.sh` now include
  both vars, so the next *full* redeploy won't silently drop them again (PR
  [miyagi-product-management#92](https://github.com/danybgoode/miyagi-product-management/pull/92),
  CI green, HIGH risk — shared production infra, owed to Daniel to merge).
- **Promoted to `Roadmap/LEARNINGS.md`** (Multi-agent & async deploy coordination) — the
  generalizable lesson: confirm which rail is *actually* serving production before wiring a new
  integration into someone else's already-shipped surface; don't assume from the original deploy
  docs.

If any step fails in a future run, note the step number + what you saw — that's the bug report.
