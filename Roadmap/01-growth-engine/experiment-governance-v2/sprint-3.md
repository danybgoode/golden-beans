# Experiment governance v2 — Sprint 3: Decision record, operating parity and Miyagi proof

**Status:** ⬜ not started

## Stories

### Story 3.1 — Immutable human decision record

**As an** experiment owner, **I want** an immutable close-out decision, **so that** future teammates know what
was observed, trusted and chosen.

**Acceptance:** a stopped experiment accepts an append-only decision from ship-treatment, keep-control, iterate,
inconclusive or invalid; record includes rationale, chosen/no-chosen variant, metric/guardrail snapshot, integrity
state, definition version, actor and time; corrections append; no rollout, registry mutation or product flag
change occurs; owner-only authorization is enforced.

**Risk:** high — authenticated durable decision record; Daniel merges.

### Story 3.2 — Registry-aware UI, API and MCP parity

**As an** authorized teammate or agent, **I want** one trustworthy experiment view, **so that** the plan,
diagnostics, results and decision agree across channels.

**Acceptance:** authenticated UI/API and read-only MCP share one registry-aware resolver; connector flag/token
gates remain; foreign/public reads fail; legacy v1 experiments without registry show a clear legacy state;
responses paginate/redact subjects; existing `compare_experiment` remains backwards compatible.

**Risk:** high — membership and connector-token authorization boundary; Daniel merges.

### Story 3.3 — Tiendas Fundadoras governed experiment proof

**As Miyagi's** growth team, **I want** its founding-shop promise/CTA test governed end to end, **so that** the
first acquisition experiment produces a reusable decision instead of a loose lift dashboard.

**Acceptance:** Miyagi's own feature flag controls exposure; Golden Beans receives PII-free subject, exposure and
application events; a deliberately skewed fixture raises SRM and a clean fixture clears it; guardrails remain
visible; an owner records the final human decision; Golden Beans never reads or changes Miyagi's flag.

**Risk:** high — cross-repo event and runtime rollout boundary; Daniel merges both PRs.

## Sprint QA

- **api specs:** owner/member/foreign decision authorization, immutable snapshots/corrections, decision enums,
  no-flag-mutation invariant, legacy compatibility and connector-off/revoked-token parity.
- **contract specs:** identical PII-free Tiendas Fundadoras exposure/application fixtures in Golden Beans/Miyagi,
  clean/SRM behavior and no remote assignment/rollout.
- **browser smoke owed:** yes, to Daniel — authenticated production decision and any real Miyagi traffic decision.
- **deterministic gate:** both repos' typecheck/build/API suites green before merge.

## Sprint 3 — Smoke walkthrough (do these in order)

Env: https://golden-beans-gamma.vercel.app + https://miyagisanchez.com

1. Stop the disposable experiment and record an `inconclusive` decision with rationale.
   → The result/integrity snapshot and owner/time are immutable and no flag changes.
2. Append a documented correction.
   → Both records remain visible; the original is never overwritten.
3. Read the experiment through UI, API and authorized MCP.
   → Plan, diagnostics, metrics and decision agree; revoked/foreign access fails.
4. Run Tiendas Fundadoras exposure/application fixtures through Miyagi's own flag and Golden Beans SDK.
   → Golden Beans receives no contact/form data and identifies skewed versus clean allocation.
5. Record the human dogfood decision and inspect Miyagi's flag.
   → Decision is preserved in Golden Beans; rollout state remains solely under Miyagi control.

If any step fails, note the step number + experiment/version — that's the bug report.
