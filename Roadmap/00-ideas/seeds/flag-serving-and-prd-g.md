---
title: "E5 — Flag control plane + Miyagi migration + resilience/SecOps circuit breakers"
slug: flag-serving-and-prd-g
status: scaffolded
area: "01"
type: feature
priority: "#5"
risk: high
epic: "01-growth-engine/flag-serving-and-prd-g"
build_order: "#5"
updated: 2026-07-27
---

# Scope — E5 Flag control plane + PRD-G

## Mirror-back

Golden Beans began as the owned replacement for Flagsmith and grew toward a unified PostHog +
GrowthBook-style operating system. Finish that original arc: Golden Beans becomes Miyagi's
project-scoped flag control plane, Miyagi migrates every current flag without changing behavior,
and the same governed evaluation plane powers bounded resilience and security simulations whose
technical results are connected to product outcomes. Signals may trip policy-bound circuit
breakers; they do not mutate arbitrary customer state.

Miyagi is the first real consumer and must be integrated throughout. Both products are pre-launch,
so the build optimizes for a strong end-state and fast cutover rather than long compatibility
periods, while production exercises use internal/synthetic subjects until real customer traffic
exists.

## Classification

**Feature / Builder, high risk.** This crosses the engine schema, SDK, tenant auth, Miyagi frontend
and backend flag readers, money/auth/checkout gates, intentional fault execution and controlled
security traffic. It is one epic built in one frontier-coordinated session, with three integration
waves rather than calendar sprints.

## Outcome & signal

After this ships:

1. a project owner can define, version, target, activate, audit and evaluate typed flags in Golden
   Beans;
2. Miyagi's existing `isEnabled()` call sites in both apps resolve from Golden Beans while keeping
   their exact defaults, polarity, bounded cache and never-throw behavior;
3. Miyagi's current `platform_flags` rows are a read-only durable fallback/migration mirror rather
   than the operational source of truth;
4. a closed resilience or security scenario can run against an approved Miyagi surface with an
   environment, cohort, TTL, caps, abort conditions and immutable owner;
5. exposures, errors, friction and business outcomes use the canonical telemetry/experiment/
   signal/task seams; and
6. a breaker can move only an explicitly authorized Golden flag to its predeclared safe value,
   preserve evidence, never auto-reenable, and remain human-confirmed wherever policy requires.

Daniel's acceptance proof is a current-state flag inventory, zero-diff shadow comparison, staged
Miyagi cutover, one live-infrastructure internal fault drill, one closed-template defensive
simulation, one manual breaker decision and one auto-trip on a deliberately safe test flag. The
money/auth/checkout paths receive explicit parity and rollback smoke; no external shopper or
unregistered target is attacked.

## Stage-2.5 bucket

- **Already possible:** Golden Beans has project auth, deterministic local experiment assignment,
  governed experiment versions/lifecycle, exposure/outcome analysis, signals/tasks, staged agent
  writes and immutable decisions. Miyagi has one server-only `isEnabled()` seam in each app, a
  60-second bounded cache, explicit defaults/polarities, an audited `/admin/flags`, and an owned
  `platform_flags` table.
- **Light enhancement:** an OpenFeature-compatible provider facade, an experiment-to-flag binding,
  a resilience-impact lens over canonical analysis, and a Golden-backed Miyagi admin surface can
  sit on the existing seams.
- **Genuinely new:** a typed/versioned flag registry, environment snapshots and evaluation
  credentials; bounded targeting; durable local evaluation/fallback; cross-repo shadow migration;
  governed fault/security scenario registries and executors; and policy-bound breaker mutation.

## Product and architecture decisions

1. **Golden Beans owns flags.** Flags are first-class project-scoped control-plane records, not
   overloaded feature-registry rows or experiment definitions. Boolean, string, number and
   structured values are supported with immutable versions, variants, environments, ownership,
   lifecycle and audit.
2. **OpenFeature-compatible, Golden-defined wire contract.** The SDK exposes typed resolution,
   caller-supplied defaults, evaluation context and resolution details compatible with OpenFeature.
   OpenFeature does not prescribe a flag-definition language or wire protocol, so Golden Beans
   owns a deliberately small schema: exact/one-of context matching, ordered rules and deterministic
   fractional rollout. No arbitrary expression language in v1.
