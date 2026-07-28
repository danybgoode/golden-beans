# Flag control plane + Miyagi migration + resilience/SecOps — Sprint 2: Complete Miyagi migration

**Status:** 🟡 in progress — catalog imported and adapters are dark; shadow parity/cutover remain

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
- Postconditions are intentionally dark: 0 environment states, 0 activations and no flag-read
  credential. The import has not changed Miyagi runtime behavior or selected a provider mode.
- Miyagi's frontend adapter PR [#318](https://github.com/danybgoode/miyagisanchezcommerce/pull/318)
  and Medusa backend adapter PR [#117](https://github.com/danybgoode/medusa-bonsai-backend/pull/117)
  are merged in `local` mode. They retain their existing `isEnabled()` seams and are ready for the
  separate shadow-parity proof.

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
