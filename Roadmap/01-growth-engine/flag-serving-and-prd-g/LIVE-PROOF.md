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

## 2026-08-01 — generic catalog sync and owned-shop activation

The live runtime tenant is Golden project `miyagi`. The similarly named `miyagisanchez` project is a
dormant duplicate and was not used for the production cutover. The live service-owned publishers were
corrected to preserve the exact immutable definitions already present in `miyagi` before syncing:

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
