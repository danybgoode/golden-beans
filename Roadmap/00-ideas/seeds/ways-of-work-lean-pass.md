---
title: "Ways-of-work lean pass — remove the training wheels, close the adoption gap"
slug: ways-of-work-lean-pass
status: scaffolded
area: "09"
type: chore
priority: wave-2026-09-16-plugin
appetite: L
underwritten_by: wave-2026-09-16-plugin
risk: high
epic: "09-platform-infra/ways-of-work-lean-pass"
build_order: 29
updated: 2026-09-16
---

# Pitch — Ways-of-work lean pass

> **Repo note.** The work lands in `dobby-foundation`; the seed lives here because that repo has no
> funnel of its own (precedent: `Roadmap/09-platform-infra/dobby-foundation/`). Giving it its own
> `Roadmap/` is **Story 1.0 of this epic** — see the bill of materials.

## Mirror-back
> The operating system works, and it has accreted. Cut the ceremony that a Step-2/3 operation no
> longer needs, collapse the three-layer review stack to one good native pass plus one fresh
> reviewer, fix the permissions accretion that makes every session synchronous, and turn the rules
> that are currently *prose a builder must remember* into checks. Full findings:
> [`00-ideas/audits/ways-of-work-audit-2026-09-16.md`](../audits/ways-of-work-audit-2026-09-16.md).

## Problem

`WAYS-OF-WORKING.md` is 446 lines and is loaded by **every** builder session, **every** groom
session and the pr-reviewer subagent. `groom/SKILL.md` is 514. Together ~14k tokens before a line of
code. They were written for one supervised agent and hardened epic-by-epic, so every lesson became
another paragraph instead of replacing one. The escalate-don't-guess trigger list appears **four
times**, three of them prefaced "one SSOT, don't fork a second copy here."

Meanwhile the Step-2→3 unlocks the ladder actually names are the parts built least:

- **Auto mode / pre-approved permissions:** `medusa-bonsai/.claude/settings.local.json` is **187
  lines** of one-off allows, accreted one interruption at a time — including approvals to `sed -n
  '1,60p'` a file and to `echo "tsc exit=$?"`. Each line is a session that stopped and waited for a
  human. **There is no `deny` list at all**; AGENTS rule #4 ("never run `vercel deploy`") is enforced
  by prose.
- **Review depth:** three layers per HIGH PR (two cross-family CLI passes + a fresh reviewer) and two
  per LOW, held together by a four-row router, a REFUND-ASK/`--fallback-after`/DARK-layer protocol,
  and two doctor scripts — ~2,400 lines of plumbing whose only job is keeping foreign CLIs alive.
  With a documented failure mode where a run exits 0 with empty output and **reads as a clean review**.
- **Automated security review:** absent.

## Appetite

**L — multi-wave**, re-bet at each boundary.
- **W1 — permissions & auto mode.** Smallest, highest leverage, unblocks everything else.
- **W2 — the review collapse.** Policy + native review + `REVIEW.md` + port the pr-reviewer agent.
- **W3 — the ceremony diet.** Doc cuts, progressive disclosure, derivable-DoD script.

Circuit breaker per wave. **W1 must ship on its own** — if W2/W3 get re-bet away, W1 still pays.

## Outcome & signal

After this ships: a builder session runs an epic without stopping for a permission prompt that isn't
a genuine money/auth/deploy decision; every PR gets exactly one automated review pass plus one fresh
reviewer, with no reviewer-plumbing to maintain; and the docs a session must load to orient drop
below ~6k tokens.

