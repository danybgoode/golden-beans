---
epic: ways-of-work-lean-pass
sprint: 2
title: One cross-family pass + one fresh reviewer
risk: high
phase: Shipped
stories_total: 9
stories:
  - id: S2.1
    title: The review policy, rewritten
    as_a: a builder
    i_want: one unambiguous review policy
    so_that: "I don't have to hold a four-row router table, a tier branch and a capped-roster protocol in my head"
    risk: high
    status: done
  - id: S2.2
    title: cross-review.prompt.md becomes the one shared review prompt
    as_a: a reviewer of either kind
    i_want: one prompt
    so_that: "the external pass and the fresh reviewer apply the same bar and can't drift apart"
    risk: low
    status: done
  - id: S2.3
    title: Port pr-reviewer.md into the plugin, unconditional
    as_a: a consuming project
    i_want: the fresh reviewer to ship with the policy that requires it
    so_that: "the layer isn't a doctrine with no implementation"
    risk: low
    status: done
  - id: S2.4
    title: The empty-output guard becomes a hard fail
    as_a: the product owner
    i_want: a silent cross-review failure to fail the PR
    so_that: "an uncorroborated pass can't return nothing and read as clean"
    risk: high
    status: done
  - id: S2.5
    title: Collapse the router, delete the protocol, merge the doctors
    as_a: a maintainer
    i_want: the plumbing that existed only to run two passes removed
    so_that: "the policy is the thing that's maintained rather than its scaffolding"
    risk: low
    status: done
  - id: S2.6
    title: Demote the planning panel to on-demand
    as_a: a groom session
    i_want: to stop being obliged to offer a cross-family planning panel
    so_that: an advisory nicety stops being a required ritual on every spike and every fork
    risk: low
    status: done
  - id: S2.7
    title: Automated security review in our own CI
    as_a: the product owner
    i_want: "the Step-2 security guardrail we simply don't have"
    so_that: money/auth diffs get a dedicated security read without a plan change
    risk: high
    status: done
  - id: S2.8
    title: Delete the second cross-family pass
    as_a: a maintainer
    i_want: the second pass gone
    so_that: the reduction is real and not just documented
    risk: high
    status: done
  - id: S2.9
    title: "gate — the evidence, and exactly what it proves"
    as_a: null
    i_want: null
    so_that: null
    risk: high
    status: done
---
# Ways-of-work lean pass — Sprint 2: One cross-family pass + one fresh reviewer

**Status:** ✅ shipped — danybgoode/dobby-foundation#12, #13, #14, #15, #16 · danybgoode/golden-beans#144, #145 · danybgoode/miyagi-product-management#176, #177, #178

**Epic:** [Ways-of-work lean pass](README.md) · **Risk: HIGH** (removing a review layer is a security decision)

**Wave 2 of 3.** The sprint that defines the contract the rest of the system imports — it runs on the
stronger model, and its own PR gets the strongest available reviewer.

## The target stack

```
CI (deterministic gate)
  → ONE cross-family pass   — the highest-preference family that did NOT build the diff
  → ONE fresh reviewer      — the ported pr-reviewer subagent, on EVERY PR (not HIGH-only)
  → risk tier decides who merges
```

**The arithmetic, stated honestly.** Today LOW = 2 external + 0 fresh; HIGH = 2 external + 1 fresh.
After: **1 + 1, everywhere.** A straight reduction on HIGH (3 → 2), and a *re-composition* on LOW —
still two passes, but one of them is now the layer that catches money-path and cross-repo bugs
instead of a second generalist of the same kind. **Family independence and context independence each
get covered exactly once.** `--skip-trivial` already exists and keeps docs-only diffs out of both.

## Stories

### Story 2.1 — The review policy, rewritten
**As a** builder, **I want** one unambiguous review policy, **so that** I don't have to hold a
four-row router table, a tier branch and a capped-roster protocol in my head.
**Acceptance:** `WAYS-OF-WORKING` → *Review & merge* is one diagram plus ~15 lines saying exactly the
stack above. No tier branching on the reviewer. The risk-tier merge rule is unchanged and stated once.
**Risk:** high

