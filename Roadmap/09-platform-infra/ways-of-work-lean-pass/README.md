---
status: shipped   # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
slug: ways-of-work-lean-pass
build_order: 29
title: "Ways-of-work lean pass — remove the training wheels, close the adoption gap"
area: 09-platform-infra
risk: high
type: chore
phase: Shipped
sprints_total: 3
stories_total: 19
---

# Epic: Ways-of-work lean pass — remove the training wheels, close the adoption gap

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Chore · **Archetype:** Sweeper · **Scope seed:** [`00-ideas/seeds/ways-of-work-lean-pass.md`](../../00-ideas/seeds/ways-of-work-lean-pass.md)
> **Appetite:** L (multi-wave — one wave per sprint, re-bet at each boundary) · **Bet:** [`bets/wave-2026-09-16-plugin.md`](../../bets/wave-2026-09-16-plugin.md)
> **Audit:** [`00-ideas/audits/ways-of-work-audit-2026-09-16.md`](../../00-ideas/audits/ways-of-work-audit-2026-09-16.md)

> ⚠️ **The code lands in `dobby-foundation`, not here.** This epic is planned in medusa's funnel
> because `dobby-foundation` has no `Roadmap/` of its own — and **Story 1.1 fixes exactly that**.
> Precedent: `Roadmap/09-platform-infra/dobby-foundation/` (shipped 2026-07-20).
> Two consuming repos (`medusa-bonsai`, `golden-beans`) are also touched by Sprint 3's regeneration.

## Why

The operating system works, and it has accreted. `WAYS-OF-WORKING.md` (446 lines) and
`groom/SKILL.md` (514) are loaded by every builder session, every groom session and the reviewer
subagent — ~14k tokens before a line of code — and they were written for a Step-1 world: one
supervised agent, low trust, read everything. Every lesson since became another paragraph instead of
replacing one, so the escalate-don't-guess trigger list now appears **four times**, three of them
prefaced *"one SSOT, don't fork a second copy here."*

Meanwhile the Step-2→3 unlocks our own `references/Steps-of-AI-Adoption.md` names are the parts built
least: no auto mode, no pre-approved permission set, **no deny list at all**, three review layers per
HIGH PR held together by ~2,400 lines of plumbing, and no automated security review.

After this epic: a builder runs an epic without stopping for a prompt that isn't a genuine
money/auth/deploy decision; every PR gets exactly one cross-family pass plus one fresh reviewer; and
orientation costs under ~6k tokens.

**The training wheels being removed are not the guardrails. They are the manual re-implementations of
things the platform now does for us, and the ceremony that a Step-2/3 operation has outgrown.**

## Platform-first note

**Nothing here needs a new primitive.** The reframe re-scoped this epic substantially:

- `template/.claude/settings.json` **already exists** — the permissions blocks are a pure addition to
  a file in place, not a new mechanism.
- `medusa-bonsai/.claude/settings.json` **already proves the hooks block works** (`PostToolUse` →
  `doc-format.mjs`), so the shape is known-good.
- The review policy's missing piece is an **agent file that already exists** in medusa
  (`.claude/agents/pr-reviewer.md`) — port, don't write.
- `cross-review.prompt.md` **already exists** as a shared prompt; widening it is cheaper than
  inventing a second review-instruction file, and it is the one file both readers can share.
- The epic-DoD script is the only genuinely new build, and it copies `check-plugin-leaks.mjs`'s
  ALLOW-with-a-written-reason discipline verbatim.

**Data ownership:** no data. Config, markdown, one check script, one renderer.

## What already exists (reuse, don't rebuild)

