---
title: "Experiment governance v2 — registry, metrics, guardrails, and decision record"
slug: experiment-governance-v2
status: scaffolded
area: "01"
type: feature
priority: "#2c"
risk: high
epic: "01-growth-engine/experiment-governance-v2"
build_order: "#2c"
updated: 2026-07-21
---

# Scope — Experiment governance v2 — registry, metrics, guardrails, and decision record

## Outcome & signal

As a product team, I want every experiment to start from a declared hypothesis and trustworthy measurement
contract, expose assignment/data-quality problems while it runs, and end with an auditable human decision, so
that Golden Beans helps us learn rather than merely display variant lift.

Daniel can test the result with the first Tiendas Fundadoras message/CTA experiment. Before exposure, the
experiment names its owner, hypothesis, eligible population, assignment unit, variants/allocation, primary
metric, guardrails, planned window and minimum sample guidance. During the run, Golden Beans must join normal
untagged conversion events to exposures by opaque subject id, flag a deliberately induced sample-ratio mismatch
and cross-variant exposure, and keep results visibly untrustworthy until diagnosed. At close, the owner records
an immutable `ship treatment`, `keep control`, `iterate`, `inconclusive` or `invalid` decision with rationale;
no rollout occurs automatically.

## Classification and Stage-2.5 bucket

**Feature / Builder. Genuinely new governance layer over shipped assignment and comparison.** The SDK already
does deterministic local weighted bucketing, records `experiment_exposed`, and computes basic lift by joining
realistic conversion events to exposed users. There is no experiment registry, semantic control variant,
lifecycle, guardrail metric, sample-ratio or exposure-integrity diagnostic, segmentation contract, owner or
durable decision record. This epic extends those primitives; it does not replace their event stream.

## Recommended experiment/flag boundary

Golden Beans v2 **does not serve flags or remote assignment**. The product still decides eligibility and
on/off exposure with its own feature flags; the SDK still buckets locally with caller-supplied variants. The
registry declares the intended assignment contract and analysis semantics. Golden Beans compares observed
exposures against that declaration, reports violations and can mark results untrustworthy, but it never rejects
an exposure event or changes a customer's runtime variant. A later flag-serving migration remains separate
backlog item E5a.

## Scope

**In v2:**
- A per-project, versioned experiment registry: stable key, owner, hypothesis, status, assignment entity type,
  eligibility description/bounded cohort rule, semantic control, variants and expected weights, primary metric,
  guardrail metrics, segment dimensions, planned start/stop and minimum sample guidance.
- Lifecycle `draft → running → stopped → decided`, plus `invalid`; assignment, variants and metrics become
  immutable once running and require a new version to change.
- Registry-aware analysis that preserves the v1 realistic-input rule: exposure events carry experiment/variant;
  primary and guardrail conversion events are joined by opaque subject id and do not need the experiment key.
- Data-quality diagnostics before interpretation: sample-ratio mismatch, unknown variant, missing/invalid
  subject, cross-variant exposure, duplicate exposure, out-of-window exposure, late event/source freshness and
  metric join coverage.
- Primary/guardrail variant results, declared minimum-sample status and bounded segment cuts over allow-listed
  low-cardinality exposure fields. Results remain descriptive/basic-lift; no automatic claim of certainty.
- Immutable owner decision records with result snapshot/version, guardrail disposition, rationale and timestamp.
- Owner-authenticated management, project-member reads, API read parity and read-only MCP parity through the
  existing connector gates.
- One Miyagi/Tiendas Fundadoras dogfood experiment after consent-safe acquisition and merchant activation events
  exist.

**Out of v2:**
- Remote flag serving, a resolve endpoint, server-side assignment, automated traffic ramping or winner rollout.
- Arbitrary SQL metrics, customer JavaScript, a visual query builder, warehouse joins or unrestricted
  high-cardinality segmentation.
- Sequential peeking claims, automated statistical significance/winner language, causal certainty from tiny
  samples, multi-experiment interaction analysis or a general power-analysis product.
- Mutating/deleting canonical exposure/conversion events or blocking ingest because governance is misconfigured.
- Public experiment-management routes. Existing demo reads remain demo-only through `assertPublicAllowedSlug()`.

## What already exists (reuse, don't rebuild)

