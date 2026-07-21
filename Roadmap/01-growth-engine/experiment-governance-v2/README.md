---
status: scaffolded
slug: experiment-governance-v2
---

# Epic: Experiment governance v2 — registry, metrics, guardrails and decision record

> **Area:** 01-growth-engine · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/experiment-governance-v2.md`](../../00-ideas/seeds/experiment-governance-v2.md)

## Why

Golden Beans can assign variants, record exposures and compare basic lift, but it cannot say what was intended,
whether the data is trustworthy or what the team decided. This epic turns those shipped primitives into an
experiment operating system: plan first, diagnose integrity, interpret primary/guardrail outcomes and preserve
an accountable human decision.

## Platform-primitives note

Local deterministic SDK bucketing and the canonical event stream remain unchanged. The registry declares the
expected contract; analysis compares observed exposure/metric events to it. Golden Beans does not serve flags,
resolve assignments, reject telemetry, ramp traffic or roll out a winner. Flag serving remains separate E5a.

## Decisions locked at scope approval

1. **Govern, don't serve:** registry and diagnostics never add a runtime assignment network hop.
2. **Realistic conversions:** primary/guardrail events join by opaque subject id and need no experiment tag.
3. **Integrity before lift:** unresolved SRM or blocking exposure defects mark results not decision-ready.
4. **No automatic winner:** results are descriptive; sample guidance is declared, not certainty theater.
5. **Immutable lifecycle:** running locks assignment/metrics; changes create a new version.
6. **Human close-out:** every decision records rationale and never mutates the product's feature flag.

## What already exists (reuse, don't rebuild)

| Capability | Existing seam | Reuse |
|---|---|---|
| Local assignment | `packages/sdk/src/bucketing.ts` | Preserve deterministic sorted weighted bucketing |
| SDK exposure | `bucket()` + `trackExposure()` | Extend compatibly with optional version/entity context |
| Canonical facts | `events` + event-router subject contract | Join exposures and metrics by stable opaque subject id |
| Pure comparison | `apps/web/lib/ab.ts` | Add semantic control, expected weights and diagnostics |
| Shared query | `apps/web/lib/ab-query.ts` | Preserve separate exposure/metric queries and realistic untagged metrics |
| Existing surfaces | compare API + `/app/experiments/*` | Evolve one resolver/UI instead of adding parallel reports |
| User authorization | `project_members`, `membership.ts`, `roles.ts` | Owners manage/decide; members read |
| Registry precedent | feature sync/schema | Reuse validation/version patterns in a separate experiment registry |
| Agent comparison | MCP `compare_experiment` | Extend behind existing connector flag/token gates |
| Entity/cohort vocabulary | `entity-journeys-projections` | Reuse stable subject, segment and freshness semantics |

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Versioned experiment registry and plan | high |
| 1 | 1.2 Local SDK compatibility and assignment integrity context | high |
| 1 | 1.3 Immutable experiment lifecycle | high |
| 2 | 2.1 Primary and guardrail metric analysis | low |
| 2 | 2.2 SRM and exposure-integrity diagnostics | low |
| 2 | 2.3 Minimum-sample guidance and bounded segments | low |
| 3 | 3.1 Immutable human decision record | high |
| 3 | 3.2 Registry-aware UI, API and MCP parity | high |
| 3 | 3.3 Tiendas Fundadoras governed experiment proof | high |

## Kill-switch

`EXPERIMENT_GOVERNANCE_ENABLED` is an **enablement** environment gate in `lib/flags.ts`, born **OFF** in
preview and production. It gates registry/lifecycle mutations, governance-aware UI and extended MCP output.
Existing SDK bucketing, exposure ingest and v1 comparison remain available while OFF. Additive migrations stay
in place. Every Vercel env change requires a new Git-tracked deployment before behavior can change live.

## Deploy order

Wait for event-destination-router's stable subject contract and entity-journeys' entity/cohort vocabulary. Land
the additive registry/decision migrations and OFF gate, then Sprint 1 plan/lifecycle, Sprint 2 read diagnostics
and Sprint 3 decision/dogfood. Apply Supabase migrations separately. Enable only after v1 OFF-state compatibility,
two-project isolation and synthetic clean/SRM fixtures pass; real Miyagi traffic waits for its acquisition stack.

## Definition of Done (epic)

- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each sprint walkthrough contains real deployed URLs and disposable experiment data
- [ ] Existing local bucketing/exposure/v1 comparison remain compatible with governance OFF
- [ ] Realistic untagged conversions, SRM and exposure-integrity fixtures pass deterministically
- [ ] UI/API/MCP share one resolver and pass two-project + connector-gate isolation
- [ ] Decisions are immutable, allow invalid/inconclusive and cannot mutate a product flag
- [ ] Tiendas Fundadoras proof is PII-free and uses Miyagi's own flag for exposure
- [ ] `EXPERIMENT_GOVERNANCE_ENABLED` exists born OFF; flip includes a new deployment and live verification
- [ ] This README marked shipped; sprint headings carry commit refs
- [ ] `RETROSPECTIVE.md`, product poster and durable learnings updated
- [ ] Feature branch deleted and `node scripts/build-order.mjs` run
