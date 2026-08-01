# Flag control plane + Miyagi migration + resilience/SecOps — Sprint 2: Complete Miyagi migration

**Status:** ✅ implementation and cutover complete — the 40-key migration inventory is
Golden-authoritative in both production services on snapshot `46`; the authenticated owner-browser
walkthrough remains an epic close-out smoke item

## Stories

### Story 2.1 — Inventory, import and parity oracle

**As the** Miyagi owner, **I want** every current flag imported with its exact semantics, **so that**
the provider can change without silently changing the product.

**Acceptance:** a code-derived inventory covers frontend and backend keys/call sites, current live
value, compile-time default, polarity, criticality, description and owning enforcement seam; import
is idempotent; no unknown/duplicate/drifted key is ignored; shadow comparison records local,
Golden and default result plus snapshot version without PII; every mismatch is resolved or blocks
cutover.

**Risk:** high

**Evidence (2026-07-28):**

- Golden PRs [#43](https://github.com/danybgoode/golden-beans/pull/43) and
  [#45](https://github.com/danybgoode/golden-beans/pull/45) merged. The additive catalog-import
  migration `20260808100000_idempotent_flag_catalog_import.sql` is applied to the linked remote
  database.
- The live Miyagi `platform_flags` source was validated as the complete 40-key catalog (12 keys
  enforced by both frontend and backend). The existing remote Golden tenant is `miyagi`; its
  owner-gated atomic import created 40 immutable version-one definitions, then a replay returned
  40 unchanged definitions. Current effective defaults are 39 on / 1 off
  (`shipping.envia_enabled`).
- The import initially created no environment state or activation, preserving a fully dark control
  plane. That baseline was then deliberately activated for `production`: snapshot version 40 has
  all 40 version-one definitions (39 on / `shipping.envia_enabled` off), verified exact and
  distinct. Snapshot serving remains credential-scoped.
- Miyagi's frontend adapter PR [#318](https://github.com/danybgoode/miyagisanchezcommerce/pull/318)
  and Medusa backend adapter PR [#117](https://github.com/danybgoode/medusa-bonsai-backend/pull/117)
  preserve their existing `isEnabled()` seams. They established `shadow` capability with a
  dedicated, revocable 30-day `flag_read` credential while local `platform_flags` remained
  authoritative. Golden's `FLAG_SERVING_ENABLED` gate is live through a Git-tracked deployment,
  but only the scoped snapshot endpoint is exposed.
- Frontend PR [#319](https://github.com/danybgoode/miyagisanchezcommerce/pull/319) and backend
  PR [#118](https://github.com/danybgoode/medusa-bonsai-backend/pull/118) corrected the parity
  observer for production builds: Sentry removes `console.info`, so its already-bounded,
  PII-free control-plane record writes to stdout inside the existing never-throw guard. Both
  PRs had focused local tests and clean Antigravity reviews; the frontend's unrelated pre-existing
  supply-importer preview assertion was explicitly triaged before its authorized merge.
- The regional frontend and backend push-to-`main` Cloud Build triggers were found disabled after
  the GCP migration and restored with their documented dedicated CI/CD service accounts. The
  automatic deployments from the two merges succeeded, proving the tracked `main` → Cloud Build
  → Cloud Run rail again (frontend `miyagi-web-00101-rk6`; backend `medusa-web-00178-7kv`).
- Historical production shadow proof is real, not just configuration: a warmed frontend instance recorded
  `promoter.enabled` and `content.overrides_enabled`, and the Medusa catalog read recorded
  `catalog.inventory_channels_enabled`. Every record used Golden snapshot version 40, immutable
  flag version 1 and `STATIC` resolution; Golden and local values matched. No request telemetry,
  subject data or behavior-changing `golden` mode was used.

### Story 2.2 — Preserve both `isEnabled()` seams with Golden primary

**As a** Miyagi builder, **I want** existing call sites unchanged, **so that** flag migration cannot
accidentally rewrite commerce behavior.

**Acceptance:** frontend and Medusa backend keep their typed `isEnabled(flag)` never-throw
interfaces; provider modes support `local`, `shadow` and `golden`; request paths evaluate from
bounded in-process snapshots; a successful Golden refresh updates the local read-only durable
mirror monotonically; outage/timeout/malformed/stale cases use last-known/default according to the
imported polarity; no request includes a project id or ingest secret.

**Risk:** high

### Story 2.3 — Golden-backed Miyagi flag operations

**As a** Miyagi admin, **I want** the familiar flag surface to operate Golden's source of truth,
**so that** one audited change governs both apps.

**Acceptance:** `/admin/flags` reads effective value, environment, version, reason, freshness and
criticality from the Golden-backed server seam; writes use a scoped owner API with optimistic
concurrency and reason; direct operational writes to `platform_flags` stop; audit identifies the
Miyagi actor and Golden version; frontend/backend converge within the bounded refresh window.

**Risk:** high

**Evidence (2026-07-28):**

- Golden PR [#50](https://github.com/danybgoode/golden-beans/pull/50) merged after its migration-applied
  API suite, build gate, Vercel preview and Antigravity review were clean. Its additive production
  migration `20260808110000_flag_admin_operations.sql` is applied and recorded: anonymous and
  authenticated roles cannot execute the admin read/write functions, service role can, and every
  security-definer function pins `search_path`. The migration's version prefix establishes its
  ordering; this evidence date records when it was applied, not a filename rename candidate.
- Miyagi frontend PR [#322](https://github.com/danybgoode/miyagisanchezcommerce/pull/322) merged with
  all required CI and preview checks green. `/admin/flags` now uses the Golden server seam with a
  verified Clerk actor, scoped credential, reason, and optimistic snapshot version; it has no
  local operational read/write fallback. The active production services currently default to
  `local`: their provider mode/read-key/environment variables are absent, so their parser fails
  safely to local. Re-establish and prove `shadow` before any cutover.
- A new revocable `flag_admin` credential is pinned to the Golden `miyagi` project and
  `production` environment. Its opaque value is stored only in the `miyagisanchez-prod` Secret
  Manager and is accessible only to `miyagi-web`'s runtime service account; no browser variable or
  second GCP project was added.
- The normal `main` → `us-east4` Cloud Build → `miyagi-web` rail deployed merge `3daf54a` as
  revision `miyagi-web-00045-f9l` at 100% traffic. The deployed server rejects an unauthenticated
  admin API request (401), while the scoped server credential reaches Golden's admin snapshot
  endpoint successfully (200).
- An unauthenticated production browser smoke of `/admin/flags` passed its redirect/access
  boundary. It recorded one 400 resource console error, so this is not claimed as a console-clean
  smoke. A real authenticated production admin walkthrough remains owed to Daniel: the test-token
  harness cannot sign into the production Clerk instance by design.

### Story 2.4 — Staged full-inventory cutover

**As the** product owner, **I want** a reversible cutover from safe to critical flags, **so that**
Golden becomes the actual control plane with evidence rather than aspiration.

**Acceptance:** one safe flag cuts over first, followed by all non-critical flags; money/auth/
checkout flags cut only when frontend/backend report the same snapshot and their named smoke
passes; all inventory ends Golden-authoritative; provider rollback restores the last-known mirror/
defaults; no flag is left with two operational writers; a migration report records versions,
timestamps, mismatches and smoke evidence.

**Risk:** high

### Story 2.5 — Evaluation telemetry without a second pipeline

**As a** product owner, **I want** sampled flag evaluation/exposure facts, **so that** I can connect
rollouts to outcomes without turning every request into noisy analytics.

**Acceptance:** evaluation/exposure events use `/api/v1/track`; schema carries flag key/version,
variant, reason and safe subject context but never content bodies or credentials; sampling and
idempotency prevent duplicate hot-path noise; experiment-bound flags use the existing exposure
denominator; analytics failure cannot fail a flag check.

**Risk:** high

**Foundation evidence (2026-07-28):** Golden PR
[#49](https://github.com/danybgoode/golden-beans/pull/49) is merged and deployed with the bounded
SDK `trackFlagEvaluation()` primitive: it reuses canonical `/api/v1/track`, samples ordinary
evaluations, preserves experiment exposure semantics and never affects a flag decision. Miyagi
adopted the released `sdk-v0.2.0` primitive in the completed cutover described below.

## Cutover completion evidence — 2026-08-01 re-entry audit

- Frontend PRs [#325](https://github.com/danybgoode/miyagisanchezcommerce/pull/325) and
  [#326](https://github.com/danybgoode/miyagisanchezcommerce/pull/326), plus backend PRs
  [#125](https://github.com/danybgoode/medusa-bonsai-backend/pull/125) and
  [#126](https://github.com/danybgoode/medusa-bonsai-backend/pull/126), are merged. They complete
  the Golden authority seam, durable mirror, SDK telemetry and request-driven serverless refresh.
- Both active Cloud Run services are configured with `GOLDEN_BEANS_FLAG_CUTOVER=*=golden`,
  `GOLDEN_BEANS_FLAG_ENVIRONMENT=production`, a scoped read-key secret and
  `GROWTH_ENGINE_URL=https://golden-beans-gamma.vercel.app`. Evaluation sampling is `0.1`.
- Current PII-free authority logs from both services report snapshot `46`, Golden live authority
  during normal refresh and Golden durable authority during bounded fallback. Registered keys agree
  on immutable flag version `1` and the local/Golden values match.
- The approved Stripe rollback drill exposed timer-only refresh in a serverless runtime: backend
  advanced before frontend. PRs #326/#126 moved refresh onto the request path, after which both
  services converged on snapshot `46`. The never-throw and durable/default fallback contract stayed
  intact during the drill.
- The imported catalog remains the exact 40-key inventory captured on 2026-07-28. The later
  `catalog.owned_shop_only_enabled` key intentionally resolves from its default-ON local kill-switch
  and has no Golden definition, per the explicit product decision recorded in frontend #332 and
  backend #132. Its `DEFAULT` evaluation reason is expected; it is not misrepresented as migrated.

## Sprint QA

- **Golden specs:** imported definition compatibility, snapshot and telemetry contracts.
- **Miyagi frontend specs:** inventory exhaustiveness, local/shadow/golden parity, bounded refresh,
  durable mirror monotonicity, outage/default matrix and admin concurrency/audit.
- **Miyagi backend specs:** same inventory/version and money-path fallback behavior; no provider
  network call per request.
- **browser smoke owed:** yes, to Daniel — `/admin/flags`, frontend + backend convergence, checkout,
  auth-gated surface and at least one enablement plus one kill-switch rollback.
- **deterministic gates:** Golden gate plus Miyagi frontend typecheck/lint/build/API and backend
  unit/build gates; cross-family high-risk review in every touched repo.

## Sprint 2 — Smoke walkthrough

Env: production · Golden Beans + Miyagi production URLs

1. Run the inventory/import report against current production flag state.
   → Every frontend/backend flag is accounted for; zero unknown keys or unexplained mismatches.
2. Deploy `shadow` mode and compare through at least one full cache refresh.
   → Local remains authoritative; Golden/local/default values and versions are visible; behavior
   does not change.
3. Cut over a named safe flag and flip it from Miyagi `/admin/flags`.
   → Golden audit records the change; frontend and backend converge; local mirror updates read-only.
4. Make Golden snapshot refresh unavailable and repeat the affected page/API.
   → Last-known/default behavior is preserved and the request does not fail.
5. After parity evidence, cut over the remaining inventory.
   → Report shows every flag Golden-authoritative with one operational writer.
6. (money/auth path — owed to Daniel) flip one approved critical kill-switch to its safe value,
   exercise the real guarded path, then restore it.
   → Frontend and backend enforce the same value; rollback is observable and audited.

If any step fails, stop the cutover and restore provider mode to the last-known mirror/defaults.