**How you test it:** kick off a LOW-tier epic in `golden-beans` from a clean session and count the
permission prompts (target: **0** that aren't on the deny list). Open a PR and confirm exactly two
review artefacts appear — the native review's check run, and the fresh reviewer's finding list. Then
`wc -l Roadmap/WAYS-OF-WORKING.md` in a freshly spawned project.

## Stage-2.5 bucket

**Mostly light-enhancement, deliberately.** The review layer is an *adoption* (a shipped Anthropic
product replaces ~1,900 lines of ours), the permissions layer is *configuration we never wrote*, and
the ceremony diet is *deletion*. The only genuinely-new build is one small script (`epic-dod.mjs`).
**That is the point: the cheapest version of this epic is mostly subtraction.**

## Bill of materials (What / Why)

| What | Why |
|---|---|
| **S1.0 — `dobby-foundation` gets its own `Roadmap/`** | It has two consumers and is a product. Planning it inside one consumer is how fork-drift eventually reaches the anti-fork-drift repo. Spawn it from its own `template/` — free dogfooding |
| **S1.1 — committed `permissions.allow` in `template/.claude/settings.json`** | ~40 verbs that are always safe here. Committed + reviewed + portable — the opposite of an untracked accretion log |
| **S1.2 — `permissions.deny`, the real guardrail** | `vercel deploy`, `--prod`, `supabase db push`, `git push --force`, `rm -rf`, money/auth env writes. Turns AGENTS rule #4 from prose into a check |
| **S1.3 — auto mode on, deny list as the floor** | The ladder's literal Step-2 requirement. Not "approve everything" — "the dangerous set is enumerated, everything else flows" |
| **S1.4 — migrate medusa's 187-line `settings.local.json`** | Triage into the committed allow list / delete; prove the accretion stops |
| **S2.1 — rewrite `WAYS-OF-WORKING` → *Review & merge*** | 21 paragraphs → one diagram + ~15 lines: **CI → one cross-family pass → one fresh reviewer → risk tier decides the merge.** Unconditional, no tier branching on the reviewer |
| **S2.2 — widen `cross-review.prompt.md` into the one shared review prompt** | Read by **both** readers — the external CLI *and* the fresh reviewer. Add the knobs we never had: a **nit cap**, skip paths CI already enforces, a **verification bar** ("behaviour claims need a `file:line` citation, not an inference from naming"), and **re-review convergence** ("after the first pass, Important findings only"). One prompt, two independent readers, no drift |
| **S2.3 — port `.claude/agents/pr-reviewer.md` into the plugin** | The policy is in the plugin; the agent implementing it is not. Generalize the repo names; keep its doctrine verbatim. Update its "where you sit in the stack" section: **second** layer now, not third |
| **S2.4 — the empty-output guard becomes a hard fail** | With two passes, a CLI exiting 0 with no output was caught by the other. With one, **it reads as a clean review and nothing contradicts it.** Assert non-empty output, pin the version, fail the check loudly. **This is now the single most load-bearing line in the review policy** |
| **S2.5 — collapse the router** | `review-route.mjs` (273) + test → a ~30-line rule: *the highest-preference family that did not build the diff*. Keep the guard (a family never reviews its own diff — a real silent-downgrade risk); delete the four-row table |
| **S2.6 — delete the capped-roster protocol** | REFUND ASK / `--fallback-after <minutes>` / DARK-layer recording existed because *two* external passes could not both be available. With one, a capped family falls to the next in the preference order and the run continues. ~40 paragraphs of doctrine evaporate |
| **S2.7 — one `cross-agent-doctor.mjs`** | `codex-doctor.mjs` + `agy-doctor.mjs` are the same diagnosis shape twice |
| **S2.8 — demote `cross-panel.mjs`** | Keep the script; **remove groom's obligation to surface a one-line offer** on every spike (Stage 2) and every architecture fork (Stage 4). On-demand via the `Panel:` verb only. That obligation is ceremony, not a rail |
| **S2.9 — automated security review** | The Step-2 guardrail we simply don't have. The open-source `anthropics/claude-code-security-review` Action in our own CI on our own key, plus `/security-review` locally. **No plan change, no managed service** |
| **S3.1 — `WAYS-OF-WORKING` diet to ~150 lines** | Epic-mode → 5 sentences. Betting → the table + 4 rules, philosophy to `references/shapeup/`. Conventions → whatever can't be a check |
| **S3.2 — `groom/SKILL.md` progressive disclosure** | Stages stay in `SKILL.md`; question bank, archetype table, kill-switch taxonomy move to `references/`. The ladder's own "break CLAUDE.md into lazy Skills" guidance |
| **S3.3 — `epic-dod.mjs --check`** | 5 of the 9 epic-DoD items are derivable from git + frontmatter + file existence. Script them; leave 3 lines of prose for the ones needing judgement |
| **S3.4 — de-duplicate the escalate triggers to one place** | Named four times today. One canonical block, referenced |

## Scope

**In v1:** the three waves above, in `dobby-foundation` + the `medusa-bonsai` / `golden-beans`
migrations that prove they work.

**Out of v1 (no-gos):**
- **The dark-skill debt and the medusa extraction** — that is its own epic
  ([`plugin-audit-and-extraction`](plugin-audit-and-extraction.md)) and must run *after* this one.
- The frontmatter contract / Claude Mods work — its own epic, after the extraction.
- Retiring `codex-delegate.mjs`. It is a genuine second worker pool; deciding its fate is a
  separate call, not a rider on the review collapse.
- Any change to the appetite/betting model itself. We are shortening how it's *written*, not
  changing what it *says*.
- Mobile / remote-control adoption (Step-2 item, real, but not this bet).

## Rabbit holes

- **One pass has no corroboration — that is the whole risk of this wave.** Two families disagreeing
  was how an argued-down finding got a second vote, and how an empty-output run got caught. Removing
  the second pass is correct *only if* S2.4's non-empty assertion actually lands and the fresh
  reviewer becomes unconditional. **If either of those slips, do not ship the deletion** — an
  uncorroborated pass that can silently return nothing is strictly worse than two noisy ones.
- **Deleting a review layer is a security decision.** Do not remove the second pass until the
  one-pass + fresh-reviewer shape has run green on at least 5 real PRs across two repos, with the
  empty-output guard proven by deliberately feeding it a broken CLI. **Sequence the deletion last
  in W2.**
- **The fresh reviewer becomes unconditional, which raises LOW-tier cost.** Accepted deliberately —
  but it is real, and `--skip-trivial` is the pressure valve. If LOW-tier PR volume makes it bite,
  the honest lever is widening skip-trivial, **not** quietly making the reviewer conditional again.
- **The fresh reviewer must not be weakened while being generalized.** Its value is in the specifics:
  read the prior review comment first, don't re-litigate fixed findings, **do** check every finding
  the builder argued down, spend effort on what a diff-scoped reviewer can't see. Generalize the repo
  names and nothing else.
- **Auto mode + a wrong deny list is the one way this epic causes a production incident.** Build the
  deny list from the three repos' AGENTS "cannot be violated" rules, and test it by *attempting* each
  denied command in a throwaway session before the allow list goes anywhere near a real epic.
- **A doc diet can delete a load-bearing sentence.** Every cut paragraph must be either (a) moved to
  `references/`, (b) replaced by a check, or (c) explicitly listed in the retro as dropped. **No
  silent deletions** — that's how "two cross-family passes" became policy nobody could trace.

## What already exists (reuse, don't rebuild)

- `dobby-foundation/template/.claude/settings.json` — exists but carries *only* marketplace +
  plugin config. The permissions blocks are a pure addition to a file already in place.
- `medusa-bonsai/.claude/settings.json` — already proves the hooks block works (`PostToolUse` →
  `doc-format.mjs`).
- `medusa-bonsai/.claude/agents/pr-reviewer.md` — port, don't write.
- `medusa-bonsai/scripts/cross-review.prompt.md` + `cross-review.security.prompt.md` — the *content*
  of the new `REVIEW.md` files.
- `dobby-foundation/scripts/check-plugin-leaks.mjs` — its `ALLOW`-with-a-written-reason discipline is
  exactly the pattern `epic-dod.mjs` should copy.
- `references/Steps-of-AI-Adoption.md` — the scoring rubric for "did this close the gap".

## UX heuristics & rails check
- **CI guards covering this surface:** `check-plugin-leaks.mjs`, `check-skill-scripts.mjs`,
  `guards.yml`, `doc-format.mjs` (medusa). Any doc cut must keep `check-skill-scripts` green.
- **Audits-lens findings that apply:**
  [`ways-of-work-audit-2026-09-16.md`](../audits/ways-of-work-audit-2026-09-16.md) §1, §2, §3, §4.
- **Design-language debt:** n/a.

## Kill-switch / runtime gate (risk: high — Stage 6b)

**Is there a runtime seam a kill-switch can gate?** **No — carve-out.** This epic ships config files,
markdown and one check script; there is no runtime seam to flag. The rollback mechanism is git:
every wave is its own PR, and `settings.json` / doc changes revert cleanly. **The deny list is the
guardrail, and it ships before auto mode does** — that ordering is the safety property, not a flag.

Risk is HIGH regardless (auto mode changes what an agent may do unattended), so **the product owner
merges W1**, per the standing rule.

## Acceptance criteria

1. A freshly spawned project from `template/` has a committed allow list and deny list, and running a
   LOW-tier epic in it produces **zero** permission prompts outside the deny list.
2. Each denied command, attempted in a throwaway session, is actually refused.
3. A PR in `golden-beans` shows exactly **two** review artefacts: one labelled cross-family comment
   from a family that did **not** build the diff, and the fresh reviewer's findings. Never a second
   cross-family comment; never zero fresh-reviewer passes, whatever the tier.
4. `cross-review.prompt.md` demonstrably changes behaviour for **both** readers — a deliberate
   nit-storm PR is capped at the stated number, and a finding lacking a `file:line` citation is not
   posted, by the CLI and by the subagent alike.
5. **A cross-review run against a deliberately broken CLI fails the check** rather than reporting
   clean. This is tested, not asserted.
6. Security review runs on every PR in our own CI and its findings land somewhere a human sees them.
7. `node scripts/epic-dod.mjs --check <epic>` reports the derivable five correctly on a known-closed
   epic and a known-open one.
8. `WAYS-OF-WORKING.md` ≤ 160 lines and `groom/SKILL.md` ≤ 220, with every cut paragraph accounted
   for (moved / replaced by a check / listed as dropped) in `RETROSPECTIVE.md`.
9. The escalate-don't-guess trigger list appears exactly **once** across the plugin and template.
10. `golden-beans` and `medusa-bonsai` both serve a **regenerated** `WAYS-OF-WORKING.md` — rendered
    from the template plus a committed per-project fill-ins file — and re-running the renderer with
    no source change is a byte-for-byte no-op.

## Open risks / research

- **Plan gate** on managed Code Review (see rabbit holes) — the one genuine unknown.
- **Auto mode's classifier** is tuneable per the ladder's Step-3 guidance but we have no usage data
  yet. Expect a follow-up chore one wave after W1, not a story inside it.
- **Decided: the consuming copies are REGENERATED, not hand-merged.** That makes the template the
  single source and ends the fork — but it needs a mechanism this repo does not have yet, and
  designing it is a real story, not a footnote:
  - The template's `TEMPLATE FILL-IN` markers become **named slots**, and each consuming project
    commits a `roadmap/fill-ins.yml` (deploy rail, tooling table, language policy, flag mechanism,
    repo list) that the renderer substitutes.
  - `node scripts/render-ways-of-working.mjs` produces the consuming file; **re-running it with no
    source change must be a byte-for-byte no-op** (same discipline as `pack-skills.mjs`), so
    regeneration is boring rather than noisy.
  - `golden-beans` already ships `check-template-drift.mjs`, which fails on an *unfilled* placeholder
    — extend it to also fail when the rendered file has **drifted from what the renderer would
    produce**. Drift detection is what makes regeneration stick.
  - **Both consuming files must be diffed against their regenerated form before the switch**, and any
    genuinely project-specific paragraph either becomes a named slot or is deliberately dropped and
    listed in the retro. **This is the single most likely place this epic quietly loses content.**