- `dobby-foundation/template/.claude/settings.json` — marketplace + plugin config; add `permissions`.
- `medusa-bonsai/.claude/settings.json` — the working `hooks` precedent.
- `medusa-bonsai/.claude/settings.local.json` — 175 allow entries; the **triage input** for S1.4.
- `medusa-bonsai/.claude/agents/pr-reviewer.md` — the fresh reviewer. Port; generalize repo names only.
- `template/scripts/cross-review.mjs` + `lib/cross-agent-cli.mjs` + `cross-review.prompt.md` — **kept.**
- `template/scripts/review-route.mjs` (273 + test) — **collapsed** to a ~30-line rule.
- `medusa-bonsai/scripts/{codex-doctor,agy-doctor}.mjs` — **merged** into one `cross-agent-doctor.mjs`.
- `medusa-bonsai/scripts/cross-review.security.prompt.md` — the seed content for security review.
- `dobby-foundation/scripts/check-plugin-leaks.mjs` — the ALLOW-with-reasons pattern `epic-dod.mjs` copies.
- `dobby-foundation/scripts/pack-skills.mjs` — the **byte-for-byte reproducible output** discipline the
  `WAYS-OF-WORKING` renderer must copy, so regeneration is boring rather than noisy.
- `golden-beans/scripts/check-template-drift.mjs` — extend to detect *rendered-file* drift, not just
  unfilled placeholders.
- `references/Steps-of-AI-Adoption.md` — the rubric for "did this actually close the gap".
- `references/shapeup/` — the destination for the betting philosophy prose cut from `WAYS-OF-WORKING`.

## Architecture decisions — LOCKED 2026-09-16 (against live code, live settings and the Claude Code docs)

Builders **cite** these; they never re-derive them. Every correction to the scaffolded scope is named.

**Product-owner calls made during the lock (2026-09-16, in the orchestrating session):**
all merges and deploys are pre-authorized at **every** risk tier; no Anthropic API key exists or will
exist, so **nothing may depend on one**; the security review is a **lean, CLI-agnostic external pass**;
GitHub secret scanning (+ push protection) and CodeQL are adopted as a free deterministic floor.

