# Growth Engine v1 — Sprint 1: Events flow end-to-end (skateboard)

**Status:** ⬜ not started

## Stories

### Story 1.1 — `POST /v1/track` ingest + store
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

### Story 1.2 — TS SDK (`track`, `trackAdoption`)
**As an** app builder, **I want** a TS SDK exposing `track(event, props)` and
`trackAdoption(featureKey)` that auto-appends context, **so that** integrating a new app takes
minutes.
**Acceptance:** a fresh Next.js app fires an event with ≤5 lines of integration code. Any SDK
resolve/config call returns an extensible **payload envelope** (not a bare boolean), so v2 fault
injection (`delay_ms`, `force_error_code`) is additive, never a breaking SDK change.
**Risk:** LOW

### Story 1.3 — First Miyagi feature instrumented behind `growth.telemetry_enabled`
**As a** PM, **I want** one real Miyagi feature instrumented behind `growth.telemetry_enabled`
(enablement flag in `platform_flags`, default **OFF**), **so that** real traffic proves the loop
with an instant off-switch.
**Acceptance:** flag ON → events land in golden-beans; flag OFF → zero calls.
**GTM-events-first check (do this before building the full SDK wire-up):** the three-doors/setup-guide
`dataLayer` events may already yield Targeted/Adopted/Retained for a first funnel — if so, the first
consumer can be a light adapter over those events rather than a fresh SDK integration. The SDK
(Story 1.2) still ships regardless — it's the product surface every future tenant uses. Proposed
candidate feature: `onboarding.three_doors_enabled` — confirm the final pick at build time.
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
