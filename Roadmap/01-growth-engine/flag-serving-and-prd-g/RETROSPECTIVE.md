# Flag control plane + Miyagi migration + resilience/SecOps — Retrospective

_API/proof close: 2026-08-01 · final epic close awaits product-owner browser confirmation_

## What shipped

- Golden PRs [#39](https://github.com/danybgoode/golden-beans/pull/39),
  [#43](https://github.com/danybgoode/golden-beans/pull/43),
  [#45](https://github.com/danybgoode/golden-beans/pull/45),
  [#49](https://github.com/danybgoode/golden-beans/pull/49),
  [#50](https://github.com/danybgoode/golden-beans/pull/50), and
  [#58](https://github.com/danybgoode/golden-beans/pull/58) delivered the typed flag registry,
  local snapshot SDK/provider, complete 40-key Miyagi import, sampled canonical telemetry, scenario
  registry/executors, impact evidence and policy-bound breakers. Follow-up PRs #59/#61 hardened the
  migration fixture and timestamp contract; the linked production migration ledger matches them.
- Miyagi frontend #325/#326 and backend #125/#126 completed Golden authority, durable fallback,
  SDK telemetry and request-driven serverless refresh. Both production services converge on snapshot
  `46` with `*=golden`; the approved Stripe rollback drill kept the safe fallback intact.
- The internal resilience proof measured a non-zero `125 ms` p95 delta and persisted integrity-ready
  evidence without claiming customer causality. The closed malformed-payload security template
  observed its expected `400` guard.
- Separate disposable flags took one staged manual and one owner-preapproved automatic protective
  transition, advancing snapshot `44 → 45 → 46`. Both remain on immutable version `2` (`off`) and
  no automatic reenable exists.
- All scenario runs are terminal, the target is revoked, and reviewed merge `e37db4f` returned the
  resilience, security and automatic-breaker routes to flat `404`. Golden flag serving remains ON.
- Sprint 4 added the generic project-scoped definition-sync rail and made Flags and Tasks discoverable
  from `/app`. The live `miyagi` tenant synced its frontend and backend fragments idempotently, and
  `catalog.owned_shop_only_enabled` was activated ON at Production snapshot `47` as a normal Golden
  managed killswitch. The feature never went dark and no production OFF transition was used.

## What went well

- The provider changed behind Miyagi's existing `isEnabled()` seams, keeping commerce enforcement and
  never-throw defaults in the applications while Golden became the single operational writer.
- Shadow comparison, versioned snapshots and request-driven refresh turned a cross-service cutover
  into an observable state transition. The Stripe drill found a real serverless timer assumption
  before it could become a production convergence gap.
- Closed target/template contracts meant the production exercise could not expand its own blast
  radius. The API and database independently enforced tenant, target, TTL, caps, CAS and owner approval.
- Canonical experiment analysis and existing telemetry carried the impact decision; the epic did not
  create a second event or aggregate pipeline.
- The immutable production ledger was strong enough to reconstruct the completed exercise after the
  roadmap record lagged, including run, evidence, approval, trip and cleanup IDs.

## What we learned

- A handoff document is not runtime truth. Re-entry must read the scoped production artifact before
  concluding work is missing; otherwise an agent can prepare to repeat an already-terminal live proof.
- Authentication checks must run on the rail that owns the credential. A sandboxed `gh auth status`
  could not read the macOS keyring and falsely looked unauthenticated even though Git push worked;
  the same check with keyring access correctly identified the logged-in account.
- A complete initial catalog import is not an ongoing registration workflow. A later Miyagi flag can
  resolve safely from its explicit local default under `*=golden`, but that is resilience rather than
  an intended managed state. Sprint 4 adds the missing generic registration rail.
- An environment-variable change is pending configuration, not a live gate transition. The cleanup
  was complete only after a reviewed `main` merge deployed and the edge routes returned `404`.

## Gaps / follow-ups

- Daniel still owns the authenticated production Clerk walkthrough for `/app/flags` and
  `/app/scenarios`; the agent session exposed no connected browser. API-level production evidence,
  CI and the unauthenticated access boundaries are complete, but this real-session confirmation is
  not being rewritten as passed.
- External cohorts remain intentionally unapproved and OFF. Activating them is a future product
  decision under the existing owner/cohort/cap/abort contract, not unfinished scope in this epic.
- A complete initial catalog import is not an ongoing registration workflow. Sprint 4 replaced the
  one-time Miyagi importer with a generic project-scoped sync rail. The `miyagi` tenant—not the dormant
  `miyagisanchez` duplicate—must be the runtime identity used for future publisher credentials.
- `catalog.owned_shop_only_enabled` is a normal Golden-managed default-ON killswitch and its feature is
  live at snapshot `47`. Local defaults remain resilience; permanent control-plane absence is not an
  accepted exception.
