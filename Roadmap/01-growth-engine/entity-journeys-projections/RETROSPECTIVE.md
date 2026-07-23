# Entity journeys — Retrospective

_Closed: 2026-07-23_

## What shipped

- **Sprint 1 — registry + subject truth** ([PR #17](https://github.com/danybgoode/golden-beans/pull/17),
  `ed6397c`): an owner-managed, audited registry of immutable numbered journey definitions and a
  deterministic query-time subject evaluator. Definitions are deliberately bounded—1–20 stages,
  event names plus exact allow-listed scalar predicates—and every result names its definition
  version. The whole surface was born dark behind `JOURNEY_PROJECTIONS_ENABLED`.
- **Sprint 2 — operating cohorts + shared reads**
  ([PR #18](https://github.com/danybgoode/golden-beans/pull/18), `5005044`): one project-scoped
  resolver for authenticated UI, Bearer API and gated MCP. It returns actual versus positional
  conversion, stage aging, drop-off, exact retention outcomes, source freshness and keyset-paginated
  opaque drilldowns from one bounded database snapshot.
- **Sprint 3 — Miyagi proof + measured scale decision**
  ([PR #20](https://github.com/danybgoode/golden-beans/pull/20), `cd62a98`): the byte-identical
  cross-repo lifecycle fixture and 13-stage `merchant_activation` v1 contract, plus subject-free,
  100-sample query telemetry. The gate is ON in production. A disposable self-tenant subject reached
  all 13 stages through `/api/v1/track`; API and MCP returned the same one-subject retained cohort.
  Subject p95 was 118.87 ms and the sixth cohort/MCP sample p95 was 119.32 ms, with 13 relevant events.
  The decision is **keep query-time**; neither >2,000 ms nor >1,000,000-event tripwire is close.

## What went well

- **The simplest architecture survived real evidence.** Recomputing from canonical facts makes late,
  replayed and out-of-order events self-repairing. Instead of pre-emptively adding a projector, the
  epic instrumented the real resolver and earned a concrete keep-query-time decision.
- **One resolver kept three product surfaces honest.** API and MCP production outputs agreed because
  neither can assemble its own query. UI consumes that same server seam; isolation, redaction and
  resource bounds are therefore properties of the resolver rather than conventions each caller can
  forget.
- **A plain JSON fixture made the cross-repo contract auditable.** The Golden Beans and active Miyagi
  Sprint 3 copies have SHA-256
  `b53f300bdd967bfe21dadbc7543655ccf36f95d27e643625fbb68df5739f3671`. Reversed receipt order and
  duplicate canonical ids still converge, while structural checks keep PII/CRM/commerce state out.
- **Dark rollout separated schema safety from behavior activation.** Each additive migration landed
  before its reader. The final env flip was followed by a Git-tracked main deployment of the exact
  reviewed SHA, then by non-zero live API/MCP proof.

## What we learned

Promoted to `Roadmap/LEARNINGS.md`:

- **`vercel env run` may let a local `.env.local` shadow the requested Production environment.**
  Check the selected hostname without printing credentials; do not rename the user's file. The
  linked Supabase Management API plus one-use, finally-revoked credentials can drive an authorized
  live proof without pulling a service-role secret into the shell.
- **Review tools should be routed, not multiplied ceremonially.** Agy is the ordinary cold read;
  Devin joins high-risk data/auth/concurrency changes; Cursor remains the quota-aware SQL/boundary
  specialist that already caught real defects. Substantive fixes reset the relevant review, while
  wording/presentation-only deltas receive targeted validation.

Kept epic-local:

- **A subject projection and a cohort answer different questions.** The subject truth is ordered
  stage history/current stage; retention is a cohort outcome. The first production harness assumed
  a subject-level retention field, failed cleanly, revoked its key, and was corrected without a
  product change.

## Gaps / follow-ups

- **Authenticated browser comparison:** Daniel still owns the real-session walkthrough that opens
  the Miyagi merchant beside Golden Beans' journey page. API/MCP production behavior is proven; the
  shared live-smoke skill is hard-coded to Miyagi's app path and cannot drive this authenticated page.
- **Miyagi branch integration:** the byte-identical producer fixture exists on Miyagi's active
  `feat/founding-merchant-activation-ops-s3` worktree, but that separate repo's Sprint 3 PR/merge is
  outside this Golden Beans closeout.
- **Materialization:** deliberately not opened. If a future bounded series crosses p95 >2 seconds or
  >1M relevant events, groom a separate epic from that evidence rather than hiding projection
  infrastructure in maintenance work.
