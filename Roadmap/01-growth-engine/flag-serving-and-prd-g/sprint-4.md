# Sprint 4 — Evergreen catalog sync + discoverable operations

**Status:** ✅ shipped — 2026-08-01

## Outcome

Projects declare a typed flag once in their own source-controlled catalog and synchronize it into
their own Golden control plane without adding a project-specific whitelist to Golden Beans. Golden
remains the operational writer; application defaults remain the never-throw fallback. The existing
`catalog.owned_shop_only_enabled` feature stays ON throughout its registration and activation.

This sprint also makes the already-live Flags and Tasks surfaces discoverable from `/app`. Tasks is
an active product surface, not a permanently dark preview; its existing `SIGNALS_ENABLED` safety
gate remains available as a kill switch and must be ON in Production before closeout.

## Closeout evidence — 2026-08-01

- Golden PR #64 (`f1bd1f51e8076da6f79f8c2644464c416ccea699`) shipped the generic sync route, SDK
  publisher and Flags/Tasks navigation. The additive migration `20260810100000` is applied.
- Rollout PR #65 (`e9be164ffa3cd8e1ab51465ecde6302b487056e`) made
  `FLAG_DEFINITION_SYNC_ENABLED=true` live through a tracked deployment. The gate probe changed from
  the OFF `404` to the expected auth-boundary `401`.
- Frontend parity PR #335 merged at `309e04c`; backend parity PR #134 merged at `b9df31b`.
- Against the live Golden project `miyagi`, frontend sync returned `1 created / 39 unchanged` and
  backend sync returned `0 created`; idempotent reruns returned `0 created / 40 unchanged` and
  `0 created`, respectively.
- The owned-shop definition was activated ON through the normal lifecycle path, advancing Production
  snapshot `46 → 47`. It remains default `on`, polarity `killswitch`, enforcement `both`; no OFF
  transition occurred.
- `/app`, `/app/flags/miyagisanchez` and `/app/tasks/miyagisanchez` return the authenticated-path
  `307 /login`, proving the surfaces exist and are not dark. A connected authenticated browser was
  unavailable for this closeout, so that stronger product-owner confirmation is not claimed.

## Story 4.1 — Find the operating surfaces

**As a** project member, **I want** Flags and Tasks linked from my project on `/app`, **so that** I
do not need to know hidden URLs to operate Golden Beans.

**Acceptance:**

- Every project links to `/app/flags/<projectSlug>` while `FLAG_SERVING_ENABLED` is ON.
- Every project links to `/app/tasks/<projectSlug>` while `SIGNALS_ENABLED` is ON.
- The link copy reflects role-aware behavior; authorization remains enforced by each destination.
- A route-inventory spec classifies every top-level project surface as linked, gated, or flow-only.
- `/app/onboarding/<projectSlug>` remains flow-only.
- Production browser smoke proves Flags and Tasks are reachable from `/app`.

**Risk:** medium — product navigation and gate/status semantics.

## Story 4.2 — Synchronize a project catalog without Golden-side hardcoding

**As a** project builder, **I want** to synchronize my typed flag catalog through the Golden SDK,
**so that** adding a flag to a new project never requires editing Golden Beans source or SQL.

**Acceptance:**

- `@golden-beans/sdk` exposes `syncFlagDefinitions()` with a bounded, versioned wire contract.
- Golden exposes a tenant-scoped flag-catalog sync route which resolves `project_id` exclusively
  from a dedicated, revocable server-side credential.
- The credential can create/no-op definition drafts only. It cannot activate/deactivate versions,
  mutate snapshots, issue credentials, or read another project.
- A new key creates immutable version 1; an identical key is a no-op; semantic drift is reported
  for explicit owner versioning; omitted keys are never deleted, stopped, or deactivated.
- The route reuses the canonical flag parser, registry operation, audit and database function. It
  does not create a second flag store or a second mutation pipeline.
- The write seam is protected by a born-OFF `FLAG_DEFINITION_SYNC_ENABLED` root gate. Schema/admin
  inspection and runtime snapshot serving remain independent.
- Tenant, wrong-scope, revoked-key, duplicate-key, malformed/oversize catalog, idempotency, drift,
  omission and activation-unchanged properties are pinned at HTTP and database layers.

**Risk:** high — new authenticated control-plane mutation boundary and shared SDK contract.

