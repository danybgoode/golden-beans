---
status: scaffolded
slug: cms-integration-spike
---

# Epic: CMS-neutral experiment integration + Payload go/no-go

> **Area:** 01-growth-engine · **Risk:** low · **Class:** Spike · **Scope seed:** [`00-ideas/seeds/cms-integration-spike.md`](../../00-ideas/seeds/cms-integration-spike.md)

## Why

Golden Beans should power content experiments without accidentally becoming a CMS. This spike uses
Miyagi's shipped editor/content runtime and E5's flag control plane to make that boundary concrete,
then decides—without a predetermined answer—whether Payload, a packaged adapter or the current
in-house system is the right next investment.

## Medusa-first note

Medusa continues to own commerce data and Miyagi owns its presentation content. Golden Beans owns
flag/experiment assignment and outcome evidence only. A CMS integration may reference a listing or
surface through opaque application identifiers, but it does not copy commerce/content truth into
the engine.

## What already exists (reuse, don't rebuild)

- Miyagi `platform_copy_overrides`, `platform_announcements`, `/admin/contenido`, preview,
  batching, import/export and `content.overrides_enabled` rollback.
- Golden SDK local assignment/exposure and canonical experiment integrity/metric/decision resolvers.
- E5 typed flag versions, evaluation snapshots and experiment-to-flag binding.
- MADMEN's seller-first, consent-safe Miyagi activation plan.
- Current official Payload documentation, MIT license and Figma/Payload direction statements.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | Validate the CMS-neutral contract against current Miyagi and E5 | low |
| 2 | Decide Payload/module/adapter/no-go and write the follow-on scope | low |

## Decision rules

- The spike produces documentation and a decision, not production code.
- Content bodies, layouts, media, locales, schedules and drafts remain CMS-owned unless the
  decision documents a specific user need that requires otherwise.
- “Technically viable,” “recommended,” and “shipped” are distinct states.
- A no-go needs measured reopen triggers. A go needs a bounded ready seed, owner, dependency and
  rollback/deployment model.
- The decision is made against current code and strategy, not the 2026-07-14 seed assumptions.

## Single-session execution topology

E5's frontier coordinator first locks flag identity/version/evaluation/exposure semantics. E6 then
runs as a read-only evidence lane in the same session. Evidence gathering may be delegated, but the
coordinator must inspect the current Miyagi/Golden paths and author the final decision. The lane
must not edit E5's shared contracts or install Payload.

## Deploy order

None. This spike changes only Roadmap documentation. If the decision is **go**, its follow-on seed
defines deploy order. If **no-go/defer**, archive this epic with explicit reopen triggers and make
no product/landing claim.

## Definition of Done (epic)

- [ ] Current Miyagi/Golden code-path trace and data-ownership matrix complete
- [ ] Failure/rollback and credential/tenant boundary tables complete
- [ ] Payload primary-source facts reverified and dated
- [ ] Go/no-go scorecard ties every conclusion to an observed need or explicit trigger
- [ ] Daniel approves the decision
- [ ] Go creates a bounded ready seed; no-go/defer records reopen triggers
- [ ] Landing/poster language distinguishes decision from shipped integration
- [ ] `RETROSPECTIVE.md` and durable learning updates complete
- [ ] This README frontmatter set to `status: archived` or `shipped` as the approved decision requires
- [ ] Run `node scripts/build-order.mjs`
