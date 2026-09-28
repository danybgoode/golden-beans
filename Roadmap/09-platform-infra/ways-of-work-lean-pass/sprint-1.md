---
epic: ways-of-work-lean-pass
sprint: 1
title: Permissions, the deny list, and auto mode
risk: high
phase: Shipped
stories_total: 5
stories:
  - id: S1.1
    title: dobby-foundation gets its own Roadmap/
    as_a: a maintainer of the foundation
    i_want: the foundation repo to plan its own work in its own funnel
    so_that: "the anti-fork-drift repo isn't itself planned inside one of its consumers"
    risk: low
    status: done
  - id: S1.2
    title: A committed permissions.allow in the template
    as_a: a builder agent
    i_want: the verbs that are always safe here pre-approved in a tracked file
    so_that: "a session doesn't stop to ask whether it may read sixty lines of a file"
    risk: low
    status: done
  - id: S1.3
    title: A permissions.deny that is the real guardrail
    as_a: the product owner
    i_want: the genuinely dangerous commands enumerated and refused
    so_that: "\"auto mode\" means \"the dangerous set is named and everything else flows\" rather than \"approve everything\""
    risk: high
    status: done
  - id: S1.4
    title: Auto mode on, deny list as the floor
    as_a: a product owner running several agents
    i_want: auto mode on
    so_that: the operation is asynchronous instead of a person watching one agent work
    risk: high
    status: done
  - id: S1.5
    title: Retire the settings.local.json accretion
    as_a: a maintainer
    i_want: the untracked per-machine allow logs emptied and kept empty
    so_that: the accretion actually stops rather than continuing alongside the new list
    risk: low
    status: done
---
# Ways-of-work lean pass — Sprint 1: Permissions, the deny list, and auto mode

**Status:** ✅ shipped — danybgoode/dobby-foundation#10 · danybgoode/golden-beans#143 · danybgoode/miyagi-product-management#175

**Epic:** [Ways-of-work lean pass](README.md) · **Risk: HIGH** (auto mode changes what an agent may do unattended)

**Wave 1 of 3.** The smallest sprint and the highest-leverage one. **It must ship standalone** — if
Sprints 2 and 3 are re-bet away at a wave boundary, this one still pays for the whole epic.

**The evidence this sprint exists for:** `medusa-bonsai/.claude/settings.local.json` holds **175
one-off `allow` entries across 187 lines**, accreted one interruption at a time — including approvals
to `sed -n '1,60p'` a file and to `echo "tsc exit=$?"`. Every line is a session that stopped and
waited for a human. That is the Step-1 bottleneck surviving into a Step-2 operation, and it is
self-inflicted: the file is untracked, per-machine, and grows by accretion rather than by design.

## Stories

### Story 1.1 — `dobby-foundation` gets its own `Roadmap/`
**As a** maintainer of the foundation, **I want** the foundation repo to plan its own work in its own
funnel, **so that** the anti-fork-drift repo isn't itself planned inside one of its consumers.
**Acceptance:** `dobby-foundation/Roadmap/` exists with `README.md`, `WAYS-OF-WORKING.md`,
`LEARNINGS.md` and `00-ideas/` — **spawned from its own `template/`, which dogfoods the template for
free** and will surface any template defect immediately. This epic's own docs are copied there and
this medusa copy becomes a pointer.
**Risk:** low

### Story 1.2 — A committed `permissions.allow` in the template
**As a** builder agent, **I want** the verbs that are always safe here pre-approved in a tracked file,
**so that** a session doesn't stop to ask whether it may read sixty lines of a file.
**Acceptance:** `template/.claude/settings.json` carries a `permissions.allow` array (D1) covering
read-only inspection (`sed`/`grep`/`find`/`head`/`ls`/`wc`), git reads and ordinary writes
(`status`/`diff`/`log`/`add`/`commit`/`branch`/`worktree`), `gh pr view|list|checks`, `npm run *`,
`npx tsc *`, `node scripts/*`, and read-only platform reads (`supabase migration list`,
`vercel env ls`). It is **committed and reviewed**, and every entry is a *verb class*, not a
one-off command string — a list containing a literal past command is the accretion bug returning.
**Risk:** low

