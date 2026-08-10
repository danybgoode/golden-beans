# Production-infrastructure proof

## 2026-07-29 — activation record

Scope is pre-launch and internal/synthetic only. External cohorts remain unapproved and OFF.

- Golden production target: `miyagi.internal.probe` at `https://miyagisanchez.com`
- target ownership: signed challenge verified
- resilience run: `187c663c-74da-4000-b31c-a5a20b58be94`
- defensive-security run: `8324a5d2-1ff2-4aef-808d-4a32ceb369c1`
- both runs were prepared while root execution gates were OFF
- a resilience start attempt returned the expected flat `404`
- `RESILIENCE_SCENARIOS_ENABLED`, `SECURITY_SIMULATIONS_ENABLED`, and
  `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` were then set for Production

This commit is the required Git-tracked deployment that makes those Vercel environment values
available to running functions. It is not a manual Vercel deployment. The completed run evidence,
breaker transitions, stop/revoke cleanup, and gate-disable deployment are appended before epic
close.

## 2026-07-30 — completed internal production proof

The immutable tenant-scoped admin/evidence snapshots show that the proof was completed after the
activation record, although the roadmap ledger was not updated at the time. External cohorts remained
unapproved and OFF throughout.

### Resilience and canonical impact

- The originally prepared resilience run `187c663c-74da-4000-b31c-a5a20b58be94` finished `stopped`
  at revision `3`: two requests, two successful settlements, zero failures and zero active leases.
- The final integrity-valid evidence run `67ee5a3a-f984-41c0-86b7-605cd11d9754` also finished
  `stopped` at revision `3`, with the same bounded two-request/zero-active-lease result.
- Immutable impact record `630aae77-91f2-4266-99db-ec398ec0c426` labels the cohort `internal` and
  refuses a causal customer claim. Its technical lens measured control p95 `1 ms` versus fault p95
  `126 ms`, a non-zero `125 ms` difference. Canonical experiment analysis was integrity-ready,
  decision-ready and sample-met; the adverse primary-metric difference was `-10,000` basis points.

### Closed defensive simulation

- Prepared security run `8324a5d2-1ff2-4aef-808d-4a32ceb369c1` finished `stopped` at revision `3`:
  one request, one success, zero failures and zero active leases.
- Result `f6133b38-2317-4975-9789-bcea31728380` ran only the stored
  `malformed_payload_v1` template against `miyagi.internal.probe`. The registered target returned
  `400`; expected and observed outcomes both equal `validation_rejected`.

### Manual and automatic protective transitions

| Mode | Policy | Trip record | Snapshot | Protective flag |
|---|---|---|---:|---|
| manual | `manual_prd_g_20260729` | `499acb56-537c-45d0-888b-01e2e16fb43e` | `44 → 45` | `breaker.manual_prd_g_20260729` v2, default `off` |
| automatic | `auto_prd_g_20260729` | `3d2ca151-e35c-4ae4-9941-4e2580bad19c` | `45 → 46` | `breaker.auto_prd_g_20260729` v2, default `off` |

Both policies used the same immutable impact record. The automatic transition had the required
owner-preapproved emergency approval and recorded `system:automatic_breaker`; the manual transition
recorded the real Clerk actor. The current read snapshot is still version `46`, last updated by the
automatic trip, and both disposable flags still resolve to their protective `off` version. No later
activation or automatic reenable exists.

### Fixture cleanup

- Every scenario run is terminal with zero active leases.
- The registered proof target is `revoked`.
- Definitions, results, impact evidence, approvals, trip records and audit remain immutable by design.
- The live Miyagi `flag_read` and `flag_admin` credentials were existing operational credentials, not
  disposable proof keys, and remain in their server-only stores. No credential value was printed or
  persisted during the re-entry audit.

## 2026-08-01 — gate cleanup and re-entry verification

No missing implementation branch was found. Local re-verification passed typecheck, lint, 834 unit
tests, the 8-case dark-gate API suite, 429 enabled API tests (31 deliberate skips), and the production
build. The linked Supabase migration ledger matches all Sprint 3 migrations.