- **D1 — allow list = verb classes that are not already built-in read-only, and never a command that
  destroys uncommitted work.** Claude Code already runs `ls/cat/head/tail/grep/find/wc/diff/stat/echo/cd`
  and read-only `git` without a prompt (docs: *Read-only commands*), so listing them is noise. **An
  allowed command skips the auto-mode classifier**, so the list is narrowed to forms that cannot discard
  work (amended after the fresh review of dobby-foundation#10): `git add|commit|fetch|pull|merge`,
  `git switch -c`, `git checkout -b`, `git worktree add|list`, `git stash push|list`, `gh pr|run|issue`
  reads, `npm run|test|ci`, `npx tsc|eslint|playwright test`, `node scripts/*`, `node --test`, `jq`, and
  read-only platform calls (`supabase migration list`, `supabase projects list`, `vercel env ls`,
  `vercel ls`, `gcloud builds list`, `gcloud run services list|describe`, `<cli> --version`). **Not
  allowed, so the classifier sees them:** `git checkout <path>|-f`, `git restore`, `git stash clear|drop`,
  `git branch -D`, `git worktree remove`, `sed`, `sort -o`, `git push`, `gh api`, `awk`. Exact array:
  `template/.claude/settings.json` (39 rules).
- **D2 — two tiers, every entry cited in a ledger, with a required baseline.** `deny` (51) =
  irreversible-by-rule: CLI deploys (bare `vercel`, `vercel .|--prod|--yes|deploy|promote|rollback|
  redeploy`, `npx vercel`), `supabase [flags] db push|reset` and `npx supabase db push`, force pushes
  (`--force`, `-f`/`-fu`/`-uf`, `+refspec`, `--mirror`, and each through `git -C <dir>`), `rm` recursive
  force in ten spellings, whole-tree staging (`git add -A*|--all|.|:/|-u|--update`, `git commit
  -a|-am|-qam|-av|--all`, trailing `-a|--all`), and hand-edits of generated boards. `ask` (15) =
  production secrets/env writes, `gcloud run deploy`, and **`git push --force-with-lease`** — a lease
  push to your own stacked branch is legitimate and a deny cannot be approved once. `REQUIRED_REFUSALS`
  fails the contract if the baseline guardrails disappear, even with the ledger deleted alongside.
  **Correction:** the scope said "deny writes to money/auth env vars"; name-matched rules are
  unenforceable, so all secret writes ask. **Honest limit (docs: *What a Bash rule doesn't match*):** a
  rule stops the form an agent normally writes, not `/bin/rm` or `sh -c '…'`. `supabase db push` is
  denied in golden-beans too — agents apply migrations via the Supabase MCP, the product owner can still
  run it by hand.
- **D3 — auto mode is a USER setting; S1.4 is corrected.** Docs (*permission-modes*): `defaultMode:
  "auto"` in `.claude/settings.json` or `.local.json` **does not take effect and masks the user-level
  default**. The product owner's `~/.claude/settings.json` already sets it. S1.4 therefore ships a
  **guard**: `permissions-smoke.mjs` fails if any project settings file sets `auto` or
  `bypassPermissions`, and reports the user-level mode (auto / other / unavailable). Deny rules resolve
  before the auto-mode classifier, so the floor holds.
- **D4 — refusals are observed in a live session, and re-runnable by a human.** The auto-mode classifier
  refuses an agent launching a nested `claude -p` with its own permission rules (observed twice). So:
  the static contract (every rule ↔ ledger entry, no project-level auto) runs in CI; each denied verb is
  **attempted in the orchestrating session** against harmless PATH shims and the refusal recorded in the
  sprint doc; `permissions-smoke.mjs --live` is the behavioural replay — a shadow check (every probed
  program resolves to a shim, else nothing is sent), a baseline with no rules (every probe must RUN), then
  the committed rules (every probe must be refused). *Amended 2026-09-17:* it replays only the benign
  staging probes, because a session refuses the destructive ones on its own judgement even when allowed,
  so they can have no baseline; it batches and retries, and it trusts its throwaway workspace.
- **D5 — the review stack.** CI → **fresh reviewer** (Claude `pr-reviewer` subagent, general, with repo
  context) → **one external general pass** → **one external security pass, only when a PR touches a
  security path**. The builder merges once CI is green and findings are fixed or answered — **any tier,
  template default included**. *Which PRs get the stack:* template + golden-beans = every non-trivial PR
  (`--skip-trivial` keeps docs-only/tiny out); medusa-bonsai = money/auth PRs only (its operating
  posture), others merge on CI. Everything runs locally on the CLIs' own accounts — **no API key**.
- **D6 — reviewer selection (`review-route.mjs`, ~40 lines).** Preference order `codex → agy → vibe →
  claude` is one editable list. The builder's family never reviews. The **security pass takes the
  highest-preference eligible family** (the strongest measured signal goes to the riskiest read), the
  general pass the next one; with a single available family it runs both prompts as two passes and the
  PR body says so. A capped family simply falls to the next — the REFUND ASK / `--fallback-after` / DARK
  protocol and the four-row table are deleted.
- **D7 — the security trigger is deterministic and lean.** A PR gets the security pass when any changed
  path matches the project's `securityPaths` globs in `scripts/review-config.json` (payments, checkout,
  webhooks, auth, middleware, migrations, secrets config) **or** its body declares `risk: high` /
  `risk tier: HIGH`. **Enforcement is honest about what it is:** `review-route.mjs` prints the command
  and `cross-review.mjs` marks the general pass's comment *"the security lens is OWED on this PR"* when
  the trigger fires without it — the lens is never auto-run behind the operator's back, and skipping it
  is visible on the PR rather than silent. Each basename glob is paired with a `/**` directory form: in
  an App Router every route file is `route.ts`, so `**/*webhook*` alone would be near-dead (caught by the
  fresh review of dobby-foundation#11). The pass reads **only** the security checklist, reports Blocking / Should-fix with an
  input → path(file:line) → impact scenario, **no nits**, and has explicit exclusions (theoretical DoS,
  rate-limit advice, tests, anything CI enforces). One pass per PR; re-run only when a fix touches a
  security path. No new check, no new doc, no CI job.
- **D8 — one shared prompt, two lenses.** `cross-review.prompt.md` = *Shared bar* (single pass,
  file:line verification bar, nit cap of 3 with the rest counted, skip what CI enforces, re-review
  convergence = Important only) + *Project rules* (fill-in) + *CLI-only* (no host tools, diff below).
  `cross-review.security.prompt.md` = the same *Shared bar* + the security checklist. The fresh reviewer
  reads the shared prompt's first two sections; the CLI reads everything.
- **D9 — a silent reviewer is a failed run.** Pure `assertReviewOutput()` rejects empty, whitespace-only
  or structureless output (no severity heading and no explicit clean verdict); the run exits non-zero
  and posts a failing `cross-review/<lens>` commit status on the PR head (success on a real review).
  **Amended 2026-09-16 (S2a):** codex is **NOT** hard-pinned. Its version is recorded in the comment and
  flagged when it differs from the last verified one — a hard pin would take the only external pass
  offline on every routine CLI update, which is the "one busy model took a whole family offline" failure
  already recorded here for agy, and the output guard covers the actual risk (a changed print contract).
  agy keeps its hard pin: its print contract has broken twice. Proven against a stub CLI that exits 0
  silently. **D16 — the doctor merge is medusa-only:** it is the one repo that had two doctors;
  golden-beans has one and the template had none, and the three repos' CLI libraries have diverged too
  far for a shared merged doctor to be a port rather than a rewrite.
- **D10 — deterministic security floor (done 2026-09-16, repo settings, no code).** Secret scanning +
  push protection enabled on all five repos (the frontend already had it); CodeQL default setup enabled
  on `miyagisanchezcommerce` and `medusa-bonsai-backend` (golden-beans already runs a CodeQL workflow).
  **S2.7 is re-scoped to D7 + D10**: the `claude-code-security-review` Action needs an API key and is
  dropped; `cross-review.security.prompt.md` is folded into the lens, not discarded.
- **D11 — where things live.** The fresh reviewer ships in the plugin (`plugins/ways-of-work/agents/
  pr-reviewer.md`, repo names resolved from the project's `AGENTS.md`); medusa keeps its filled copy.
  Shared scripts are **byte-identical copies** in `template/scripts/` and both consuming repos, and the
  S3 drift check compares them to a sibling `dobby-foundation` checkout when one exists (unavailable
  otherwise, stated).
- **D12 — the WAYS-OF-WORKING renderer.** Source `template/Roadmap/WAYS-OF-WORKING.template.md` with
  `{{fill:<key>}}` markers + `Roadmap/fill-ins.yml` (a strict subset: `key: |` block scalars and quoted
  scalars; anything else is a hard error). Missing key ⇒ fail; unused key ⇒ fail; output carries a
  generated banner; render twice ⇒ byte-identical. Consumers vendor the template file. The key list is
  locked at the start of Sprint 3 **after diffing both consuming files** and recorded here as D12a.
- **D12a — the slot keys (locked 2026-09-16):** `product_owner`, `operating_posture`, `design_is_scope`,
  `deploy_rail`, `review_scope_note`, `security_floor`, `kill_switch_dod`, `language_policy`,
  `project_sections`, `tooling_table`. A column-0 `#` line followed by indented block text is a hard error
  (never a silently dropped heading). Consuming projects keep only what the template does not state;
  every paragraph they drop is classified in `RETROSPECTIVE.md`'s cut ledger.
- **D13 — `epic-dod.mjs --check <macro/slug>` owns five items:** README `status: shipped`; every
  `sprint-N.md` Status line ✅ (or 🟩); `RETROSPECTIVE.md` with a real `_Closed: YYYY-MM-DD…`; every sprint
  **doc** (amended: not only its status line — real sprints cite their PRs in the body) cites ≥1 PR/commit
  ref that is merged; no `feat/<slug>*` branch left on origin. **Unverifiable ⇒ *unavailable*, never
  green.** Citations resolve only from a PR link, `owner/repo#N`, a known repo name, or — in a single-repo
  project that declares `bareRefsRepo` — a bare `#N`; in a multi-repo project a bare `#N` is ambiguous and
  never guessed (a whole-text scan against the docs repo had verified the wrong PRs on real epics).
  `sprints_in` is resolved against GitHub, not trusted. Exemptions live in a ledger with reasons; a stale
  exemption fails.
- **D14 — S2.8's gate is met by this epic's own PRs:** the one-general-pass + fresh-reviewer shape runs
  on ≥5 real PRs across ≥2 repos (S1 and S2a PRs), recorded in `sprint-2.md`, before the router-collapse
  PR merges.
- **D15 — delivery shape.** One orchestrator (Opus) builds all three sprints; no delegation. Stacked
  branches per repo: `feat/ways-of-work-lean-pass` (S1) → `-s2` (2.2–2.7) → `-s2b` (2.1, 2.5 router,
  2.8) → `-s3`. `dobby-foundation` gets its own `Roadmap/` (S1.1); medusa's copy of this epic keeps its
  frontmatter (its board's status SSOT) and points here.

## Scope — stories

| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 `dobby-foundation` gets its own `Roadmap/` | low |
| 1 | 1.2 A committed `permissions.allow` in the template | low |
| 1 | 1.3 A `permissions.deny` that is the real guardrail | high |
| 1 | 1.4 Auto mode on (user scope), deny list as the floor — *corrected by D3* | high |
| 1 | 1.5 Retire `settings.local.json` accretion in both consuming repos | low |
| 2 | 2.1 The review policy, rewritten (D5) | high |
| 2 | 2.2 `cross-review.prompt.md` becomes the one shared review prompt | low |
| 2 | 2.3 Port `pr-reviewer.md` into the plugin, unconditional | low |
| 2 | 2.4 The empty-output guard becomes a hard fail | high |
| 2 | 2.5 Collapse the router, delete the capped-roster protocol, merge the doctors | low |
| 2 | 2.6 Demote the planning panel to on-demand | low |
| 2 | 2.7 Security review — lean external lens + CodeQL/secret scanning — *re-scoped by D7, D10* | high |
| 2 | 2.8 Delete the second cross-family pass | high |
| 3 | 3.1 `WAYS-OF-WORKING.md` diet to ≤160 lines | low |
| 3 | 3.2 `groom/SKILL.md` progressive disclosure to ≤220 lines | low |
| 3 | 3.3 `epic-dod.mjs --check` — script the derivable five | low |
| 3 | 3.4 De-duplicate the escalate triggers to one place | low |
| 3 | 3.5 Regenerate both consuming `WAYS-OF-WORKING.md` from the template | high |

## Deploy order

**No runtime deploy.** Config, docs and scripts across three repos. The ordering that matters is
**safety ordering, and it is the epic's actual guardrail:**

1. **S1.3 (deny) ships BEFORE S1.4 (auto mode).** Never the other way. A deny list that lands after
   auto mode is a window where an agent may run anything unattended.
2. **S2.4 (empty-output hard fail) and S2.3 (unconditional fresh reviewer) ship BEFORE S2.8
   (deleting the second pass).** Removing corroboration before its replacement exists is the one way
   this epic causes a production incident.
3. **S3.5 (regeneration) is last**, after both consuming files have been diffed against their
   rendered form and every project-specific paragraph has become a named slot or been deliberately
   dropped and listed in the retro.

Branches stack: `feat/ways-of-work-lean-pass` → `-s2` → `-s3`, one PR per sprint, merged in order.
All three sprints share `template/` and the `groom` skill by construction — **stack or pay.**

**Model routing:** Sprint 2 defines the contract everything else imports (the review policy) and
Sprint 1 carries the auto-mode risk — both on the stronger model. Sprint 3 is mechanical over locked
decisions apart from S3.5, which is uphill and stays on the stronger model. Review is inverted: the
fresh-reviewer pass on Sprints 1 and 2 runs on the strongest model available.

## Definition of Done (epic)
- [ ] All sprints merged to `main` + smoke-tested (gaps stated)
- [ ] Each `sprint-N.md` has its smoke walkthrough
- [ ] This README marked ✅; every sprint status ticked with commit refs
- [ ] `RETROSPECTIVE.md` written
- [ ] Product poster (`Roadmap/README.md`) updated
- [ ] Team memory + `MEMORY.md` index updated
- [ ] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] **Kill-switch: carve-out, decided at grooming.** No runtime seam exists — this epic ships config,
      markdown and one check script. **Git is the rollback**, and the safety property is the *ordering*
      in *Deploy order* above (deny before auto mode; corroboration before deletion), not a flag.
- [ ] **Every cut paragraph accounted for** — moved to `references/`, replaced by a check, or listed
      as deliberately dropped in `RETROSPECTIVE.md`. **No silent deletions.**
- [ ] Feature branches deleted; **this README's frontmatter `status: shipped`** (run `node scripts/build-order.mjs`)