## Story 4.3 — Make Miyagi an evergreen consumer

**As the** Miyagi operator, **I want** each independently deployed service to synchronize its own
catalog fragment, **so that** frontend and backend releases stay independent while shared flags
cannot silently disagree.

**Acceptance:**

- Frontend and backend each run an explicit `flags:sync` operator/deployment command with their own
  revocable project-scoped sync credential. It is not a build side effect and runtime startup does
  not depend on it.
- Catalog fragments are additive: identical shared definitions no-op, conflicting shared metadata
  fails loudly, and one service omitting another service's key never deletes or deactivates it.
- Frontend/backend conformance specs prove matching metadata for every commonly enforced key.
- Failure is loud in the rollout rail while both services continue to serve last-known Golden state
  or their declared defaults.
- Golden's hardcoded 40-key Miyagi importer is removed after the generic rail proves catalog parity.
- No direct write to Miyagi `platform_flags` is reintroduced.

**Risk:** high — cross-repository SDK rollout and independently deployed consumers.

## Story 4.4 — Operationalize the owned-shop kill switch without darkening it

**As the** Miyagi product owner, **I want** `catalog.owned_shop_only_enabled` managed in Golden,
**so that** I can deliberately turn the policy OFF or back ON without a code deployment while its
normal live state remains ON.

**Acceptance:**

- Its application contract remains `default: true`, `polarity: killswitch`, high criticality and
  frontend+backend enforcement.
- Sync registers it as a draft; an owner activates the ON version in Production through the normal
  Golden lifecycle path.
- The production activation begins ON and ends ON. The feature is never toggled OFF in Production
  as part of proof.
- Frontend and backend converge on the new Golden snapshot and resolve the key from Golden rather
  than the compile-default fallback.
- Checkout admission remains `owned_shop_only_enabled=true` and `admitted=true` before and after.
- The flag appears in Golden's manager and Miyagi `/admin/flags`, with immutable lifecycle audit.

**Risk:** high — production flag activation on a commerce policy; owner-approved rollout only.

## Story 4.5 — Make the written contract true

**As the** next builder, **I want** the poster, epic, retrospective, learnings and team memory to
describe the evergreen rail, **so that** a correct local fallback is never mistaken for an accepted
unmanaged exception.

**Acceptance:**

- Remove the stale enablement/default-OFF comment in Miyagi's frontend flag seam.
- Replace every owned-shop “default-only exception” claim with the final managed state.
- Record the durable rule: typed local defaults are required resilience; a live key permanently
  absent from the control plane is not an intended end state.
- Regenerate derived build-order/docs through their scripts; never hand-edit generated boards.

**Risk:** low — factual closeout, after runtime proof.

## Rollout order

1. Merge/deploy Golden schema, sync credential/route, SDK changes and navigation with
   `FLAG_DEFINITION_SYNC_ENABLED` OFF.
2. Apply the additive Golden migration separately and prove the linked ledger.
3. Release the SDK and update both Miyagi services with their independent catalog publishers.
4. Mint a scoped Miyagi sync credential, flip `FLAG_DEFINITION_SYNC_ENABLED` through a reviewed
   Git-tracked deployment, then run the union-catalog sync.
5. Confirm catalog parity, create the owned-shop draft and activate its ON version.
6. Confirm both Miyagi services converge and checkout admission stays live.
7. Browser-smoke the Tasks link and page. `SIGNALS_ENABLED` was verified live before implementation:
   the production task route returns the authenticated-path `307 /login`, not its dark `404`.
8. Remove the obsolete Miyagi-specific importer only after parity evidence exists.

Rollback is gate OFF plus credential revocation. Existing flag serving, snapshots, activations and
application defaults continue independently; the additive definition/audit rows remain.

## Verification gate

- Golden deterministic gate in CI order, including local Supabase HTTP/property specs.
- Miyagi frontend and backend deterministic gates plus catalog conformance.
- Preview browser smoke of `/app` → Flags and Tasks.
- Production property proof of scoped sync, ON activation, snapshot convergence and checkout
  admission. No production OFF test of the owned-shop feature.
- Cross-family Agy review for each Codex-built high-risk PR; an additional independent review for
  credential/migration changes if the first review exposes a tenancy or mutation-boundary concern.
