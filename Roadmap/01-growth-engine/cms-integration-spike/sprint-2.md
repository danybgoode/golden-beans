# CMS-neutral experiment integration + Payload go/no-go — Sprint 2: Payload go/no-go decision

**Status:** ⬜ not started

## Stories

### Story 2.1 — Present-day Payload capability and ownership check

**As the** product owner, **I want** current primary-source evidence about Payload, **so that** the
decision reflects today's product rather than acquisition speculation.

**Acceptance:** dated evidence covers license/self-hosting, Next.js/admin integration, APIs,
versions/drafts, access control, multi-tenant implications, media/localization, operational
ownership and Figma/Payload direction; claims cite official sources; technical viability is scored
separately from current product need.

**Risk:** low

### Story 2.2 — Option scorecard and go/no-go

**As the** product owner, **I want** the viable choices compared on the same criteria, **so that**
we choose intentionally rather than defaulting to “build” or “not now.”

**Acceptance:** compare at least current Miyagi + reference recipe, Payload inside Miyagi, Payload
module inside Golden and a CMS-neutral packaged adapter; score user constraint solved, ownership,
tenant/auth boundary, migration/backup burden, coupling, second-consumer evidence, launch timing
and reversibility; recommendation includes rejected options and why; Daniel records approval.

**Risk:** low

### Story 2.3 — Executable follow-on

**As a** future coordinator, **I want** the decision translated into an unambiguous next state,
**so that** the spike does not end as shelfware.

**Acceptance:** if go, create one bounded `ready` seed with outcome, owner, dependencies, stories,
reuse, gate/deploy/rollback and Miyagi proof; if no-go/defer, record measurable reopen triggers and
archive the epic; update poster/landing language so it never calls a decision a shipped
integration; promote one durable learning without duplicating LEARNINGS.

**Risk:** low

## Sprint QA

- **source check:** official Payload and Figma pages opened on the decision date; URLs and claims
  recorded without excessive quotation.
- **cross-panel:** offer a planning critique because CMS ownership/auth is expensive to reverse;
  never run it without Daniel's approval.
- **api specs/browser smoke:** none—no product code.
- **deterministic gate:** `git diff --check`; all changes remain within Roadmap; decision and
  follow-on state agree with BUILD-ORDER generation.

## Sprint 2 — Smoke walkthrough

Env: decision review

1. Read the option scorecard without its recommendation.
   → The criteria and evidence make the tradeoff understandable before seeing the answer.
2. Follow the recommended option's data, auth, deploy and rollback path.
   → Ownership is complete; no content or tenant boundary is hand-waved.
3. Inspect the next-state artifact.
   → Go has a bounded ready seed; no-go/defer has measurable reopen triggers and no false shipped
   claim.
4. Daniel records approval or requested amendment.
   → The epic status and BUILD-ORDER reflect the approved state.

If the decision depends on E5 semantics that changed during build, amend Sprint 1's contract before
approval rather than guessing.
