# Experiment governance v2 — Sprint 3: Decision record, operating parity and Miyagi proof

**Status:** ✅ shipped & LIVE in production — merged in PR [#23](https://github.com/danybgoode/golden-beans/pull/23),
migration `20260801100000` applied to prod Supabase, and `EXPERIMENT_GOVERNANCE_ENABLED` flipped ON (2026-07-23)
with a live decision round-trip verified. One operational follow-up remains: the live Miyagi dogfood decision.

**Commit refs:** 3.1 `db69d5b` + `a3b65a3` (review fix) · 3.2 `e642b99` · 3.3 `12d5d1b`

**Review:** fresh cold reviewer found one BLOCKING cap-alignment defect (write cap counted only the analysis
snapshot while the read bound sums rationale+analysis+integrity → a long-rationale history could be accepted yet
be unreadable); fixed and mutation-verified with a teeth spec. Agy and Devin then reviewed the fixed branch clean
(Agy's single "should-fix" was a hallucinated type union — `tsc` is green). CI: Playwright api + type-check/build
+ Vercel preview all pass.

**Production rollout (2026-07-23):** (1) merged #23 dark; (2) `supabase db push` applied the decision-records
migration to prod (`slweidgffcfndnskcskc`) — the only pending one; (3) `EXPERIMENT_GOVERNANCE_ENABLED` false→true
on Vercel Production, activated by a redeploy commit to `main`; (4) live round-trip verified (create → stop →
record `inconclusive` decision → read back byte-identical via authenticated API + MCP → append a correction).

**Remaining operational follow-up:** Story 3.3 live — drive Tiendas Fundadoras exposure through Miyagi's own flag
and record the production human decision (cross-repo; browser smoke). Golden Beans never reads or changes Miyagi's
flag. This is a dogfood step on top of the now-live governance capability, not a code gap.

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
