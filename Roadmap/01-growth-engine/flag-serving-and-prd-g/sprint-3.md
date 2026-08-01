# Flag control plane + Miyagi migration + resilience/SecOps — Sprint 3: Resilience, SecOps and circuit breakers

**Status:** 🟡 implementation deployed and migrated; controlled production proof and gate cleanup
remain open

## Implementation evidence — 2026-08-01 re-entry audit

- Golden PR [#58](https://github.com/danybgoode/golden-beans/pull/58) merged the governed scenario
  registry, closed fault/security executors, canonical impact lens and policy-bound manual/automatic
  breakers. Its enabled-gate API suite covered 428 cases with 31 deliberate skips; the dark-gate
  suite, typecheck, lint and production build were also green.
- Golden PR [#59](https://github.com/danybgoode/golden-beans/pull/59) fixed migration-fixture entropy
  and tagged `sdk-v0.2.0`. PR [#61](https://github.com/danybgoode/golden-beans/pull/61) canonicalized
  PostgREST timestamps after the first controlled start exposed the offset-format mismatch.
- All five additive Sprint 3 migrations (`20260809100000` through `20260809140000`) are present in
  the linked production migration ledger. The current production deployment is commit `6118402`.
- Miyagi frontend #325 contains the fixed internal probe target and closed scenario executor;
  frontend #326 makes snapshot refresh request-driven. No caller can choose an arbitrary URL,
  payload, header or fault template.
- PR [#60](https://github.com/danybgoode/golden-beans/pull/60) recorded the prepared internal target
  and two run IDs, proved the OFF boundary, and supplied the Git-tracked deployment after enabling
  the three proof gates. It did not claim completed run, breaker or cleanup evidence.
- Re-entry boundary probes show resilience, security and automatic-breaker routes are currently
  enabled. The prepared runs, manual transition, safe auto-trip, stop/revoke cleanup and tracked
  return of all three proof-only gates to OFF are therefore the remaining Story 3.6 work.

## Stories

### Story 3.1 — Governed live-capable scenario registry

**As a** product owner, **I want** resilience/security scenarios reviewed before execution, **so
that** production capability has an explicit blast radius and owner.

**Acceptance:** an immutable scenario references same-project flag/experiment versions, a
registered target, environment, internal/external cohort, start/expiry, request/concurrency caps,
guardrails, abort thresholds and owner; missing/expired/stopped scenarios resolve to control;
external cohort and production security activation require an explicit owner record; both
scenario gates default OFF; cross-tenant or arbitrary target data is rejected.

**Risk:** high

### Story 3.2 — Closed fault payload and explicit Miyagi executor

**As a** Miyagi operator, **I want** a bounded fault injected only at an instrumented seam, **so
that** I can measure degradation without opening arbitrary execution.

**Acceptance:** closed values support `none`, capped delay and allow-listed synthetic error (any
additional template requires its own schema/spec); evaluation alone never executes; control is a
no-op; the executor requires active scenario + eligible subject + exact target; TTL/emergency stop
take effect within the snapshot bound; no arbitrary URL/code/header/query or resource exhaustion;
one internal Miyagi surface is instrumented and fully reversible.

**Risk:** high

### Story 3.3 — Closed defensive-security simulation runner

**As a** security owner, **I want** safe repeatable attack-defense checks, **so that** invalid input,
rate and credential controls are tested against live architecture rather than assumed.

**Acceptance:** targets are tenant-registered and ownership-verified; templates cover bounded
malformed payloads, rate-limit behavior and invalid/revoked credentials; caps, cooldown, abort and
audit are enforced server-side; no arbitrary targets/credentials, destructive payloads, CAPTCHA
bypass or third-party provider traffic; `SECURITY_SIMULATIONS_ENABLED=OFF` makes the runner
unreachable while preserving definitions/results.

**Risk:** high

### Story 3.4 — Canonical resilience/product-impact evidence

**As a** product owner, **I want** technical degradation explained through product metrics, **so
that** mitigation is based on business impact rather than error count alone.

**Acceptance:** the lens consumes canonical experiment integrity, primary/guardrail/segment
analysis plus existing errors/friction/tasks; no second aggregate or event table; synthetic/
internal/external cohorts are unmistakable; SRM, insufficient sample and missing outcome block a
causal claim; an immutable decision points to scenario, flag and evidence versions.

**Risk:** high

### Story 3.5 — Policy-bound manual and automatic breakers

**As a** product owner, **I want** verified guardrail failure to move a flag to its known safe value,
**so that** mitigation can be fast without granting arbitrary mutation.

**Acceptance:** policy binds one flag/version, protective value/direction, evidence resolver,
minimum sample/integrity, thresholds, window, cooldown, max trips and confirmation class; manual
action uses staged confirmation; automatic action is impossible while its root gate is OFF;
money/auth/checkout requires confirmation unless an immutable owner-approved emergency policy
explicitly permits the safe trip; every transition is compare-and-set and audited; it never
auto-reenables or mutates a caller-chosen key/value.

**Risk:** high

### Story 3.6 — Miyagi production-infrastructure proof and future activation runbook

**As the** owner of both pre-launch products, **I want** to exercise the real deployment safely,
**so that** launch does not become the first test of the architecture.

**Acceptance:** one internal/synthetic fault drill produces a non-zero technical difference and
canonical product-impact state; one defensive simulation observes expected guards; one manual
breaker decision and one auto-trip on a disposable safe flag preserve complete evidence; all
scenarios expire/stop and fixtures/credentials are cleaned; a runbook defines the later external-
cohort owner decision, max cohort, abort, communication and rollback without claiming customer
proof today.

**Risk:** high

## Sprint QA

- **api specs:** scenario tenant/target/lifecycle/TTL/cap/abort matrix; root OFF gates; closed fault
  mutation checks; security target/template rejection; breaker threshold/integrity/concurrency/
  cooldown/no-reenable; canonical resolver parity.
- **Miyagi specs:** control no-op; exact subject/target eligibility; snapshot-bound emergency stop;
  guarded route preserves normal behavior with all scenario gates OFF.
- **browser smoke owed:** yes, to Daniel — scenario setup/stop, evidence lens, manual confirmation,
  live internal Miyagi drill and full cleanup.
- **deterministic gates:** all Golden/Miyagi gates plus high-risk cross-family review; no load test
  or third-party security traffic in CI.

## Sprint 3 — Smoke walkthrough

Env: production infrastructure · Golden Beans + Miyagi, internal/synthetic subjects only

1. With both scenario gates OFF, create disposable fault and defensive scenarios.
   → Definitions/audit are inspectable; neither can execute.
2. Enable resilience scenarios through a Git-tracked deploy, start a short-TTL internal Miyagi
   control/delay or synthetic-error drill and exercise both cohorts.
   → Only eligible internal subjects receive the bounded fault; control stays normal; scenario
   expires/stops within the snapshot bound.
3. Inspect integrity, technical result, product metric state, task and decision.
   → Canonical evidence names scenario/flag/experiment versions and labels the cohort synthetic/
   internal; insufficient evidence does not overclaim.
4. Enable security simulations separately and run each closed template against its registered
   owned target under tiny caps.
   → Expected validation/rate/auth guards respond; audit/caps/abort are visible; no other host is
   reachable.
5. Apply one manual breaker transition, then arm one disposable safe test flag for automatic trip.
   → Manual confirmation is staged; the safe flag trips once with evidence/cooldown; neither
   automatically reenables.
6. Stop/expire scenarios, revoke disposable credentials, disable automatic/security gates and
   verify Miyagi's normal path.
   → No active scenario/test credential remains; normal behavior and flag evaluation persist.

If any step fails, use the scenario emergency stop, turn the relevant root gate OFF via the normal
Git-tracked deploy path, and preserve the failed-run evidence for the retrospective.
