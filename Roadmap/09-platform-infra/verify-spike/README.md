---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: verify-spike
title: "Verify spike: Quint on the outbox, Lean on the flag evaluator"
area: 09-platform-infra
risk: low
type: spike
sprints_total: 1
stories_total: 4   # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 37    # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
actual_usd: 18.5
actual_mtok: 52.3
actual_basis: "backfill · this machine · 2026-10-02 · 1 session · prices 2026-10-02"
---

# Epic: Verify spike: Quint on the outbox, Lean on the flag evaluator

> **Area:** 09-platform-infra · **Risk:** low · **Class:** Spike · **Scope seed:** [`00-ideas/seeds/verify-spike.md`](../../00-ideas/seeds/verify-spike.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why, not here).
     Optional: if this epic was ALSO tagged with an archetype at grooming (see spike-role-archetypes.md),
     append " · **Archetype:** <Prototyper|Builder|Sweeper|Grower|Maintainer>" after Class. Omit entirely
     for the Builder default — untagged is fine.
     Scope-seed link: always points at seeds/ — lifecycle lives in the seed's `status:` frontmatter, not
     in a folder path (see 00-ideas/README.md). If this epic was scaffolded from a doc that has no seeds/
     entry, link that doc instead and migrate it to seeds/ when convenient — don't fabricate a seeds/ file
     that doesn't exist. -->

## Why
Before we promise anyone verification (and before `verify-module` is shaped), we need to know what it really
costs and what it really finds, measured on our own code. The spike runs one spec tool on our riskiest
protocol, the event delivery outbox, and one proof tool on the flag evaluator. It asks Jev the triage
questions in shadow and ends in a written decision. It ships no code to users. A bug it finds is fixed in
its own PR (see the seed's Fix policy).

## Platform-first note
No system of record is touched. The spike only reads the outbox migrations and `packages/sdk/src/flags.ts`
and runs local checkers. Specs and evidence live in this epic folder. **No CI job and no workflow edits**:
CI minutes are estimated from local timings, and productizing is `verify-module`'s job.

## What already exists (reuse, don't rebuild)
- Outbox status machine and invariants in comments: `apps/web/supabase/migrations/20260722110000_delivery_outbox.sql` (~L90–156)
- Claim/settle/retry and `event_delivery_attempts`: `20260724100000_delivery_retry.sql`; fan-out: `20260726100000_fanout_serialization.sql`
- Dispatcher runtime: `apps/web/lib/{delivery-dispatch,deliveries,webhook-delivery}.ts`
- Evaluator: `packages/sdk/src/flags.ts` (`evaluateFlag` L541, `explainFlagEvaluation` L640, `rolloutOutcome`, FNV hash L40); cases in `flags.test.ts`
- Local stack (stretch trace validation): the local CI gate recipe (`supabase start` + fresh server)
- Jev rail as it stands today (egress already an explicit choice)

## Outcome (2026-09-29)
**Decision:** [`DECISION.md`](DECISION.md). Quint for protocols, Lean 4 (core) for pure functions. Productize
simulation per PR, Apalache nightly, Lean only together with a differential test, and Jev routing by
verify depth in shadow. **Findings:** F1 is an accepted residual. F2 is the bug seed
[`delivery-stale-reclaim-uncounted`](../../00-ideas/seeds/delivery-stale-reclaim-uncounted.md), with its
fix already model-checked. F3 is fixed by the guard test in PR #194. F4 and F5 are stated behaviour. F6
is a modelling lesson. Reproduce: [`REPRODUCE.md`](REPRODUCE.md).

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Quint spec of the delivery outbox + bounded model check ✅ | low |
| 1 | 1.2 Lean model of the evaluator: explanation ⇔ verdict agreement + differential test ✅ | low |
| 1 | 1.3 Jev triage in shadow over ~10 merged PRs ✅ | low |
| 1 | 1.4 The written decision (`DECISION.md`) ✅ | low |

Stretch (not a story, and not counted): trace validation against local Supabase. A bug fix PR, if any, is
tiered by its own paths (delivery SQL/dispatcher → **high**).

## Deploy order
Nothing deploys. The evidence and decision merge as a docs PR (`risk: low`). A fix PR, if any, follows
normal gitflow, and a migration is applied as the usual separate step.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [ ] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch (only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [ ] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
