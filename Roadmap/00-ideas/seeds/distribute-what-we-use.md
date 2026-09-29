---
title: "Distribute what we use: one review rail, Jev and notify setup, schedulers, build view"
slug: distribute-what-we-use
status: scaffolded
area: "09"
type: feature
priority: "single-product-wave-B"
appetite: M
underwritten_by: null
risk: high
epic: "09-platform-infra/distribute-what-we-use"
build_order: 47
updated: 2026-09-29
---

# Seed: Distribute what we use: one review rail, Jev and notify setup, schedulers, build view

From the [single-product audit](../audits/single-product-and-grooming-2026-09-28.md) §0.3. **Decisions:** E3, E4
(approved 2026-09-28). **Absorbs** [`review-rail-one-implementation`](review-rail-one-implementation.md) as Sprint 1
(the product owner's call, 2026-09-29: "with review-rail-one-implementation").
Groomed 2026-09-29: **feature · shaped bet · appetite M (one wave) · risk high**. The review rail gates every PR here,
and every change ships as a kit release. Stage-2.5 bucket: **mostly light enhancement.** Every rail already exists
and runs in this repo. The work is collapsing forks, adding them to the kit closure, and writing two setup routes.
Only the schedulers' bootstrap is genuinely new.

**As a** stranger who installed the Golden Frijoles plugin, **I want** the review rail, the Jev guards, notifications,
the routines and the build view to work in my repo the way they work in Golden Frijoles' own, **so that** the
kickoff's review step, the "Currently building" line and the merge report don't silently do nothing.
**As the product owner, I want** one implementation of the review rail, **so that** a reviewer fix is one PR, not three.

## What grooming measured (2026-09-29, against `main` @ 93aec48)

- **The review rail is two forks in this repo, plus a third in medusa-bonsai.** `scripts/cross-review.mjs` has 698
  lines and `skills/template/scripts/cross-review.mjs` has 506. `lib/cross-agent-cli.mjs` has 1,324 vs 695 lines
  (51 vs 34 exports). `cross-review.prompt.md` differs, and so does `review-config.json`. `cross-panel.mjs`,
  `review-route.mjs`, `lib/review-guard.mjs` and `cross-panel.prompt.md` are **already byte-identical**. The fork
  history is recorded in `scripts/README.md` (hand-patched for jev-semantic-guards on 2026-09-23). This repo's copy
  has the context, pairing and transient-agy work. The template copy has the wave-2 config loader (`readSection`).
  So the superset is a merge of both, not either one.
- **The template tells you to run a file it doesn't ship.** `skills/template/scripts/lib/cross-agent-cli.mjs:348` says
  `node scripts/agy-doctor.mjs --fix`. `agy-doctor.mjs` (309 lines) exists only in this repo's `scripts/`, and
  medusa-bonsai ships `cross-agent-doctor.mjs` (417 lines, covers codex too) instead. The template pin is agy 1.2.5,
  verified 2026-09-17, and ours is 1.2.12, verified 2026-09-28.
- **The kit carries half the rail.** `build-kit --list` includes `cross-panel.mjs` and `lib/cross-agent-cli.mjs`
  through `babysit-pr`. It doesn't include `cross-review.mjs`, `review-route.mjs`, `lib/review-guard.mjs` or
  `build-state.mjs`. `emit-epic-kickoff.mjs` still tells every builder to run `node scripts/review-route.mjs`, and
  its test asserts that.
- **The Jev ask is real but can never fire for a stranger.** D12's unanswered-egress ask exists
  (`lib/jev.mjs:189`, `jevContext` → `needSetting('jev.egress')`). But `effectiveMode()` returns `configured off` at
  line 186 *before* the egress branch. With no `jev.config.json`, every rail defaults to `off`, so the ask never
  runs. This is a **bug**, not a missing feature. The audit's reading is confirmed.
- **`gf doctor` already does item 6.** golden-frijoles-plugin S5.3 (`packages/cli/src/modules.ts`) prints one line
  per module in three states (configured / not configured / could not look), **read from the kit registry**.
  `review.families`, `review.reviewScope`, `review.securityPaths`, `jev.egress` and `reporting.destination` are
  already rows. A new registry row appears in doctor with **no CLI change**, which matters because a CLI release is
  a hand publish (D14).
- **Notifications:** the template ships `lib/telegram-format.mjs` + `lib/reporting-config.mjs` (Telegram only) and
  `reporting.config.example.json`, but the kit doesn't carry the example. The Slack sender
  (`scripts/slack-notify.mjs` + `lib/slack-text.mjs`, tested) exists only here.
- **Schedulers:** the seven routine prompts + runbook live in `skills/template/scripts/routines/`, full of
  `TEMPLATE FILL-IN` / `<app-repo>` placeholders, and aren't in the kit. `skills/template/.github/workflows/` already
  has `jev-expiry.yml` (a cron), `guards.yml` and `ci.yml.example`.
- **D5 (public-monorepo):** 81 of `scripts/` are byte-identical to `skills/template/scripts/` and 5 differ. That epic
  handed the dedupe to this one.

## Research (present-day facts)

- **Claude Code routines** are still a research preview: created at claude.ai/code/routines, from the Desktop app or
  with `/schedule` in the CLI (conversational, no import from a file). **Minimum interval one hour.** There's a daily
  per-account run cap. The Default environment's **Trusted** network allows only a default allowlist, so a routine
  that posts to Telegram needs a custom environment, while connectors bypass the allowlist.
  ([docs](https://code.claude.com/docs/en/routines))
- **GitHub Actions `schedule` workflows are disabled automatically after 60 days without repository activity** in
  public repos, and nobody is notified. ([report](https://zenn.dev/hellorusk/articles/fc6d4696f5b269?locale=en),
  [community](https://github.com/orgs/community/discussions/184653))

## Bill of materials

| What | Why |
|---|---|
| **One review rail**: the superset `lib/cross-agent-cli.mjs` + `cross-review.mjs` + `cross-review.prompt.md` in `skills/template/scripts/`, with each consumer's **old** tests run against it | Three forks mean every reviewer fix happens three times, and LEARNINGS says a shared copy can be weaker than the local one it replaces. |
| **One doctor**: `cross-agent-doctor.mjs` (medusa's, covers codex + agy) promoted, and every fix instruction names it | The template's fix instruction points at a file it doesn't ship, so the agy seat stays refused after any CLI bump. |
| **Copy-back in the same wave**: this repo's `scripts/` and medusa-bonsai get the same bytes | "The copy-in is a gate, not a chore": consumer gates find what the source can't. |
| **Review rail + `build-state.mjs` in the kit closure** (a skill's `requires_scripts`), and the build-view hook uses the kit's copy when the project has none | E3. The kickoff's review step and the build view then work in a kit-only repo. |
| **A byte-parity guard** over `scripts/` ∩ `skills/template/scripts/`: identical, or listed with a reason | Handles D5 without deleting anything. It stops the 81 copies drifting into the next three-way fork. |
| **Loader fix**: unanswered egress asks even when rails default off | The D12 promise ("ask, never silently off") is currently dead code for exactly the user it was written for. |
| **Jev setup route** in the umbrella skill: one sentence on what leaves the machine, signup link, key → `.env.local`, a 10-fixture `jev-eval --live` as proof, then the `jev` section | The key is the one thing nobody is ever told to get. The eval proves the key works on *our* fixtures, not their text. |
| **Notify setup route**: BotFather steps, chat id from the bot's first message (`getUpdates`), a test send; `reporting.config.example.json` in the kit; the Slack webhook sender promoted | E4 (bring your own bot, guided). Setup offers Slack today with no sender behind it, so either ship the sender or stop offering Slack. |
| **Routines as kit assets + a `/schedule`-ready bootstrap** that fills the placeholders from `golden-frijoles.config.json` and refuses while any stays unfilled | Routines can't be imported from a file, so the product is the filled, paste-ready prompt plus the runbook. The grep-to-zero refusal copies `check-template-drift`. |
| *(below the cut line)* **Actions cron templates** for the model-free parts | A second scheduler for people without routines. Actions disables cron after 60 quiet days, so it needs a keep-alive or a loud note. |

## Rabbit holes (patched now)

- **Which copy is the base.** Neither. The architect's lock byte-compares all three and builds the superset
  export-by-export. Old tests from **both** consumers run against it (`git show origin/main:<test>` into a temp
  file), and every failure is read, not deleted as superseded.
- **medusa-bonsai isn't in this checkout.** The copy-back is a cross-repo PR. The lock reads its
  `cross-agent-doctor.mjs` and fork first. If the repo is unreachable, S1 ships the two in-repo copies and the
  medusa PR is owed and named.
- **The build-view hook is automatic, and automatic behaviour must not run repo-supplied code** (LEARNINGS,
  golden-frijoles-plugin). When a project has no `scripts/build-state.mjs`, the hook runs the **kit's** copy
  directly. It never looks up a same-named file a stranger's repo might own.
- **Reviewer CLIs and `gh` are the user's installations.** Missing means the "could not look" state plus the install
  line (the kit's zero-dependency rule), never a crash or a silent pass. A layer nobody can run is reported
  **DARK**, as it is today.
- **Every edit under `skills/` is a plugin release** (check-release). Batch it into one release per sprint, and wait
  for the tarball URL to return 200 before a consumer pins it (LEARNINGS, wave 2).
- **Telegram:** `getUpdates` returns nothing while a webhook is set on the bot, and group chats need privacy mode
  considered. The route says both. A routine that posts to Telegram needs a custom network environment, and the
  runbook says so.

## No-gos

- A hosted "Connect Telegram" (E4: later, an account feature). Slack is an incoming webhook only, with no app or OAuth.
- **No CLI change.** Doctor is registry-driven, so new rows are free, and a CLI release is a hand publish (D14).
- **No deletion of the 81 duplicate scripts.** The parity guard stops the drift, and running this repo from the kit
  is a separate dogfood bet (golden-frijoles-plugin S2.5's deletion rule).
- No new review family, and review never becomes a gate. A non-Claude *model* scheduler doesn't ship. Cron templates
  cover only model-free parts.
- Jev never sends a stranger's text before they answer `egress: true`.

## Slices (one wave, stacked branches `feat/distribute-what-we-use` → `-s2` → `-s3` → `-s4`)

| Sprint | Stories | Risk | QA stage |
|---|---|---|---|
| **S1: One review rail** *(absorbs review-rail-one-implementation)* | 1.1 superset `cross-agent-cli` + `cross-review` + prompt in the template, old tests from both consumers green against it · 1.2 one doctor (`cross-agent-doctor.mjs`), every fix instruction names it, and `agy-doctor.mjs` becomes a delegating alias · 1.3 copy-back: this repo's `scripts/` byte-equal for the rail, and a medusa-bonsai PR | high | `node --test` on both trees, plus a live cross-review run on S1's own PR through the new rail (it reviews itself). |
| **S2: What a stranger's kit carries** | 2.1 review rail (`cross-review`, `review-route`, `review-guard`, doctor, prompts, a default `review-config`) in the kit closure, with the kickoff's review step proven in an isolated home · 2.2 `build-state.mjs` in the kit, and the hook runs the kit copy when the project has none · 2.3 byte-parity guard over the shared scripts | high | Kit tarball test + isolated-home install (golden-frijoles-plugin S5 recipe). Owed to Daniel: stranger walkthrough on a clean machine. |
| **S3: Jev and notify, set up rather than documented** | 3.1 **bug**: unanswered egress asks with no `jev.config.json` (reproduction and regression spec) · 3.2 Jev setup route · 3.3 notify setup route + `reporting.config.example.json` in the kit + Slack webhook sender promoted | high (3.1 is egress) · low (3.2, 3.3) | Regression spec observed failing first. Owed to Daniel: a Telegram test send from his own bot (third party). |
| **S4: Schedulers** | 4.1 routine prompts as kit assets + a `/schedule`-ready bootstrap with the grep-to-zero refusal · *(cut line)* 4.2 Actions cron templates for model-free parts | low | `routines.test.mjs` extended. Owed to Daniel: stand up one routine from the bootstrap. |

**Cut line:** 4.2 goes first if the appetite runs short, then 2.3, then the Slack half of 3.3. None of them moves a
stranger from "nothing happens" to "it works".

**Model routing:** S1 and 3.1 stay on the strongest tier (review rail = shared infra, egress = privacy). 2.x, 3.2,
3.3 and 4.1 go to builders against the locked contract.

**Kill switch (Stage 6b): carve-out, no flag.** No engine runtime seam changes. Every change ships as a pinned kit
version, so rollback means pinning the previous one. Every new rail stays off until the user answers its setup
question (egress stays their explicit choice), and review is advisory by construction.

## Acceptance (Daniel can check)

- `cmp` of the review-rail files between `scripts/` and `skills/template/scripts/` prints nothing, and medusa-bonsai's
  PR is merged or named as owed.
- `node scripts/cross-agent-doctor.mjs --fix` exists in the template, and no file names a doctor that doesn't exist.
- In a clean home with only the plugin installed, the epic kickoff's review command prints a route. The status line
  shows "Currently building" on a `feat/*` branch.
- In a repo with no `jev.config.json`, the first guarded run asks the egress question instead of staying silently off.
- Following the notify route with a fresh bot delivers a test message. `gf doctor` shows Operate as configured.
- The bootstrap prints a paste-ready `/schedule` prompt for one routine with no placeholder left, and refuses while
  one remains.

## Reuse

`skills/scripts/build-kit.mjs` + `check-skill-scripts.mjs` (the closure is the manifest), `render-skill-adverts.mjs`,
the kit registry + `needSetting` (D11/D12), `gf doctor` module lines (S5.3), the isolated-home install recipe (S5),
`scripts/slack-notify.mjs` + `lib/slack-text.mjs`, `jev-eval.mjs` + its fixtures, `routines/` + `routines.test.mjs`,
`check-template-drift.mjs`'s placeholder grammar, and `review-route.mjs` (this epic touches CI/review paths, so the
security lens runs).
