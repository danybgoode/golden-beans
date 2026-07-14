# Growth Engine v1 — Sprint 1: Events flow end-to-end (skateboard)

**Status:** 🏗️ in progress — 3/3 stories built, PRs open (1.1, 1.2 merged to golden-beans' `main`
via this branch's history; 1.3 is medusa-bonsai PR
[#253](https://github.com/danybgoode/miyagisanchezcommerce/pull/253), not yet merged). **Sprint
cannot close yet** — the live flag-flip + live-event smoke needs golden-beans actually deployed
(new Supabase + Vercel projects, owed a green light from Daniel before provisioning).

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
- **browser smoke owed:** **yes, to Daniel by name** — the flag-flip + live-event smoke (flip
  `growth.telemetry_enabled` ON in Miyagi, exercise the instrumented feature, confirm the event
  lands in golden-beans; flip OFF, confirm silence). **Blocked on infra:** this can't run until
  golden-beans is actually deployed (new Supabase + Vercel projects — owed a green light from Daniel
  before provisioning either; see the epic README's Open risks / Deploy order).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green — confirmed in
  both repos (golden-beans for 1.1/1.2; medusa-bonsai for 1.3, including the existing
  `flags-admin.spec.ts` suite still green after the new flag). Neither PR is merged yet.

## Sprint 1 — Smoke walkthrough (do these in order)
_Blocked — golden-beans has no deployed environment yet (new Supabase + Vercel projects are owed a
green light from Daniel before provisioning; see epic README). The numbered flag-flip + live-event
walkthrough will be written here once that infra exists and the smoke can actually be run, per the
epic Definition of Done — not invented ahead of time with placeholder URLs._

If any step fails, note the step number + what you saw — that's the bug report.