| Existing capability | Reuse decision |
|---|---|
| `packages/sdk/src/bucketing.ts` | Keep deterministic sorted weighted local assignment; do not add a resolve service. |
| SDK `bucket()` + `trackExposure()` | Preserve backwards compatibility; add optional definition/version context without requiring a registry fetch. |
| `events` + event-router subject contract | Exposures and metrics remain canonical events joined by stable opaque subject id. |
| `apps/web/lib/ab.ts` | Extend the import-free comparison seam with explicit control/weights and diagnostics. |
| `apps/web/lib/ab-query.ts` | Preserve its two-query realistic-input rule: metrics need no experiment `feature_id`. |
| `/api/v1/experiments/:key/compare` + `/app/experiments/*` | Evolve the shared read resolver/UI instead of adding parallel reports. |
| `project_members` + `membership.ts`/`roles.ts` | Owners manage lifecycle/decisions; members read their projects. |
| Feature sync/registry pattern | Reuse schema validation/versioning conventions; experiments remain a distinct registry. |
| MCP `compare_experiment` | Extend read output behind `CONNECTOR_ENABLED` + revocable project token; no MCP mutation in v2. |
| `entity-journeys-projections` | Reuse stable entity/cohort vocabulary and bounded segment/freshness semantics after its contract settles. |

## UX heuristics & rails check

- **CI guards:** TypeScript/build + API specs; pure fixtures must cover realistic untagged conversions, SRM,
  cross-variant subjects, late events, exact window boundaries, zero exposure and telemetry loss/degraded state.
- **Trust rail:** results cannot be labeled decision-ready while SRM or a blocking exposure-integrity failure is
  open. A warning links to observed/expected counts and diagnostic guidance; it never silently suppresses rows.
- **Decision rail:** separate observation from interpretation. Show counts/rates/basic lift, data quality,
  sample guidance and guardrails before the decision action; never render `winner` automatically.
- **Security/privacy rail:** experiment keys and low-cardinality dimensions only in URLs/MCP; subject ids are
  paginated/redacted by default; no contact data, raw notes or unrestricted metadata segments.
- **Design debt:** reuse the authenticated `/app/experiments` and existing connector; no broader app redesign.

## Kill-switch / runtime gate (risk: high — Stage 6b)

Recommend `EXPERIMENT_GOVERNANCE_ENABLED` as an **enablement** environment gate in `lib/flags.ts`, default
**OFF** and created disabled in preview/production. It gates registry lifecycle mutations, governance-aware UI
and extended MCP output. Existing SDK bucketing, exposure ingest and v1 comparison remain available when OFF,
providing rollback without losing data. Additive registry/decision migrations use expand/contract and remain in
place. Vercel env changes require a new Git-tracked deployment before the behavior changes live.

## Delivery slices and acceptance criteria

### Sprint 1 — Registry, lifecycle and assignment contract

1. **As an experiment owner, I want** a versioned registry entry with hypothesis, eligibility, assignment and
   metrics, **so that** the test has an auditable plan before anyone is exposed. **Acceptance:** owner can create
   a draft with one semantic control, positive weights, stable assignment entity, primary/guardrail event metrics,
   bounded segment fields, planned window and minimum sample guidance; malformed/duplicate/high-cardinality
   definitions fail; foreign/member mutation is denied. **Risk:** HIGH — additive DB/auth management. **QA:**
   schema/state-machine pure specs plus owner/member/two-project API specs; browser management smoke owed to Daniel.
2. **As a client developer, I want** the registry contract to remain compatible with local SDK bucketing, **so
   that** governance adds trust without putting a network hop on runtime assignment. **Acceptance:** existing
   `bucket()`/`trackExposure()` calls still work; optional experiment version/assignment entity context
   round-trips through the event-router envelope; a deterministic fixture matches declared weights/variant keys;
   registry unavailable/OFF never changes the locally chosen variant. **Risk:** HIGH — shared SDK/wire contract.
   **QA:** SDK compatibility/parity specs and forced-registry-outage smoke.
3. **As an experiment owner, I want** lifecycle rules enforced, **so that** results remain tied to the plan that
   produced them. **Acceptance:** only one running version per key; running locks assignment/metric fields; stop
   freezes the analysis window; restart/change creates a new version; all changes record actor/time; exposure
   ingest is never rejected because lifecycle is wrong. **Risk:** HIGH — DB state machine/auth. **QA:** transition,
   concurrency/idempotency and audit specs.

### Sprint 2 — Trust diagnostics, metrics and segment cuts

1. **As an experiment owner, I want** primary and guardrail results joined to real conversion events, **so that**
   the report measures product behavior rather than a test-only payload shape. **Acceptance:** first valid exposure
   assigns subject/variant; untagged metric events join by opaque subject id within the declared observation
   window; semantic control drives lift; repeated events follow the declared distinct-subject metric; guardrails
   show direction and status without auto-stopping. **Risk:** LOW — read-only analytical extension. **QA:** pure
   metric fixtures including realistic untagged conversions and exact time boundaries.
2. **As an experiment owner, I want** SRM and exposure-integrity checks ahead of lift, **so that** broken data is
   not mistaken for a product result. **Acceptance:** observed allocation is tested against declared weights;
   unknown/cross-variant/duplicate/out-of-window/missing-subject exposures and join coverage are visible; blocking
   failures mark the result not decision-ready; diagnostics preserve raw counts and never invent a root cause.
   **Risk:** LOW. **QA:** deterministic synthetic fixtures with known clean/SRM cases and telemetry-loss/degraded
   states.