### Story 1.3 — A `permissions.deny` that is the real guardrail
**As the** product owner, **I want** the genuinely dangerous commands enumerated and refused,
**so that** "auto mode" means "the dangerous set is named and everything else flows" rather than
"approve everything".
**Acceptance:** `template/.claude/settings.json` carries a `permissions.deny` array (D2) whose every
entry cites the AGENTS rule it enforces — at minimum `vercel deploy`, `vercel --prod`,
`supabase db push`, `git push --force`, `rm -rf`, and writes to money/auth env vars. **Each denied
command is actually attempted in a throwaway session and observed to be refused** — this is tested,
not asserted. Today there is **no deny list at all** and AGENTS rule #4 is enforced by prose; this
story turns that rule into a check.
**Risk:** high

### Story 1.4 — Auto mode on, deny list as the floor
**As a** product owner running several agents, **I want** auto mode on, **so that** the operation is
asynchronous instead of a person watching one agent work.
**Acceptance:** ~~auto mode is enabled in the template and in both consuming repos~~ — **corrected by
D3:** `defaultMode: "auto"` is ignored in project settings and masks the user default, so auto mode is
set in **user** settings (documented in the template README) and `permissions-smoke.mjs` **fails** if a
project settings file sets `auto`/`bypassPermissions`. Ships **after 1.3 has merged and its refusals
have been observed** (D4). A LOW-tier epic run end-to-end from a clean session
produces **zero** permission prompts outside the deny list.
**Risk:** high

### Story 1.5 — Retire the `settings.local.json` accretion
**As a** maintainer, **I want** the untracked per-machine allow logs emptied and kept empty,
**so that** the accretion actually stops rather than continuing alongside the new list.
**Acceptance:** medusa's 175 entries and golden-beans' local file are triaged — each either
generalized into the committed allow list, covered by the deny list, or dropped — and both local
files are reduced to (at most) genuinely machine-specific entries. The count is recorded in the PR.
**Risk:** low

## Sprint QA
- **api spec(s):** none — this sprint ships configuration, not application code. The gate is
  **behavioural**: a scripted check that attempts each denied verb and asserts refusal, committed as
  `scripts/permissions-smoke.mjs` so the assertion is a reviewable file rather than a one-time manual
  run (the lesson `prod-smoke.mjs`'s header already records).
- **browser smoke owed:** no.
- **deterministic gate:** JSON schema validity of all three `settings.json` files + `node scripts/permissions-smoke.mjs` green before merge.

## Sprint 1 — Smoke walkthrough (do these in order)
Env: local · a clean checkout of `golden-beans` on the merged branch

1. Open a fresh Claude Code session in `golden-beans` and ask it to read a file and run `npm run typecheck`.
   → It does both **without a single permission prompt**.
2. In the same session, ask it to run `vercel deploy --prod`.
   → It is **refused by the deny list**, not by the agent's judgement, and says so.
3. Ask it to run `supabase db push`.
   → Refused.
4. Ask it to run `git push --force` on a throwaway branch.
   → Refused.
5. Run `node scripts/permissions-smoke.mjs`.
   → Every denied verb reports "refused"; exit code 0.
6. Open `.claude/settings.local.json` in both repos.
   → It is empty or near-empty; nothing resembling `Bash(sed -n '1,60p' …)` remains.
7. Kick off a small LOW-tier story end to end and watch the session.
   → It runs to a draft PR with **zero** prompts.

If any step fails, note the step number + what you saw — that's the bug report.

**Step 2, 3 and 4 are the load-bearing ones.** A deny list that doesn't actually refuse, while auto
mode is on, is strictly worse than no deny list — it reads as a guardrail while being decoration.