3. **Local/cached evaluation is the critical path.** A project/environment-scoped read credential
   fetches an immutable, ETag/versioned snapshot; the SDK evaluates synchronously from memory.
   Refresh is bounded and deduplicated. Timeout/unavailability returns the caller's declared
   default or the last-known snapshot according to flag policy—never a request failure.
4. **Server-first matches the real consumer.** Miyagi's flag reads are currently server-only, so
   no ingest key enters a browser. Credential classes leave room for a revocable, read-only client
   evaluation token later, but E5 does not expose server-only rules or secrets merely to claim a
   browser SDK.
5. **Experiments bind to flags; they do not duplicate them.** A governed experiment references an
   immutable flag/version and its variants. Assignment, exposure, SRM, segments, primary/
   guardrail metrics and decisions remain the canonical experiment machinery.
6. **Miyagi migrates in place.** Preserve `isEnabled(flag)` call sites and every current default.
   Import current rows, shadow both providers, investigate every mismatch, cut over safe flags,
   then the complete inventory. Miyagi's local table becomes an automatically refreshed read-only
   last-known mirror; direct admin writes stop after cutover.
7. **Faults are typed flag values plus scenario policy.** Closed payloads may request `none`, a
   bounded delay, a synthetic application error or another separately approved closed template.
   Fetching/evaluating never applies a fault: an explicitly instrumented seam invokes it.
8. **Security simulations are a closed target/template system.** Targets must be tenant-registered
   and ownership-verified; templates have hard request/rate/concurrency caps. No arbitrary URL,
   header, credential, script, SQL, traffic amplification or third-party identity-provider attack.
9. **Live capability is in scope; unsafe activation is not.** Production environment, real cohort
   targeting, TTL, emergency stop and guardrails ship now. While Miyagi is pre-launch, production
   proof is limited to internal/synthetic subjects. Enabling an external-user cohort later is a
   recorded owner action, not a new engineering epic.
10. **Automatic mutation is policy, not a generic write tool.** A breaker may only move its bound
    Golden flag in the protective direction to a predeclared safe value, from canonical evidence,
    with minimum sample/integrity thresholds, cooldown and an immutable audit. It never auto-
    reenables. Money/auth/checkout flags require confirmation unless an owner has explicitly
    approved an immutable emergency-trip policy with independent backend enforcement.
11. **Golden Beans bootstrap gates remain environment-backed.** The control plane cannot safely
    gate its own root availability. `FLAG_SERVING_ENABLED`, `RESILIENCE_SCENARIOS_ENABLED`,
    `SECURITY_SIMULATIONS_ENABLED` and `AUTOMATIC_CIRCUIT_BREAKERS_ENABLED` are independent,
    born-OFF environment enablement gates; scenario/flag status provides finer control.

## Scope

### Wave 1 — typed flag control plane

- Project/environment-scoped flag definitions, immutable versions, variants, bounded targeting,
  activation pointer, audit history and optimistic concurrency.
- Revocable `flag_read` credential class and tenant-scoped ETag snapshot API.
- Framework-agnostic local evaluator and OpenFeature-compatible provider facade in
  `@golden-beans/sdk`, with typed details/reasons, defaults and bounded refresh.
- Owner UI/API for flag lifecycle and safe mutation; no request-derived project id.
- Experiment definitions can bind an immutable flag version without changing legacy experiments.

### Wave 2 — Miyagi migration and dogfood

- Inventory and idempotently import every frontend/backend `platform_flags` row with its current
  live value, default, polarity, description and criticality.
- Shadow evaluation and parity report across Golden/local/default paths, including outage,
  stale-cache, absent-row and malformed-snapshot cases.
- Preserve both `isEnabled()` public interfaces; replace only their provider internals. The
  frontend and Medusa backend resolve the same Golden snapshot and retain independent bounded
  caches.
- Convert `/admin/flags` into a Golden-backed owner surface/proxy; stop direct operational writes
  to `platform_flags`.
- Cut over one safe flag, then all non-critical flags, then money/auth/checkout flags after named
  smoke. Keep the local table as a read-only durable last-known mirror and rollback source.
- Emit flag-evaluation/exposure facts through `/api/v1/track` with sampling/deduplication; never add
  another event pipeline.

### Wave 3 — PRD-G resilience, SecOps and circuit breakers

- Governed scenario registry referencing immutable flag/experiment versions, approved target,
  environment, cohort, TTL, caps, guardrails, owner and emergency stop.
- Closed fault helper plus one explicitly instrumented Miyagi internal/preview surface; control is
  always a no-op and no scenario executes merely because it was evaluated.
