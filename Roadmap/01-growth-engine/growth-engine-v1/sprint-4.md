# Growth Engine v1 — Sprint 4: A/B v1

**Status:** 🟡 All 3 stories built, gate green, PR
[#5](https://github.com/danybgoode/golden-beans/pull/5) open (draft) — not yet merged/deployed.
Agent-verified locally (a fresh local Supabase + a real `next build`/`next start` production
build); no browser/money/auth smoke is owed to Daniel for this sprint (see Sprint QA below).

**Key design decision (made during build, not in the original scope note above): no new DB
migration.** All three stories build entirely on Sprint 1's existing `events` table — `tags`/
`metadata` JSONB was designed extensible from day one for exactly this ("targeting rules are
stored as data" below is satisfied by that JSONB, not a new column/table). Bucketing is genuinely
client-side/lookup-free (no registry to sync), exposure reuses `track()` verbatim, and the
comparison view computes live from the event stream the same way `funnel`/`impact` already do. This
keeps every story LOW risk, unlike Sprint 1 and Sprint 3, which got corrected to HIGH specifically
because they shipped migrations.

## Stories

### Story 4.1 — Deterministic client-side hash bucketing ✅ `7038fca`
**As an** app builder, **I want** the SDK to deterministically bucket a user into a variant (same
user → same variant), computed **client-side, with no lookup and no resolve endpoint**, **so that**
experiment assignment works without standing up a flag-serving gateway. This is experiment
assignment, not flag serving — Decision 1 (telemetry-first) stands; on/off gating stays with the
client's own flags (`isEnabled()`).
**Acceptance:** the same `userId` + experiment key always resolves to the same variant across
repeated calls.
**Implementation:** `packages/sdk/src/bucketing.ts` (new, pure, zero imports) — an FNV-1a 32-bit
hash over `userId:experimentKey`, then a weighted pick over a **key-sorted** variant list (stable
regardless of the order the caller passes variants in). `packages/sdk/src/index.ts`'s
`bucket(experimentKey, variants)` is **synchronous** (not `Promise`-returning, unlike every other
SDK method) — the visible proof it does no network I/O — and returns the same discriminated-union
envelope shape as `TrackResult`/`SyncResult` (`BucketResult`), never a bare string.
**Risk:** LOW (SDK-only, no server change, no DB).

### Story 4.2 — Exposure events ✅ `24fad4c`
**As a** PM, **I want** an exposure event fired when a user is bucketed, **so that** variant
comparison has a denominator.
**Acceptance:** bucketing a user fires an exposure event, queryable alongside Sprint 1's event
stream.
**Implementation:** `packages/sdk/src/index.ts`'s `trackExposure(experimentKey, variant, props?)` —
a thin wrapper around `track()` (mirrors `trackAdoption`'s shape exactly): fires
`event: 'experiment_exposed'` with `featureId: experimentKey` and `tags: {...props?.tags, variant}`.
Reuses the existing `/api/v1/track` route, `trackEventSchema`, and `events` table verbatim — zero
server-side change.
**Risk:** LOW (reuses the existing ingest path, zero schema change).

### Story 4.3 — Side-by-side variant comparison (basic lift) ✅ `f7fb4fc`
**As a** PM, **I want** a side-by-side view comparing variants on a chosen metric, **so that** I can
eyeball an experiment's effect.
**Acceptance:** the view shows basic lift (no statistical-significance engine — that's a later
epic) for a real or fixture experiment. Variant resolution returns the Sprint 1.2 payload envelope;
targeting rules are stored as data (cohort %, region — telemetry/GeoIP properties only, never
Medusa's `Region` currency/tax concept), so v2 chaos scenarios can reuse the same shape.
**Implementation:** `lib/ab.ts` (new, pure, zero imports, mirrors `lib/tars.ts`'s style) —
`computeVariantComparison(events, metricEvent)` groups `experiment_exposed` events by
`tags.variant` (exposures = the denominator from Story 4.2), counts the subset who also fired the
caller-named `metricEvent` (conversions), and computes lift as a plain % difference vs the
alphabetically-first exposed variant (baseline; `null` for the baseline itself or when the
baseline's rate is 0). `lib/ab-query.ts` (new, `import 'server-only'`, mirrors `lib/tars-query.ts`'s
`get.../...ByProjectId` split) queries `events` directly — no experiments registry table.
`GET /api/v1/experiments/[key]/compare?metricEvent=<event>` (Bearer-authed, mirrors the
funnel/impact routes; 400 if `metricEvent` is missing, 200 with an honest empty-state body — not a
404 — for an experiment with zero exposures yet) + the unauthed
`/experiments/[projectSlug]/[experimentKey]` SSR page (bare HTML, no CSS, matches `funnel`/`impact`
exactly — no admin-auth system exists yet in golden-beans).
**Risk:** LOW (read-only reporting over existing data, no new table, no money/auth).

## Sprint QA
- **api spec(s):** one Playwright `api` spec per testable story — 4.1
  (`bucketing.spec.ts`: synchronous, deterministic, order-independent, empty/zero-weight →
  `ok:false`, 7 cases), 4.2 (`exposure.spec.ts`: exposure event fires with `tags.variant`,
  caller tags merged not overwritten, queryable alongside the event stream, 3 cases), 4.3
  (`experiments.spec.ts`: 400 for missing `metricEvent`, honest empty state for zero exposures, real
  basic-lift math on both the JSON endpoint and the SSR page, plus a case added during review for a
  metric event carrying no `featureId` at all, 4 cases). 14 new cases, **59 total green** across all
  four sprints (no regressions), also updated `e2e/README.md`'s spec inventory (which had drifted
  since Sprint 3 — north-star-sync/feature-input-link/input-values/impact were missing from it).
- **browser smoke owed:** none — per this sprint's original QA note, "no money/auth step here." This
  sprint is telemetry-only (bucketing + reporting over existing data); confirmed true during build,
  not just assumed.
- **deterministic gate:** `tsc --noEmit` + `npm run build` + Playwright `api` (59 cases) — all green,
  run against a freshly-reset local Supabase (`supabase db reset`, applying all 4 migrations cleanly
  — Sprint 4 adds **zero** new migrations) + a real locally-built `next start` production server.
- **Review:** PR [#5](https://github.com/danybgoode/golden-beans/pull/5). Advisory cross-agent
  second opinion (Codex, `node scripts/cross-review.mjs 5 --agent codex`) found two minor issues
  (a hash-range edge case, a `metricEvent`-trim inconsistency) — both fixed. A fresh reviewer pass
  (an independent agent with no shared context) found one real correctness bug: the comparison
  query required the metric/conversion event to also carry `featureId` set to the experiment key,
  which a realistic conversion event (`checkout_completed`, `signup`, ...) would never do — silently
  reporting 0 conversions instead of erroring. Fixed (`2d2ea2c`) by scoping the metric-event query
  to `project_id` + event name only (exposure events stay `feature_id`-scoped); a new spec exercises
  exactly this case and was observed red against the old query before the fix landed.

## Sprint 4 — Smoke walkthrough (do these in order)
Env: local (this branch is not yet merged/deployed — golden-beans has no per-branch preview and no
Git-integration auto-deploy, so there's no preview URL to point at pre-merge). Re-run this exact
walkthrough against `https://golden-beans-gamma.vercel.app` once merged + `vercel --prod`'d, and
update the URLs below — same sequence Sprints 1–3 followed.

### Part A — engine-only, agent-verified locally 2026-07-16 (a real local `next build`/`next start`
production server + a freshly-reset local Supabase, `project-one` fixture credentials). Rerun after
the fresh-reviewer fix, deliberately using an **untagged** conversion event — the realistic shape —
rather than one carrying `featureId`, to actually exercise the fix rather than mask it the same way
the pre-fix bug went unnoticed.

1. `curl -X POST http://localhost:3002/api/v1/track -H "Authorization: Bearer
   local-test-key-do-not-use-in-prod" -d '{"userId":"smoke-user-a","event":"experiment_exposed",
   "featureId":"smoke-cta-copy-real","tags":{"variant":"control"}}'`
   → **Confirmed:** `201 {"ok":true,"id":"849cf977-..."}`.
2. Same call for `smoke-user-b`, `variant: "treatment"`.
   → **Confirmed:** `201`.
3. `smoke-user-b` converts via `{"userId":"smoke-user-b","event":"checkout_completed"}` — **no
   `featureId` at all**, exactly how a real business event gets fired.
   → **Confirmed:** `201`.
4. `curl "http://localhost:3002/api/v1/experiments/smoke-cta-copy-real/compare?metricEvent=
   checkout_completed" -H "Authorization: Bearer local-test-key-do-not-use-in-prod"`.
   → **Confirmed:** `{"ok":true,...,"comparison":{"variants":[{"key":"control","exposures":1,
   "conversions":0,"conversionRate":0,"lift":null},{"key":"treatment","exposures":1,"conversions":1,
   "conversionRate":1,"lift":null}],"baseline":"control"}}` — the untagged `checkout_completed`
   event was correctly attributed to `treatment` via the userId join, proving the fix. `lift: null`
   for treatment is separately correct, not a bug: control's (baseline) conversion rate is 0, and a
   % difference from zero is undefined by design (see `lib/ab.ts`).
5. `curl "http://localhost:3002/experiments/project-one/smoke-cta-copy-real?metricEvent=
   checkout_completed"`.
   → **Confirmed:** the page's embedded RSC payload shows `control (baseline)` at 1 exposure/0
   conversions/0.0%, `treatment` at 1 exposure/1 conversion/100.0%, both rows `—` for lift — matches
   point 4 exactly.

### Part B — owed to Daniel (post-merge + deploy)
No money/auth step exists in this sprint, so there's no browser-session-gated smoke to hand off —
but the production round-trip itself is still worth a quick eyeball once live:
1. After merge + `vercel --prod`, repeat Part A's 4 steps against
   `https://golden-beans-gamma.vercel.app` with the real `miyagisanchez` project key.
2. Optionally, from a real app already using the SDK (or a scratch script), call
   `growth.bucket('some-experiment', [{key:'a'},{key:'b'}])` + `growth.trackExposure(...)` and
   confirm the row lands the same way Part A's `curl` calls did.

If any step fails, note the step number + what you saw — that's the bug report.
