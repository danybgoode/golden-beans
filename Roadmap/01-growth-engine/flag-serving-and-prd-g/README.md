---
status: in-progress
slug: flag-serving-and-prd-g
---

# Epic: Flag control plane + Miyagi migration + resilience/SecOps

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/flag-serving-and-prd-g.md`](../../00-ideas/seeds/flag-serving-and-prd-g.md)

## Why

Golden Beans becomes the operational control plane Miyagi was always meant to consume: one owned
system for typed flags, governed experiments, telemetry, signals and evidence-backed action.
Miyagi migrates its complete current flag inventory without behavior drift, then dogfoods bounded
resilience and defensive-security scenarios whose product cost can trigger explicit, auditable
circuit-breaker policy.

## Medusa-first note

Medusa and Miyagi continue to own commerce enforcement and safe fallbacks. The frontend and backend
already concentrate flag reads behind `isEnabled()` and share `platform_flags`; E5 replaces the
provider behind those seams, not the business rules. Golden Beans owns flag definition,
evaluation, experiment binding and breaker evidence. A Golden flag can authorize a commerce path,
but Medusa remains the final enforcement point.

## Product contract

- Golden Beans is the source of truth for every migrated Miyagi feature flag.
- Evaluation is typed, project/environment scoped, deterministic and local from a versioned
  snapshot; the caller always supplies or declares a safe default.
- Flag definitions and activations are versioned/audited; experiment definitions bind immutable
  flag versions.
- Miyagi's local table becomes a read-only durable last-known mirror and rollback source.
- Resilience/security scenarios use closed templates, registered targets, environment, cohort, TTL,
  caps, abort conditions and immutable ownership.
- Automatic breakers can only perform a pre-authorized protective transition on their bound flag,
  never arbitrary mutation or automatic reenable.
- Miyagi proves the system on production infrastructure with internal/synthetic subjects while
  pre-launch. The system supports later bounded external cohorts without another architecture.

## What already exists (reuse, don't rebuild)

- `apps/web/lib/auth.ts` — hashed credential to project identity.
- `apps/web/lib/experiment-definition.ts` and experiment lifecycle/query libraries — immutable
  versions, local assignment inputs, integrity, metrics, segments and decisions.
- `packages/sdk/src/bucketing.ts` — deterministic local hashing.
- `/api/v1/track`, SDK `trackExposure()` and `captureError()` — canonical fact ingest.
- `apps/web/lib/{signals,tasks,friction-*}.ts` — evidence bundles, prioritization and tasks.
- Staged `agent_write` credentials — manual task claim/resolve, not generic flag mutation.
- Miyagi `apps/miyagisanchez/lib/flags.ts` and `apps/backend/src/lib/flags.ts` — unchanged
  `isEnabled()` interfaces, explicit defaults, bounded never-throw caches.
- Miyagi `platform_flags` and `/admin/flags` — import source, parity oracle and later fallback mirror.
- Event destination router — lifecycle fan-out without a new integration pipeline.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | Typed project flag control plane and local evaluation provider | high |
| 2 | Complete behavior-preserving Miyagi migration and dogfood | high |
| 3 | Live-capable resilience/SecOps scenarios and policy-bound circuit breakers | high |

## Runtime gates

Root bootstrap gates remain environment-backed to avoid the control plane gating itself:

- `FLAG_SERVING_ENABLED` — enablement, default OFF; gates snapshot serving and operational
  activation, not schema/admin inspection.
- `RESILIENCE_SCENARIOS_ENABLED` — enablement, default OFF; gates scenario execution and fault
  payload delivery.
- `SECURITY_SIMULATIONS_ENABLED` — enablement, default OFF; gates the defensive simulation runner.
- `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` — enablement, default OFF; manual breaker actions remain
  available while automatic transitions are disabled.

Each flag/scenario also has its own status. Environment changes require a new Git-tracked Golden
Beans deployment; never use a manual Vercel deploy.

## Single-session execution topology

1. **Coordinator foundation:** lock tables, TypeScript schemas, credential classes, targeting
   operators, fallback semantics, gates and cross-repo cutover state machine. Commit this shared
   contract before parallel work.
2. **Bounded builders:** delegate disjoint SDK/provider, Golden admin/API and Miyagi adapter/spec
   packages. No two builders own the same schema, migration or shared barrel.
3. **Coordinator integration:** re-derive diffs, run mutation checks and both products' deterministic
   gates, then complete shadow parity before allowing cutover work.
4. **Scenario builders:** after flag/evaluation contracts are stable, delegate closed executor,
   security templates and read-only impact UI as separate packages.
5. **Coordinator live proof:** apply migrations separately, prove every OFF state, cut over Miyagi
   in order and run the internal production-infrastructure exercises. One high-risk PR per repo is
   preferred; the sprints are checkpoints inside one session, not calendar promises.

## Deploy order

1. Golden additive schema, credential class, SDK and admin/API with all four gates OFF.
2. Apply Golden Supabase migrations separately; prove tenant isolation and OFF behavior.
3. Deploy Miyagi shadow adapters in frontend and backend with local provider still authoritative.
4. Reach zero explained mismatches; enable Golden provider for a safe flag, then non-critical set.
5. Cut over critical flags only after frontend/backend snapshot versions match and named commerce/
   auth smoke passes. Keep local mirror fallback.
6. Deploy scenario registries/executors dark; apply their migration separately.
7. Run internal/synthetic Miyagi production proof, then decide each runtime gate independently.

Rollback is gate OFF and Miyagi provider-mode fallback to its last-known mirror/defaults. Stop or
expire active scenarios, disable automatic breakers, and restore a prior immutable flag activation
pointer. Additive schema and canonical telemetry facts remain.

## Definition of Done (epic)

- [ ] All three sprints merged to `main` in Golden Beans and required Miyagi repos + smoke-tested
- [ ] Golden and Miyagi migrations applied separately and matched to deployed commits
- [ ] Every current Miyagi flag imported; shadow comparison has zero unexplained mismatches
- [ ] Frontend/backend report the same active snapshot; critical-path rollback smoke passes
- [ ] One internal fault drill and one closed defensive simulation run on production infrastructure
- [ ] One manual breaker decision and one safe test-flag auto-trip preserve evidence; no auto-reenable
- [ ] External-user activation remains OFF unless Daniel explicitly records the decision
- [ ] Each `sprint-N.md` has its real smoke walkthrough and commit/PR refs
- [ ] `RETROSPECTIVE.md` written; poster and durable learnings updated
- [ ] This README frontmatter set to `status: shipped`; run `node scripts/build-order.mjs`
- [ ] Feature branches/worktrees deleted after merge