- Closed security templates for malformed-input defense, bounded rate-abuse defense and revoked/
  invalid-credential behavior against registered Golden/Miyagi targets.
- Canonical product-impact lens joining experiment integrity/primary/guardrail results with
  errors, friction, tasks and immutable decisions.
- Manual and automatic breaker policies with protective-only transitions, evidence, cooldown,
  confirmation class and no automatic reenable.
- Production-infrastructure dogfood using Miyagi internal/synthetic subjects, followed by an
  activation runbook for a future bounded external cohort.

## Explicitly out

- A second telemetry, experimentation, signal, task, reporting or delivery pipeline.
- Caller-supplied project ids on evaluation, mutation, scenario or result reads.
- Request-time remote evaluation on critical Miyagi paths when no local snapshot/default exists.
- Arbitrary targeting code, arbitrary fault code, general load testing or arbitrary attack targets.
- Credential stuffing, CAPTCHA bypass, destructive data mutation, resource exhaustion or attacks
  on Clerk/another third party without that provider's explicit testing authorization.
- Generic MCP access to mutate a flag by caller-chosen key/value.
- Automatic winner rollout or automatic breaker reenable.
- Claims that an internal pre-launch drill proves real customer impact, capacity or security.

## Current seams to reuse

| Capability | Current seam | E5 use |
|---|---|---|
| Tenant identity | `apps/web/lib/auth.ts` | Resolve project from hashed credential, never request body |
| Feature registry | `apps/web/lib/feature-schema.ts` | Keep analytics feature metadata separate from runtime flags |
| Local assignment | `packages/sdk/src/bucketing.ts` | Preserve deterministic version-aware hashing |
| Experiment governance | `apps/web/lib/experiment-definition.ts`, experiment lifecycle/query libs | Bind flag versions; reuse integrity, metrics and decisions |
| Telemetry | `/api/v1/track`, SDK `trackExposure()`/`captureError()` | Record evaluations, exposures and induced outcomes once |
| Signals/tasks | `apps/web/lib/{signals,tasks,friction-*}.ts` | Promote real guardrail evidence and track mitigation |
| Agent writes | staged `agent_write` propose/confirm/apply | Manual task lifecycle only; breaker mutation has a closed policy API |
| Miyagi flag seam | `apps/miyagisanchez/lib/flags.ts`, `apps/backend/src/lib/flags.ts` | Keep `isEnabled()` and its failure contract |
| Miyagi current store | `platform_flags`, `/admin/flags` | Import, shadow, then retain as read-only last-known mirror |
| MADMEN strategy | Miyagi strategy-to-product activation plan | Dogfood seller-first/internal before public acquisition traffic |

## Research anchors

- OpenFeature specifies typed resolution, caller defaults, evaluation context and provider
  lifecycle, while explicitly leaving definition storage/wire protocols to providers:
  [provider contract](https://openfeature.dev/specification/sections/providers/),
  [evaluation context](https://openfeature.dev/specification/sections/evaluation-context/), and
  [definition/protocol scope](https://openfeature.dev/blog/flag-definition-flag-evaluation-protocol-standardization/).
- GrowthBook's current model validates local SDK evaluation plus feature flags and experimentation
  as one product surface: [GrowthBook documentation](https://docs.growthbook.io/).

## Single-session assembly line

The frontier coordinator owns the schema, credential boundary, targeting semantics, fallback
contract, cross-repo migration order and gates before delegating. Lower-model builders receive
disjoint, acceptance-closed packages only after those shared interfaces are committed. The
coordinator re-derives every change, runs both repos' gates and performs the production dogfood;
builder completion messages are not evidence. The three waves are integration/rollback checkpoints,
not separate long-lived sprint sessions.

## Open risks

- The existing experiment eligibility fields are not a general flag-targeting engine; E5 must add
  bounded rules rather than mislabel current code.
- A durable Miyagi mirror avoids cold-start dependence on Golden availability, but dual storage
  creates convergence risk; snapshot version, update monotonicity and stale observability are
  acceptance requirements.
- Frontend and backend deploy independently. Money-path cutover is not complete until both report
  the same snapshot version and the named end-to-end smoke passes.
- A production endpoint being owned by Daniel does not by itself make every attack safe. Registered
  target + closed template + cap + TTL + abort + audit are all required.
- The architecture is intentionally stronger than present traffic needs because Golden Beans and
  Miyagi are both pre-launch and can cut over without customer migration drag.
