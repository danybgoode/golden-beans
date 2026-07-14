# Growth Engine v1 — Sprint 1: Events flow end-to-end (skateboard)

**Status:** 🏗️ in progress — 2/3 stories shipped (1.1, 1.2)

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

### Story 1.3 — Setup-guide funnel instrumented behind `growth.telemetry_enabled`
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

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 1.1 (reject/accept + tenant
  isolation), 1.2 (SDK fires + envelope shape), 1.3 (flag OFF → zero calls / flag ON → event lands,
  at the API layer).
- **browser smoke owed:** **yes, to Daniel by name** — the flag-flip + live-event smoke (flip
  `growth.telemetry_enabled` ON in Miyagi, exercise the instrumented feature, confirm the event
  lands in golden-beans; flip OFF, confirm silence).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge, in
  both repos touched (golden-beans for 1.1/1.2, medusa-bonsai for 1.3).

## Sprint 1 — Smoke walkthrough (do these in order)
_TBD — write this section before sprint close, per the epic Definition of Done. Must include the
flag-flip + live-event smoke (owed to Daniel by name) as numbered, real-URL steps._

If any step fails, note the step number + what you saw — that's the bug report.
