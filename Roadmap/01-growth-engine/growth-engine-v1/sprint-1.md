# Growth Engine v1 — Sprint 1: Events flow end-to-end (skateboard)

**Status:** 🏗️ in progress — 3/3 stories built, CI green, both fresh-reviewed. Daniel greenlit
infra provisioning 2026-07-14: a second Supabase project (`golden-beans`, ref
`slweidgffcfndnskcskc`) and a Vercel project (`golden-beans`) are live in production — see the
smoke walkthrough below for the real, verified API-level proof. **Two PRs remain open, neither
merged by the agent.** A fresh-reviewer pass caught a risk-tier mislabel: both PRs ship a DB
migration, which `WAYS-OF-WORKING.md` states is HIGH risk (always a product-owner merge), not
LOW as originally written — corrected in both PR bodies. golden-beans
[#1](https://github.com/danybgoode/golden-beans/pull/1) (Stories 1.1–1.2, CI green, reviewed) and
medusa-bonsai [#253](https://github.com/danybgoode/miyagisanchezcommerce/pull/253) (Story 1.3, CI
green, reviewed — one real bug found and fixed: a missing event-dedupe that would have inflated
the funnel). **Both owed to Daniel to merge directly.** Sprint can't fully close until then:
`growth.telemetry_enabled` is OFF (correct default) and PR #253 isn't merged, so the *browser*
flag-flip + real-UI-triggered event smoke is still owed to Daniel too — see below for exactly
what is and isn't verified yet.

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

### Story 1.3 — Setup-guide funnel instrumented behind `growth.telemetry_enabled` ✅ built, PR open `91fde42`
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
`pushAnalyticsEvent`) · wired at `SetupGuideCard.tsx` (`guide_view`, `guide_step_complete`) and
`ComparteClient.tsx` (`first_share_tap`) — additive, no existing GTM call touched. **PR not yet
merged** — this is what's "built" but not yet shipped to medusa-bonsai's `main`.

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 1.1 `apps/web/e2e/track.spec.ts`
  (reject/accept + tenant isolation, 5 cases, all green), 1.2 `apps/web/e2e/sdk.spec.ts` (SDK fires +
  envelope shape, 3 cases, all green), 1.3 `apps/miyagisanchez/e2e/growth-track.spec.ts` (pure
  flag-gating decision, both branches, green — observed red on a deliberate mutation first) +
  `growth-track-api.spec.ts` (anonymous-401 gate, green; the authed 200/202 path is Clerk-gated and
  owed to Daniel, matching this codebase's own `admin-flags-api.spec.ts` precedent).
- **browser smoke owed:** **yes, to Daniel by name** — the *real-UI* flag-flip + live-event smoke:
  flip `growth.telemetry_enabled` ON via `/admin/flags` in Miyagi (an admin action, deliberately not
  taken by the agent), load the setup-guide card and tap through it, confirm the events land in
  golden-beans; flip OFF, confirm silence. **Additionally blocked on PR #253 merging** — the flag
  and the `/api/growth/track` route don't exist on medusa-bonsai's `main` yet, so `/admin/flags`
  won't show `growth.telemetry_enabled` at all until that PR ships.
- **What the agent verified instead (API-level, real production infra, no UI):** see the smoke
  walkthrough below — a real `curl` round-trip against the deployed golden-beans production API,
  using a real seeded `miyagisanchez` project credential, proving the engine itself works end-to-end
  on live infra. This is *not* a substitute for the browser smoke (it never exercises Miyagi's
  code at all — Story 1.3 isn't deployed yet), just proof the target Story 1.3 will call is real.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green — confirmed in
  both repos (golden-beans for 1.1/1.2; medusa-bonsai for 1.3, including the existing
  `flags-admin.spec.ts` suite still green after the new flag). Neither PR is merged yet.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: production · golden-beans: https://golden-beans-gamma.vercel.app · Miyagi:
https://miyagisanchez.com (once PR #253 merges — not yet, see below)

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

### Part B — The real thing: flag-flip + live-UI event (⬜ owed to Daniel by name)
This is what "Story 1.3 works" actually means — Part A only proves the engine, not Miyagi's side.
**Prerequisite: merge PR [#253](https://github.com/danybgoode/miyagisanchezcommerce/pull/253) first**
(after review — the agent deliberately did not merge it; see Status above). Then:

1. Open `https://miyagisanchez.com/admin/flags`, find `growth.telemetry_enabled` (should show
   disabled/OFF, enablement polarity).
   → Expected: flag listed, OFF.
2. As a seller with an incomplete setup guide, load `https://miyagisanchez.com/shop/manage` with the
   flag still OFF, then check golden-beans (or the DB) for any new `miyagisanchez`-project event.
   → Expected: **zero new events** — confirms OFF ⇒ silence.
3. Flip `growth.telemetry_enabled` ON in `/admin/flags`.
4. Reload `https://miyagisanchez.com/shop/manage` (same seller). The setup-guide card should fire
   `guide_view`; complete a step to fire `guide_step_complete`; tap a share button on
   `/shop/manage/comparte` to fire `setup_guide_share_tapped`.
   → Expected: each action produces a matching event in golden-beans within a few seconds
   (`user_id` = the seller's Clerk id, `feature_id: setup_guide`).
5. Flip `growth.telemetry_enabled` back OFF in `/admin/flags`. Repeat step 4's actions.
   → Expected: **zero new events** — confirms the instant off-switch.

If any step fails, note the step number + what you saw — that's the bug report.
