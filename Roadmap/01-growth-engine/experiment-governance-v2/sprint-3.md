# Experiment governance v2 — Sprint 3: Decision record, operating parity and Miyagi proof

**Status:** ✅ shipped & LIVE in production — merged in PR [#23](https://github.com/danybgoode/golden-beans/pull/23),
migration `20260801100000` applied to prod Supabase, and `EXPERIMENT_GOVERNANCE_ENABLED` flipped ON (2026-07-23),
flag flip verified live, and the authenticated production decision round-trip validated on the UI by Daniel
(2026-07-23). The live Miyagi (Tiendas Fundadoras) dogfood ran end to end on 2026-07-28 — **nothing is owed**.

**Commit refs:** 3.1 `db69d5b` + `a3b65a3` (review fix) · 3.2 `e642b99` · 3.3 `12d5d1b`

**Review:** fresh cold reviewer found one BLOCKING cap-alignment defect (write cap counted only the analysis
snapshot while the read bound sums rationale+analysis+integrity → a long-rationale history could be accepted yet
be unreadable); fixed and mutation-verified with a teeth spec. Agy and Devin then reviewed the fixed branch clean
(Agy's single "should-fix" was a hallucinated type union — `tsc` is green). CI: Playwright api + type-check/build
+ Vercel preview all pass.

**Production rollout (2026-07-23):** (1) merged #23 dark; (2) `supabase db push` applied the decision-records
migration to prod (`slweidgffcfndnskcskc`) — the only pending one; (3) `EXPERIMENT_GOVERNANCE_ENABLED` false→true
on Vercel Production, activated by a redeploy commit to `main` (`ea55ec0`); (4) **flag flip verified live** — the
governed `?version` compare route now returns 401 (needs auth) instead of the OFF-state 404, confirming the
governance gate is enabled in production. The ledger's functional behaviour (create→stop→decide→read via API+MCP,
immutability, idempotency, correction chain, cap bounds) is covered by the CI/local gate (307 api specs), not a
prod round-trip.

**Production decision round-trip — DONE (Daniel, 2026-07-23):** the authenticated UI round-trip (owner creates a
disposable experiment → stop → record an `inconclusive` decision → confirm it reads back → append a correction)
was validated directly on the production UI.

**Story 3.3 live Miyagi dogfood — DONE (2026-07-28).** Ran end to end against real production on both sides.

Miyagi shipped the wiring in `miyagisanchezcommerce` PRs #316 (local deterministic assignment, HttpOnly `fnd_sid`
visitor subject, exposure + subject context on every campaign event) and #317 (definition version 3). Exposure is
driven solely by Miyagi's own `growth.founding_merchants_enabled` + `growth.telemetry_enabled`; Golden Beans never
read or changed either flag, and never served an assignment.

Two defects were found and fixed before any data was trustworthy, both of which would have produced a silent zero:

1. Golden Beans joins experiment metrics by `context.subject`, not `userId`. Miyagi's campaign events carried no
   subject context, so every conversion would have been unaddressable while ingesting perfectly.
2. The conversion was keyed on `relationshipId` while the funnel used a client `fnd_<uuid>` — two id spaces, so
   exposure could never join the conversion.

The registry then caught a third, in the PLAN rather than the code: v1 declared `eligibility.tags =
{campaign: "vende_fundadoras"}`, which the emitter has no reason to send, so all 24 production exposures were
rejected. The report did NOT show a plausible zero — it returned `decisionReady: false`,
`blockers: ["srm_not_evaluable","eligibility_mismatch"]` and `integrity: [{code: "eligibility_mismatch",
count: 24, severity: "blocker"}]`. v2 (predicate removed) still inherited v1's window, which contained v1's own
exposures, and `version_mismatch` is a blocker — so v3 moved the window past the last v1 exposure as well.

**Results on v3 (`0baa971b…`), all read through the authenticated API:**

| fixture | allocation | SRM | decisionReady |
|---|---|---|---|
| clean | control 12 / treatment 12 | clear (χ²=0, p=1) | **true**, blockers `[]`, sample `met` |
| skewed | control 12 / treatment 30 (expected 21/21) | **detected** (χ²=7.71, p=0.0055 < α=0.01) | false, blockers `["srm_detected"]` |

The clean run measured control 3/12 (25.0%) vs treatment 7/12 (58.3%), lift +133.3% `favorable`, with metric
addressability coverage **1.0** — conversions joined by opaque subject id and carrying **no experiment tag**,
which is the "realistic untagged conversions" decision proven against live traffic. Under SRM the primary and
guardrail numbers stayed visible; nothing was hidden or deleted. An intermediate 12/24 skew correctly did NOT
flag (p=0.046 > the predeclared α=0.01) — the "no certainty theater" rule holding to its own declared threshold.

Daniel recorded the close-out decision as **`invalid`** (ordinal 1, definition v3): the allocation was skewed on
purpose, so the evidence cannot support a product decision about the copy. The version flipped `stopped→decided`
atomically, the analysis/integrity snapshot froze with `blockers: ["srm_detected"]`, and the record reads back
identically through the API with no idempotency key exposed. No product flag was touched.

A temporary `ingest`-scope key was minted for the analysis reads and **revoked immediately afterwards**
(verified: the revoked key now returns 401).

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