3. **As a product lead, I want** minimum-sample guidance and bounded segment cuts, **so that** I can inspect the
   declared population without fishing across arbitrary metadata. **Acceptance:** report says below/met declared
   minimum per variant; segments are limited to registry allow-list/cardinality cap; every cut reruns SRM/integrity;
   small cells are suppressed/redacted; UI/API/MCP use one resolver. **Risk:** LOW. **QA:** segment allow-list,
   cardinality/small-cell and parity fixtures.

### Sprint 3 — Decision record, operating surface and Miyagi proof

1. **As an experiment owner, I want** an immutable close-out decision, **so that** future teammates know what we
   observed, trusted and chose. **Acceptance:** stopped experiment can record one append-only decision from the
   controlled enum with rationale, chosen/no-chosen variant, metric/guardrail snapshot, integrity state, version,
   actor and time; decision can explicitly be `invalid`/`inconclusive`; corrections append, never overwrite; no
   rollout/flag mutation occurs. **Risk:** HIGH — authenticated durable decision record. **QA:** authorization,
   immutability/snapshot and no-flag-mutation specs; decision browser smoke owed to Daniel.
2. **As an authorized teammate or agent, I want** one trustworthy experiment view, **so that** the plan,
   diagnostics, results and decision agree across channels. **Acceptance:** authenticated UI/API and read-only MCP
   share one registry-aware resolver; existing connector flag/token gates remain; foreign/public reads fail; old
   v1 experiments without registry render a clear legacy state rather than fabricated governance. **Risk:** HIGH —
   auth/connector boundary. **QA:** legacy compatibility, connector-off/revoked and two-project parity specs.
3. **As Miyagi's growth team, I want** the Tiendas Fundadoras promise/CTA test governed end to end, **so that**
   the first acquisition experiment produces a reusable decision rather than a loose dashboard. **Acceptance:**
   existing Miyagi feature flag controls exposure; Golden Beans receives PII-free subject/exposure/application
   events; one deliberately skewed fixture raises SRM, a clean fixture clears it, guardrails remain visible and a
   human records the final decision; Golden Beans never flips Miyagi's flag. **Risk:** HIGH — cross-repo contract
   and real rollout boundary. **QA:** identical fixtures in both repos; authenticated production smoke and any
   real traffic decision owed to Daniel.

## Deploy order and dependencies

Wait for `event-destination-router`'s stable subject/occurred-at/idempotency contract and
`entity-journeys-projections`' entity/cohort vocabulary. Land additive registry/decision migrations and the OFF
gate, then Sprint 1 lifecycle, Sprint 2 read-only diagnostics and Sprint 3 decision/dogfood. Apply Supabase
migrations separately. Create/change the Vercel env gate, trigger a Git-tracked deployment, and verify both OFF
(v1 unchanged) and ON states before using real Miyagi traffic.

## Open risks / research

- **Architecture panel offered, not run:** experiment registry versus flag-serving/remote assignment is an
  expensive boundary. Recommendation is registry/diagnostics only, preserving local assignment and separate E5a;
  Daniel may request the advisory cross-family panel before approval.
- SRM is a data-quality symptom, not a diagnosis or product result. Microsoft Research describes it as observed
  allocation differing from expected and warns that unresolved SRM can reverse ship decisions; v2 therefore
  marks analysis untrustworthy but does not invent a cause or automatically stop/roll out. Source:
  [Diagnosing Sample Ratio Mismatch in Online Controlled Experiments](https://www.microsoft.com/en-us/research/publication/diagnosing-sample-ratio-mismatch-in-online-controlled-experiments-a-taxonomy-and-rules-of-thumb-for-practitioners/).
- Primary, guardrail, local diagnostic and data-quality metrics serve different decisions; Golden Beans should
  show them separately rather than compress them into one score. Source:
  [Microsoft Research — Patterns of Trustworthy Experimentation: During-Experiment Stage](https://www.microsoft.com/en-us/research/?p=720145).
- A durable human decision record and explicit `invalid`/`inconclusive` outcomes are intentional safeguards
  against interpreting noisy or compromised results as certainty. The product should follow a checklist and
  preserve rationale, not automate expert judgment. Source:
  [Three Key Checklists and Remedies for Trustworthy Analysis](https://www.microsoft.com/en-us/research/?p=670776).
- Tiendas Fundadoras cannot be the first live proof until consent-safe previews, acquisition application and
  merchant activation events ship. Local synthetic dogfood may verify the engine earlier; do not claim the
  real acquisition experiment ran before that dependency is live.