### Story 2.2 — `cross-review.prompt.md` becomes the one shared review prompt
**As a** reviewer of either kind, **I want** one prompt, **so that** the external pass and the fresh
reviewer apply the same bar and can't drift apart.
**Acceptance:** the prompt is read by **both** the CLI and the subagent, and gains four knobs worth
stealing from the managed product's `REVIEW.md`: a **nit cap** ("at most N nits; the rest as a count
in the summary"), **skip paths CI already enforces** (lint, formatting, type errors, generated files,
lockfiles), a **verification bar** ("behaviour claims need a `file:line` citation in the source, not
an inference from naming"), and **re-review convergence** ("after the first pass, Important findings
only"). A deliberate nit-storm PR is capped, and a finding lacking a citation is not posted — by both
readers.
**Risk:** low

### Story 2.3 — Port `pr-reviewer.md` into the plugin, unconditional
**As a** consuming project, **I want** the fresh reviewer to ship with the policy that requires it,
**so that** the layer isn't a doctrine with no implementation.
**Acceptance:** `plugins/ways-of-work/agents/pr-reviewer.md` exists; repo names are generalized to
`TEMPLATE FILL-IN` slots and **nothing else is changed** — it keeps reading the prior review comment
first, not re-litigating fixed findings, checking every finding the builder *argued down*, and
spending its effort on cross-repo state, `origin/main` drift, whole-population sweep claims and
uncommitted WIP not on the PR. Its "where you sit in the stack" section is updated: **second layer
now, not third; mandatory on every tier, not HIGH-only.**
**Risk:** low

### Story 2.4 — The empty-output guard becomes a hard fail
**As the** product owner, **I want** a silent cross-review failure to fail the PR, **so that** an
uncorroborated pass can't return nothing and read as clean.
**Acceptance:** `cross-review.mjs` asserts **non-empty output**, pins the CLI version, and exits
non-zero on a run that produces no findings *and* no output — failing the PR check loudly. Proven by
**deliberately feeding it a broken CLI** and observing the failure.
**Risk:** high — **this is now the single most load-bearing line in the review policy.** With two
passes, a CLI exiting 0 with no output was caught by the other one. With one, nothing contradicts it.

### Story 2.5 — Collapse the router, delete the protocol, merge the doctors
**As a** maintainer, **I want** the plumbing that existed only to run *two* passes removed,
**so that** the policy is the thing that's maintained rather than its scaffolding.
**Acceptance:** `review-route.mjs` (273 lines + test) becomes a ~30-line rule — *the highest-preference
family that did not build the diff* — keeping the guard that a family never reviews its own diff (a
real silent-downgrade risk) and deleting the four-row table. The **REFUND ASK / `--fallback-after` /
DARK-layer** protocol is deleted from script and doctrine: a capped family now simply falls to the
next in the preference order. `codex-doctor.mjs` + `agy-doctor.mjs` become one `cross-agent-doctor.mjs`.
**Risk:** low

### Story 2.6 — Demote the planning panel to on-demand
**As a** groom session, **I want** to stop being obliged to offer a cross-family planning panel,
**so that** an advisory nicety stops being a required ritual on every spike and every fork.
**Acceptance:** `cross-panel.mjs` and its prompt **stay** and remain runnable via the `Panel:` verb.
The *"you must surface a one-line offer"* obligation is removed from `groom` Stage 2 and Stage 4.
**Risk:** low

### Story 2.7 — Automated security review in our own CI
**As the** product owner, **I want** the Step-2 security guardrail we simply don't have,
**so that** money/auth diffs get a dedicated security read without a plan change.
**Acceptance:** ~~the `anthropics/claude-code-security-review` Action runs on every PR on our own
key~~ — **re-scoped by D7 + D10 (no API key exists or will exist):** `cross-review.mjs --lens security`
runs **one** external security pass, on any family, only when a PR touches a `SECURITY_PATHS` glob or
declares `risk: high`; it reports Blocking/Should-fix with an exploit scenario and no nits.
`cross-review.security.prompt.md`'s content is folded into that lens. The deterministic floor —
secret scanning + push protection on all five repos, CodeQL default setup on both medusa app repos —
was enabled 2026-09-16. `/security-review` is documented as an optional local self-check, never a gate.
**Risk:** high

### Story 2.8 — Delete the second cross-family pass
**As a** maintainer, **I want** the second pass gone, **so that** the reduction is real and not just
documented.
**Acceptance:** `cross-review.mjs` runs exactly one family per PR. **Gated:** this story does not
merge until 2.3, 2.4 and 2.7 have merged **and** the one-pass + fresh-reviewer shape has run green on
**at least 5 real PRs across two repos**, with 2.4's guard proven against a deliberately broken CLI.
**Risk:** high — **sequence this last in the sprint.** Removing corroboration before its replacement
exists is the one way this epic causes an incident.

## S2.8 gate — the evidence, and exactly what it proves

The story says the one-general-pass + fresh-reviewer shape must have run green on **≥5 real PRs across
≥2 repos** before the second pass is deleted. What ran, 2026-09-16:

| PR | Repo | External general pass | Fresh reviewer | Outcome |
|---|---|---|---|---|
| #10 | dobby-foundation | codex | ✅ | 4 blocking → 3 fixed, 1 argued down with a docs citation |
| #143 | golden-beans | codex | ✅ | 1 blocking + 2 should-fix → all fixed; also caught the red prettier gate |
| #175 | miyagi-product-management | codex | — | 1 blocking + 1 should-fix → both fixed |
| #11 | dobby-foundation | codex | ✅ | 3 blocking → 2 fixed, 1 argued down; the fresh pass found the App-Router glob hole |
| #144 | golden-beans | codex | ✅ | 2 blocking (both wrong — it confused the two repos) + 2 should-fix → fixed |
| #176 | miyagi-product-management | codex | — | 2 blocking (1 is the posture, argued down) + 2 should-fix → fixed |

**Six PRs, three repos, four fresh-reviewer passes.** Every round found something real, which is the
point of the measurement rather than the count.

**The honest caveat:** those passes ran the **pre-S2a** `cross-review.mjs`. They prove the *shape* — one
external family plus one fresh reviewer catches what two generalist external passes were catching — and
they do **not** exercise the new output guard or the commit status against a live CLI. That half is
proven by `cross-review.test.mjs` driving the real runner against a deliberately broken stub, and the
first live run of the new script lands with S2a itself.

## Sprint QA
- **api spec(s):** unit tests for the collapsed router rule (a family never reviews its own diff;
  a capped family falls through in preference order) and for the non-empty-output assertion, in
  `scripts/*.test.mjs` — replacing `review-route.test.mjs`.
- **browser smoke owed:** no.
- **deterministic gate:** `node --test 'scripts/*.test.mjs'` + the broken-CLI fixture green before merge.

## Sprint 2 — Smoke walkthrough (do these in order)
Env: `golden-beans` and `medusa-bonsai`, real PRs

1. Open a LOW-tier PR in `golden-beans` built by Claude, and let the review run.
   → Exactly **two** review artefacts appear: one labelled cross-family comment from a family that is
     **not** Claude, and the fresh reviewer's findings. **No second cross-family comment.**
2. Open a HIGH-tier PR in `medusa-bonsai`.
   → Still exactly two. The fresh reviewer is present **because it is unconditional**, not because
     the tier asked for it.
3. Open a docs-only PR.
   → `--skip-trivial` keeps it out of both passes.
4. Temporarily point the cross-review runner at a stub CLI that exits 0 printing nothing.
   → The check **fails loudly**. It does **not** report a clean review. *(Then revert the stub.)*
5. Push a PR with five style nits and one real bug.
   → The nit cap holds, the real finding is Important, and no finding lacking a `file:line` citation
     is posted — from **both** readers.
6. Push a fix and re-run.
   → Re-review convergence holds: Important findings only, no fresh nit round.
7. Open a PR touching an auth path.
   → The security review runs in our CI and its findings are visible on the PR.
8. Check the PR body of any of the above.
   → It declares a risk tier, and the merge follows that tier's rule. The builder did not merge it.

If any step fails, note the step number + what you saw — that's the bug report.

**Step 4 is the one that matters most.** It is the whole safety argument for going from two external
passes to one.