Daniel explicitly authorized the scoped proof inspection and gate cleanup. The three proof-only
Production variables were set to `false` using explicit Vercel CLI values; no manual deployment ran.
Agy-reviewed PR [#63](https://github.com/danybgoode/golden-beans/pull/63) merged as commit `e37db4f`,
and GitHub deployment `5705293596` completed successfully, causing Vercel to snapshot the new values.

| Boundary after deployment | Response | State |
|---|---:|---|
| `GET /api/v1/scenarios/snapshot` without a credential | `404` | resilience scenarios OFF |
| `POST /api/v1/scenarios/security` with an empty body | `404` | security simulations OFF |
| `POST /api/v1/breakers/automatic` with an empty body | `404` | automatic breakers OFF |
| `GET /api/v1/flags/snapshot` without a credential | `401` | flag serving remains ON |

The API-level production proof and cleanup are complete. The product-owner Clerk browser walkthrough
remains the only real-session confirmation because no browser was connected to this agent session.

## 2026-08-01 — evergreen catalog-sync activation record

The generic, tenant-scoped definition-sync route and its additive migration shipped first with
`FLAG_DEFINITION_SYNC_ENABLED` OFF in commit `f1bd1f5`. The Miyagi frontend and backend publishers
then passed their deterministic gates and independent Agy reviews before merging as `4e070cf` and
`6630c50` respectively.

`FLAG_DEFINITION_SYNC_ENABLED=true` is now present in Golden's Production environment. This commit is
the required Git-tracked deployment that makes the value visible to running Vercel functions; no
manual Vercel deployment is part of the rollout. Definition sync can only create or no-op immutable
drafts through a project-scoped, revocable `flag_sync` credential. It cannot activate a version or
change a serving snapshot, so enabling this route cannot darken an already-live feature.

After this deployment succeeds, the two service-owned catalogs are synchronized explicitly and the
resulting 41-key union, idempotent second run, unchanged production snapshot, and live owned-shop
resolution are appended here before removing the obsolete Golden-side Miyagi importer.

## 2026-08-01 — generic catalog sync and owned-shop activation (historical)

This section preserves the evidence as it was recorded on 2026-08-01. Its project-identity claim is
superseded by the 2026-08-09 correction below and must not be used to choose a current credential. At
the time, the runtime tenant was recorded as Golden project `miyagi`, while `miyagisanchez` was recorded
as a dormant duplicate not used for that cutover. The service-owned publishers were corrected to
preserve the exact immutable definitions then observed in `miyagi` before syncing:

- Frontend: `40 definitions (1 created, 39 unchanged)`; rerun `0 created, 40 unchanged`.
- Backend: `13 definitions (0 created)`; rerun `0 created`.
- The sync route remained additive-only: omitted keys were not deleted or deactivated, and no Golden
  whitelist was edited.

The existing live production read credential then proved the owned-shop definition at snapshot `47`:
definition version `1`, default `on`, polarity `killswitch`, criticality `high`, enforcement `both`.
The owner lifecycle activation changed the snapshot `46 → 47` and did not perform an OFF transition.
The feature therefore remained live throughout; an explicit OFF value is its deliberate protective
rollback.

The obsolete Golden-side importer was a one-time snapshot mechanism, not the ongoing registration
rail. It is removed after this parity and activation proof. Future Golden-powered projects publish
their typed catalogs through the generic project-scoped SDK route with a dedicated revocable
`flag_sync` credential.

## 2026-08-09 — owner-project identity correction

The current owner UI exposes `/app/flags/miyagisanchez` and no owner-visible `miyagi` project. This
entry supersedes the 2026-08-01 project-identity claim above: that historical claim must not be used to
choose a new credential.

A fresh, project-scoped `frontend` catalog-sync credential minted from
`/app/flags/miyagisanchez` reached an existing immutable catalog. The whole 41-definition Miyagi
publisher stopped atomically on HTTP `409` because at least one existing definition had semantic drift.
The operator did not bypass that conflict. A narrowed publish of the already-reviewed
`partners.recruiting_v3_enabled` entry returned `v1 created`, and an immediate identical rerun returned
`v1 unchanged`. Catalog sync cannot activate a version or change a serving snapshot, so registration
left the new definition dark and default-OFF. Its `source=miyagi` metadata names the publishing service;
it is not a Golden project identifier.

This proves `miyagisanchez` is the current owner-operated catalog. It did not by itself expose which
project the storefront's server-only production read credential resolved. Revoke the temporary sync
credential after owner inspection, and do not infer a project slug from either name by analogy again.

## 2026-08-10 — scoped runtime binding and v2 activation

The binding audit resolved the ambiguity without replacing a credential that already serves live flags.
The storefront's primary production read credential resolves an owner-invisible snapshot `47` containing
43 active decisions and no `partners.recruiting_v3_enabled` definition. At the same time, the owner-visible
`miyagisanchez` production catalog initially had snapshot `3` and only two active decisions. A wholesale
credential swap would therefore have made unrelated flags disappear from the runtime.

Storefront PR [#350](https://github.com/danybgoode/miyagisanchezcommerce/pull/350) (`5d4df0c`)
introduced a narrower binding: only the exact recruiting flag uses a dedicated `miyagisanchez` read
credential; all other definitions continue through the primary provider. Project-relative snapshot
versions from the scoped provider are excluded from the shared durable mirror. The credential is stored
server-side in Secret Manager and bound to Cloud Run revision `miyagi-web-00069-kbd`, deployed at 100%
traffic by successful Cloud Build `da67c055-6a93-4254-959c-eef644420bd2`.

Activating version `1` in all three environments still evaluated OFF because its immutable definition had
`defaultVariantKey=off` and no rules. Activation chooses the authoritative version; it does not override
that version's decision semantics. Version `2` preserved the definition and variants and changed only the
default to `on`. It is active in development snapshot `3`, preview snapshot `3` and production snapshot
`4`; version `1` remains the immediate default-OFF rollback.

The production authority log then resolved `partners.recruiting_v3_enabled` from Golden snapshot `4`,
definition version `2`, with `source=golden`, `reason=STATIC` and `matchesLocal=false`. A real Chromium
smoke of `https://miyagisanchez.com/us` returned HTTP `200`, rendered the complete founding-operator
application and recorded zero console errors. This closes the server-only binding proof: for this exact
flag, the production runtime and current owner UI both use project `miyagisanchez`, while the legacy
43-decision catalog remains intact for every other flag.
