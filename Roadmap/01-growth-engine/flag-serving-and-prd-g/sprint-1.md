# Flag control plane + Miyagi migration + resilience/SecOps — Sprint 1: Typed project flag control plane

**Status:** ✅ Code merged, deployed and migrated — [PR #39](https://github.com/danybgoode/golden-beans/pull/39)
(`bc1abba`, 2026-07-27). Flag serving was subsequently enabled through the tracked Sprint 2 cutover;
the authenticated owner-browser walkthrough remains a named close-out smoke item.

## Stories

### Story 1.1 — Versioned typed flag registry

**As a** project owner, **I want** typed flags with immutable versions, environments, variants and
bounded targeting, **so that** runtime decisions are reviewable, reproducible and tenant-safe.

**Acceptance:** additive Postgres and TypeScript schemas agree on boolean/string/number/structured
values; key + environment are unique within a project; versions are immutable; activation uses
optimistic concurrency; rule priority is deterministic; only exact/one-of matching and fractional
rollout are accepted; unknown keys/operators/fields and oversized payloads are rejected; audit
names actor, old/new version and reason; project A cannot read or mutate project B.

**Risk:** high

### Story 1.2 — Revocable snapshot read and local evaluator

**As an** application server, **I want** a scoped immutable snapshot and synchronous evaluator,
**so that** flag checks add no network dependency to a request.

**Acceptance:** a revocable `flag_read` credential is project + environment scoped and cannot
ingest, administer or cross tenants; the ETag/versioned snapshot contains no secret/member data;
bounded/deduplicated refresh preserves last-known good; evaluation is synchronous and returns
typed value, variant, reason, version and metadata; type mismatch, missing flag, stale/unavailable
provider and invalid context return the declared safe default/details rather than throwing.

**Risk:** high

### Story 1.3 — OpenFeature-compatible SDK/provider contract

**As an** application builder, **I want** a standards-shaped provider facade, **so that** Golden
Beans is replaceable at the call boundary without outsourcing its data model.

**Acceptance:** `@golden-beans/sdk` exposes typed boolean/string/number/structure resolution,
evaluation context and details/reasons compatible with OpenFeature semantics; legacy `bucket()`,
`track()`, `syncFeatures()` and `trackExposure()` behavior is unchanged; no ingest credential is
bundled into a browser; provider initialization/refresh/shutdown are testable and bounded.

**Risk:** high

### Story 1.4 — Owner lifecycle UI/API and experiment binding

**As a** project owner, **I want** to draft, validate, activate, stop and inspect flags and bind an
immutable version to an experiment, **so that** flags and measurement form one governed loop.

**Acceptance:** membership/role-gated UI/API resolves project server-side; every mutation validates
the closed schema and emits audit; `FLAG_SERVING_ENABLED=OFF` prevents operational snapshot
activation/serving while definitions remain inspectable; legacy experiments remain readable and
running; a bound experiment can only reference a same-project compatible flag version/variants.

**Risk:** high

## Sprint QA

- **api specs:** typed schema parity/mutation checks; two-project isolation; credential matrix;
  ETag/304 and monotonic snapshot versions; stale/unavailable/default matrix; lifecycle concurrency;
  legacy experiment compatibility.
- **unit specs:** deterministic rule ordering, context normalization, fractional rollout, typed
  default resolution and provider lifecycle.
- **browser smoke owed:** yes, to Daniel — owner flag lifecycle and immutable audit; no commerce
  smoke yet because Miyagi is still local-authoritative.
- **deterministic gate:** `npx tsc --noEmit -p apps/web` + `npm run build` + Playwright `api` green;
  mutation-check the auth, tenant-isolation, OFF-gate and type/default specs.

## Sprint 1 — Smoke walkthrough

Env: production · Golden Beans production URL

1. With `FLAG_SERVING_ENABLED` OFF, open the owner flag area and create a disposable draft.
   → Draft/audit are visible; snapshot serving remains unavailable.
2. Use project A's `flag_read` credential to request project A's environment snapshot, then request
   project B's flag.
   → A receives only its versioned snapshot; B is unavailable with no leaked metadata.
3. Evaluate boolean/string/number/structure fixtures locally, then make Golden unavailable.
   → Values/reasons are typed; last-known/default resolution never throws or blocks a request.
4. Bind a disposable flag version to a governed experiment and inspect it.
   → The exact flag/definition versions round-trip; an incompatible or cross-project bind fails.

If any step fails, record the step, credential class, snapshot version and observed fallback.

## Execution record — 2026-07-27

- PR #39 passed the full GitHub static and Playwright gates, its Vercel preview, and the
  Antigravity cross-family review with no findings before merge.
- The seven additive migrations (`20260807100000` through `20260807160000`) were applied separately
  to the linked production Supabase project and its migration ledger matches the repository.
- Production smoke: `GET /api/v1/flags/snapshot` on
  `https://golden-beans-gamma.vercel.app` returned the expected flat `404` while
  `FLAG_SERVING_ENABLED` remains OFF. This proves the dark boundary only; it is not a Miyagi
  migration or an owner UI proof.
- `@golden-beans/sdk@0.1.0` was packed and publish-verified, but public npm release is blocked only
  by the workstation lacking an npm login. Do not substitute a private registry or a copied SDK in
  Miyagi; authenticate then publish the tested artifact.

## Re-entry note — 2026-08-01

- The dark-boundary statement above is the Sprint 1 historical state, not the current runtime state.
  `FLAG_SERVING_ENABLED` is now ON and both Miyagi services consume the Golden production snapshot.
- The later SDK work shipped as tag `sdk-v0.2.0` and is adopted by the Miyagi frontend and backend.
- The owner UI remains protected by Clerk. An unauthenticated redirect/access check passed, but the
  real signed-in lifecycle/audit walkthrough still requires Daniel's production browser session.
