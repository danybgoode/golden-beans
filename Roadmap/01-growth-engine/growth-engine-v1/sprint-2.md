# Growth Engine v1 — Sprint 2: TARS funnel v1

**Status:** 🚧 code complete, CI green, PR open — live-data smoke owed to Daniel (see walkthrough below)

## Stories

### Story 2.1 — Feature registry seeded from live `platform_flags` rows ✅
**As a** builder, **I want** a feature registry (key · target rule · retention window) seeded by the
**client pushing** its live `platform_flags` rows (SDK `syncFeatures()`, or a one-command seed run
from Miyagi), **so that** the Targeted denominator reflects real production flag state, never
`lib/flags.ts` code defaults (code defaults are fail-safe fallbacks and systematically say OFF).
**Acceptance:** running the seed/sync from Miyagi populates the registry with live rows; a
stale/never-synced registry is visibly stale (timestamped), not silently wrong. Registry sync stays
a command, not a product surface.
**Implementation:** `apps/web/supabase/migrations/20260715090000_feature_registry.sql` (`features`
table: `key`, `enabled`, optional `target_event`/`adopted_event`/`retained_event`, `retention_days`,
`synced_at`) + `lib/feature-schema.ts` (zod) + `app/api/v1/features/sync/route.ts` (same Bearer-key →
project_id auth as `/v1/track`; upserts on `(project_id, key)`, always bumping `synced_at`) +
`packages/sdk/src/index.ts` (`syncFeatures()`) + `scripts/lib/feature-sync-payload.mjs` (pure mapping,
unit-tested) + `scripts/sync-features-from-miyagi.mjs` (the one-command seed run — reads Miyagi's live
`platform_flags`, pushes via the SDK's wire shape; `isMain`-guarded). `platform_flags` rows carry no
event-name mapping, so `target_event`/`adopted_event`/`retained_event` are optional in the sync
payload — set explicitly for the known `setup_guide` feature (mapped from
`growth.telemetry_enabled`'s live value), falling back to Story 2.2's honest "any event" reading for
anything else.
**Risk:** LOW

### Story 2.2 — TARS aggregation ✅
**As a** PM, **I want** Targeted (registry-declared) / Adopted (first event) / Retained (repeat
event inside the feature's retention window) computed from Sprint 1's event stream, **so that**
funnel numbers are trustworthy.
**Acceptance:** a synthetic event sequence produces the expected Targeted/Adopted/Retained counts.
Funnel numbers are labeled **registry-declared**, not gateway-observed — v1's honest boundary (flags
are served by Miyagi, not this engine), noted so the funnel isn't oversold.
**Implementation:** `lib/tars.ts` — pure `computeTars(events, feature)`. Targeted = 0 whenever the
registry declares the feature disabled (the "registry-declared" gate), else distinct users on
`target_event` (fallback: any event). Adopted = distinct users on `adopted_event` (fallback: any
event — the literal "first event" reading). Retained = the subset of Adopted with a qualifying
repeat event (`retained_event`, fallback: any second distinct event) within `retention_days` of their
earliest event. Proven via `apps/web/e2e/tars.spec.ts` against a synthetic `setup_guide`-shaped fixture
(4 users: fully retained, adopted-not-retained, targeted-not-adopted, retained-just-outside-window) —
observed **red** on a deliberate mutation (dropping the retention-window bound) before being fixed
green.
**Risk:** LOW

### Story 2.3 — Funnel page for the S1.3 feature ✅ (code) — live-data smoke owed to Daniel
**As a** PM, **I want** a funnel page rendering Targeted/Adopted/Retained for the feature
instrumented in Sprint 1, **so that** the first real funnel is visible from live traffic.
**Acceptance:** with `growth.telemetry_enabled` ON and real Miyagi traffic flowing, the funnel page
shows non-zero, correct-looking TARS numbers for the S1.3 feature. This is one of the epic's
headline acceptance checks (Decision 2 of the scope doc).
**Implementation:** `lib/tars-query.ts` (`getFeatureFunnel`/`getFeatureFunnelByProjectId` — shared DB
read, so the page needs no Bearer credential of its own) + `app/api/v1/features/[key]/funnel/route.ts`
(Bearer-authed JSON endpoint, 404 for an unregistered feature) + `app/funnel/[projectSlug]/
[featureKey]/page.tsx` (no auth — no admin-auth system exists yet in golden-beans; an early-stage
internal tool with one viewer). Proven via `apps/web/e2e/funnel.spec.ts` against a synthetic
event sequence (both the JSON endpoint and the SSR page's HTML) — observed red on a deliberate
404-skip mutation before being fixed green.
**Risk:** LOW

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 2.1 (sync populates the registry),
  2.2 (aggregation math against a fixture event stream), 2.3 (funnel endpoint/page returns the
  expected shape).
- **browser smoke owed:** **yes, to Daniel by name** — the funnel-renders-real-data smoke (open the
  funnel page, confirm it reflects live Miyagi traffic for the S1.3 feature).
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)

Unlike Sprint 1, this sprint has **no agent-verified Part A**: both the production Supabase
service-role key and the real `miyagisanchez` API key are write-only on Vercel (`--sensitive`) — the
CLI can confirm they're set but never read them back (the same limitation `LEARNINGS.md` already
records for `GROWTH_ENGINE_API_KEY`). Everything below is **owed to Daniel by name**.

1. Run `scripts/sync-features-from-miyagi.mjs` from a machine/session with both `MIYAGI_SUPABASE_URL`/
   `MIYAGI_SUPABASE_SERVICE_ROLE_KEY` (Miyagi's own project) and `GROWTH_ENGINE_URL`/
   `GROWTH_ENGINE_API_KEY` (the real `miyagisanchez` credential) set.
   → **Expected:** prints `Synced 1 feature(s): setup_guide`.
2. Open `https://golden-beans-gamma.vercel.app/funnel/miyagisanchez/setup_guide` in a browser.
   → **Expected:** a page showing `Registry: enabled` (if `growth.telemetry_enabled` is currently ON
   in Miyagi's `/admin/flags`, else `disabled`) with a `last synced` timestamp from step 1, and
   Targeted/Adopted/Retained numbers. Adopted/Retained should be non-zero — Daniel's own Sprint-1
   Part B smoke already produced real `setup_guide_viewed`/`setup_guide_step_completed` events for
   his Clerk user id; Targeted will be 0 unless the flag is ON at sync time (steps 1-2's ordering
   matters here — the registry's `enabled` reflects the flag's value *at sync time*, not live).
3. If Targeted reads 0 but you know the flag is currently ON, re-run step 1 (the registry is
   snapshot-based; sync again after flipping the flag) and reload.
4. Optionally: `GET https://golden-beans-gamma.vercel.app/api/v1/features/setup_guide/funnel` with
   `Authorization: Bearer <the real miyagisanchez key>` — confirms the JSON endpoint matches what the
   page rendered in step 2.

If any step fails, note the step number + what you saw — that's the bug report.
