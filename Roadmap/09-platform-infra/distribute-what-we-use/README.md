---
status: shipped       # AUTHORITATIVE epic status (SSOT) — scaffolded | in-progress | shipped | archived. Set shipped at epic close.
phase: Shipped       # the executive ladder — Shaping | Locking architecture | Building | Verifying | In review | Shipped.
                     # WRITTEN at each cadence event, never inferred. Shipped = merged AND deployed.
slug: distribute-what-we-use
title: "Distribute what we use — one review rail, Jev and notify setup, schedulers, build view"
area: 09-platform-infra
risk: high
type: feature
sprints_total: 4
stories_total: 11  # the sum of every sprint's stories_total — keep it in step when a story is added
build_order: 47      # integer position in the ONE global build sequence — the SSOT once the epic
                     # exists (the seed's value is only a fallback). Fill it in at the betting
                     # table; plain integers, no "#2a" suffixes. See 00-ideas/README.md → Ordering.
---

# Epic: Distribute what we use — one review rail, Jev and notify setup, schedulers, build view

> **Area:** 09-platform-infra · **Risk:** high · **Class:** Feature · **Scope seed:** [`00-ideas/seeds/distribute-what-we-use.md`](../../00-ideas/seeds/distribute-what-we-use.md)
<!-- Class (above) is the Stage-2 classification: Feature, Spike, Bug, or Chore — see SKILL.md's
     Stage 2 table; sourced from scaffold-epic.mjs's --type flag (a fixed 4-value enum, not free
     text — a longer description belongs in ## Why
A stranger who installs the Golden Frijoles plugin today gets a kickoff whose review step points at a script they
don't have, a Jev guard that is always off and never asks, a one-line Telegram guide, no routines and a silent build
view. This epic makes those rails work in their repo the way they work in ours (E3, E4). It also collapses the review
rail's three copies into one, so a reviewer fix is one PR, not three. The pitch, the measurements and the research are
in the [seed](../../00-ideas/seeds/distribute-what-we-use.md); it absorbs
[`review-rail-one-implementation`](../../00-ideas/seeds/review-rail-one-implementation.md) as Sprint 1.

## Platform-first note
No engine data, route or table changes (rule #1 n/a). Everything here is kit, template and plugin code, so every
change under `skills/` is a plugin release (check-release) and ships as a pinned kit version. Stage-2.5 bucket:
**mostly light enhancement** — every rail already runs in this repo; only the routine bootstrap is new.

## Architecture lock (verified 2026-09-29 against `main` @ 93aec48, medusa-bonsai `main` @ 7a7c709)

Every decision below was checked against live code and live config before any builder started. Where the live
system disproved the groomed wording, the correction is stated under **Deviations** and the decision reads as
corrected. Builders cite these by number; each sprint file's *Build contract* says which ones it builds.

**The three-way compare (the evidence D1–D3 rest on).** `=` byte-identical, `x` differs, `.` absent.

| File | ours | template | medusa | O=T | O=M | T=M |
|---|---|---|---|---|---|---|
| `cross-review.mjs` | 698 | 506 | 485 | x | x | x |
| `lib/cross-agent-cli.mjs` | 1,324 | 695 | 740 | x | x | x |
| `cross-review.prompt.md` / `.security.prompt.md` | 99 / 96 | 100 / 92 | 97 / 113 | x | x | x |
| `review-config.json` | 22 | 25 | 38 | x | x | x |
| `cross-panel.prompt.md` | 115 | 115 | 117 | = | x | x |
| `cross-panel.mjs`, `review-route.mjs`, `lib/review-guard.mjs`, `lib/jev.mjs` | — | — | — | = | = | = |
| `cross-agent-doctor.mjs` (+ `.agy`/`.codex` tests) | . | . | 417 | | | |
| `agy-doctor.mjs` (+ test) | 309 | . | . | | | |

`lib/cross-agent-cli.mjs` exports: ours 51, template 34, medusa 36, union 52. The only name ours lacks is
`isCodexOutdated` (medusa). Every importer in all three trees imports only names in the union. The forks are in
**bodies**, not names: 19 shared declarations differ between at least two copies.

- **D1 — The review rail is a superset, built on OURS, with named imports from the other two.** Ours is the base
  (51/52 exports, the context/pairing/transient-agy/truncation work). Into it come, by name:
  - from the template: `cross-review.mjs`'s `loadReviewConfig` through `readSection('review', …)` (wave-2 config
    loader), and codex's auth fallback (`runWithCodexFallback`) as the codex path;
  - from medusa: `isCodexOutdated` + the `cliOutdated` fallback class, `CODEX_MODEL` overridable to `null` (use
    codex's own default), and every fix message naming `cross-agent-doctor.mjs`.
  **Where two copies disagree on a safety property, the stricter one wins, and the choice is recorded in a comment
  at the decision.** Two are known:
  - **Vibe runs with every host tool disabled** (`--disabled-tools '*'`, no `--auto-approve`), and a reply that is
    a bare tool call is refused. This is the template/medusa stance. Medusa's probe on 2026-08-08 (vibe 2.23.3)
    found auto-approval is checked *before* vibe's sensitive-file and outside-workdir prompts, and `read_file`
    takes absolute paths. So our current `read_file`/`grep` allow-list lets a malicious PR diff read `.env` into
    a comment posted on a **public** repo. The reviewer still gets the code: ours already embeds head-side file
    context (`buildFileContext`). `isTruncatedReview` stays too. `VIBE_MAX_TURNS` goes to 24 (the template's
    live-probed value; with no tools, turns are cheap).
  - **A codex→agy fallback re-checks the builder pairing.** The fallback changes the reviewing family. If the
    builder is `agy`, falling back to agy would be a same-family review, so that case fails loudly instead
    (`checkReviewerPairing`, which ours already has).
  Pins take the newest live-verified value: `AGY_PINNED` 1.2.12 / `gemini-3.8-flash-high` (ours, 2026-09-28).
  Formatting follows this repo's Prettier. **Both consumers' OLD tests run against the superset** (`git show
  origin/main:<test>` for ours; medusa's from its `main`), and every failure is read and resolved, never deleted
  as superseded (LEARNINGS, shared rails across repos).
- **D2 — One doctor: `cross-agent-doctor.mjs`, itself a superset.** Medusa's file is the base (codex + agy, the
  `unavailable` probe class, the stricter `parseAgyModelSlugs`). Ours adds `AGY_MODELS_IN_USE` coverage (every
  configured agy model is checked, including `PROSE_MODEL`) and the drift note that names the model. It ships in
  `skills/template/scripts/` with both test files. `agy-doctor.mjs` stays as a thin alias that runs
  `cross-agent-doctor.mjs agy` with the same arguments. The machine-managed marker keeps its anchor text
  (`// agy-doctor: last verified …`): both consumers' tests and medusa's `bumpPinnedSource` pin it, and renaming
  an anchor buys nothing. The instruction line under it names the new command. *(Amended during S1: the lock
  first said the marker would be renamed.)* After S1, `grep -rn "agy-doctor\|cross-agent-doctor"` over
  `skills/template scripts` names only files that exist.
- **D3 — Copy-back in the same wave, code only.** This repo's `scripts/` gets byte-identical copies of the rail's
  **code**. medusa-bonsai (`danybgoode/miyagi-product-management`, reachable) gets a PR with the same code bytes.
  The **project-owned** files keep each repo's own content: `cross-review.prompt.md`,
  `cross-review.security.prompt.md`, `cross-panel.prompt.md` (rules slot) and `review-config.json` (security
  paths). Only their shared body is aligned, by hand. See deviation 1.
- **D4 — The kit closure is the manifest.** The rail enters through a skill's `requires_scripts` — *(amended
  during S2: the umbrella `golden-frijoles` skill, not `groom`, whose 220-line budget could not take the list;
  the kit is the union of every skill's closure, so nothing else changes)*. `check-skill-scripts.mjs` holds the declaration to the real
  import closure. The files are `cross-review.mjs`, `review-route.mjs`, `lib/review-guard.mjs`,
  `cross-agent-doctor.mjs`, both review prompts and a default `review-config.json`, and the same for
  `session-resume.mjs` and `session-note.mjs` (deviation 4).
- **D5 — Automatic behaviour never runs repo-supplied code, whether or not the repo has the file.** The build-view
  hook always runs a copy of `build-state.mjs` **bundled inside the plugin** (`hooks/vendor/`: `build-state.mjs`,
  `lib/roadmap-contract.mjs`, `lib/session-journal.mjs`), located from the hook module's own path. It never
  executes `<repo>/scripts/build-state.mjs`. The bundle is generated from `template/scripts/`, and a check fails
  when it is not byte-equal. See deviation 2.
- **D6 — Parity, not deletion.** Measured live: 94 files are byte-identical between `scripts/` and
  `skills/template/scripts/`, 10 differ, 39 are template-only. After S1, the ones that differ are the three
  project-owned review files, `prose-lessons.md`, `routines/README.md` and `roadmap-extract.mjs`. The guard (S2.3)
  passes when a file is identical or listed with a one-line reason.
- **D7 — Jev asks before it sends: two bugs, one fix at the loader.** Bug 1: with no config at all, `loadJevConfig`
  returns `parseJevConfig({})`, whose `egress` defaults to **`true`**, so "unanswered" is never seen. Bug 2:
  `effectiveMode` returns `configured off` (`lib/jev.mjs:186`) before the `egress === null` branch. The fix: an
  absent config, or an absent/`null` `egress`, loads as `egress: null` (unanswered). `jevContext` fires
  `needSetting('jev.egress')` whenever egress is unanswered, whatever the rail mode. Nothing is sent unless
  `egress === true`. The ask stays **non-blocking** (the regex still decides this run), so a stranger's review is
  never stalled by it. Live data: both consumers' `jev.config.json` set `egress: true` explicitly, and the
  registry's default is already `null`, so neither consumer changes behaviour.
- **D8 — No CLI change.** `gf doctor` derives module state from the kit registry (`packages/cli/src/modules.ts:70`),
  so new or reworded rows are free. Operate reads "configured" only when **both** `reporting.destination` and
  `deploy.vercelProject` are answered (deviation 5).
- **D9 — Stricter wins, and one kit release per sprint.** Every sprint that touches `skills/` bumps `plugin.json`
  + `kit/package.json` + `CHANGELOG.md` once (`check-release.mjs` blocks otherwise). The next sprint's consumer
  pins wait for the npm tarball URL to return 200.
- **D10 — Routine placeholders have a declared source, and runtime tokens are left alone.** The routines use two
  kinds of angle-bracket token. **Fill-ins** (`<root-repo>`, `<app-repo>`, `<api-repo>`, `<your-org>`,
  `TEMPLATE FILL-IN`) must be filled before scheduling. **Runtime tokens** (`<date>`, `<id>`, `<trigger-id>`,
  `<name>`, `<your-file>`, `<repo>`) are filled by the routine when it runs. The bootstrap fills only the declared
  fill-ins from one `routines` section of `golden-frijoles.config.json` (a registry row). It refuses, naming each
  one, while any fill-in is left, and it never touches a runtime token.

### Deviations — where the live system disproved the groomed scope (corrected out loud)
1. **S1.3's "`cmp` of every review-rail file prints nothing" is wrong for the project-owned files.** The review
   prompts and `review-config.json` carry each project's own rules and security paths: ours names AGENTS.md rules
   1–5, medusa's names Medusa/Clerk, the template's is a fill-in slot. *(Measured by S2.3's guard: in this repo
   `cross-panel.prompt.md` is byte-identical to the template, so here it is three files; medusa's panel prompt is
   its own.)* Byte-equality applies to the **code** (`cross-review.mjs`,
   `lib/cross-agent-cli.mjs`, `cross-agent-doctor.mjs`, `agy-doctor.mjs`, `cross-panel.mjs`, `review-route.mjs`,
   `lib/review-guard.mjs` and their tests). The project-owned files are S2.3's listed exceptions (three here; see the note above).
2. **D5 as groomed ("the kit's copy when the project has none") would have kept the hole.** Today
   `hooks/index.ts:34` runs `${root}/scripts/build-state.mjs` from whatever repo is open, on every turn. That is
   the exact LEARNINGS violation. There is also no "kit copy by absolute path" to reach: the installed plugin
   (`~/.claude/plugins/cache/golden-frijoles/golden-frijoles/<v>/`) holds only `agents/ hooks/ skills/`, not
   `template/`, and the npm kit would need a network call inside a 5-second hook. Corrected: a byte-checked
   bundle inside the plugin, always used.
3. **D7 was one bug in the seed; it is two** (absent config ⇒ `egress: true`). Fixing only the ordering in
   `effectiveMode` would still leave the ask dead for the no-config stranger.
4. **The kickoff names a second script a stranger lacks, and so does this repo.** `templates/epic-kickoff.md:7`
   says "Start with `node scripts/session-resume.mjs`". It is template-only: not in the kit, and not in this
   repo's `scripts/`, which is why this run's first command failed. The same fix as `review-route.mjs` applies
   (S2.1), and this repo gets the copy.
5. **Nothing reads `reporting.destination`.** The registry asks "Telegram, Slack, or terminal?", and every report
   sender (`standup`, `weekly-recap`, `merge-report`, `pmo-delivery`) posts to Telegram only. S3.3 therefore
   (a) promotes `slack-notify.mjs` + `lib/slack-text.mjs` as a standalone, tested sender the route offers for
   ad-hoc and merge messages, and (b) rewords the registry question so it offers only what a report can
   actually do. Routing every report through `destination` is **out of scope** and is named as follow-up. S3's
   smoke step 4 reads "Operate no longer lists `reporting.destination` as missing", because "configured" also
   needs `deploy.vercelProject`.
6. **The router's comment `review-route.mjs:187`** ("cross-review self-heals a dead codex token to agy") is true of
   the template copy only. After D1 it is true everywhere. No edit is needed, but it is noted so no one "fixes"
   the comment.

### Routing (who builds, who reviews)
- **Claude (this orchestrator, strongest tier):** S1 in full (shared infra), 2.2 (automatic code execution) and
  3.1 (egress/privacy). Nothing in these three is delegated.
- **Codex (`scripts/codex-task.mjs --tier build`, `gpt-5.6-terra`):** 2.1, 2.3, 3.2, 3.3 and 4.x, each against its
  sprint's build contract. The architect diffs the tree after every run (WAYS-OF-WORKING, *Verifying delegated
  work*).
- **Review:** `node scripts/review-route.mjs --builder <family that wrote most of the diff> <PR#>`. When a PR holds
  code from two families, the second is `--exclude`d too. The fresh `pr-reviewer` subagent runs on every PR
  (high risk). The security lens triggers on every sprint (`review-config.json` lists the rail's own paths and
  `.github/workflows/**`).

## What already exists (reuse, don't rebuild)
- `skills/scripts/build-kit.mjs` + `check-skill-scripts.mjs` (the closure), `render-skill-adverts.mjs`,
  `check-release.mjs`, `kit-tarball.test.mjs`, the isolated-home install recipe (golden-frijoles-plugin S5).
- Byte-identical already: `cross-panel.mjs`, `review-route.mjs`, `lib/review-guard.mjs`, `cross-panel.prompt.md`,
  `build-state.mjs`.
- The kit registry + `needSetting` (D11/D12); `gf doctor` module lines (`packages/cli/src/modules.ts`).
- `scripts/agy-doctor.mjs` (this repo) and medusa-bonsai's `cross-agent-doctor.mjs` + tests.
- `skills/template/scripts/lib/{telegram-format,reporting-config}.mjs`, `skills/template/reporting.config.example.json`,
  `scripts/slack-notify.mjs` + `lib/slack-text.mjs` (tested).
- `skills/template/scripts/routines/` (seven prompts + runbook) + `routines.test.mjs`; `check-template-drift.mjs`'s
  placeholder grammar; `skills/template/.github/workflows/jev-expiry.yml` (an existing cron).
- `jev-eval.mjs` + its fixtures; `skills/plugins/golden-frijoles/hooks/build-view.mjs` + its test.

## Scope — stories
| Sprint | Story | Risk |
|---|---|---|
| 1 | 1.1 Superset review rail in the template, old tests from both consumers green | high |
| 1 | 1.2 One doctor, and every fix instruction names it | high |
| 1 | 1.3 Copy-back: this repo byte-equal, medusa-bonsai PR | high |
| 2 | 2.1 The review rail in the kit closure, kickoff review step proven in an isolated home | high |
| 2 | 2.2 `build-state.mjs` in the kit; the hook runs the kit copy when the project has none | high |
| 2 | 2.3 Byte-parity guard over the shared scripts *(cut 2nd)* | low |
| 3 | 3.1 Bug: unanswered egress asks with no `jev.config.json` | high |
| 3 | 3.2 Jev setup route | low |
| 3 | 3.3 Notify setup route, example config in the kit, Slack sender promoted *(Slack half cut 3rd)* | low |
| 4 | 4.1 Routine prompts as kit assets + a `/schedule`-ready bootstrap | low |
| 4 | 4.2 GitHub Actions cron templates for model-free parts *(cut 1st)* | low |

**Cut line** (if the appetite runs short): 4.2, then 2.3, then the Slack half of 3.3.

## Routing (as groomed — superseded by the lock's Routing above)
S1 and 3.1 stay on the strongest tier (the review rail is shared infra; egress is privacy). 2.x, 3.2, 3.3 and 4.x go
to builders against the locked contract. Review per the router; CI and review paths trigger the security lens.
S1's own PR is reviewed through the new rail.

## Kill switch (Stage 6b)
**Carve-out, no flag.** No engine runtime seam changes. Every change ships as a pinned kit version, so rollback is
pinning the previous one. Every new rail stays off until its setup question is answered, and review is advisory.

## Deploy order
Stacked branches `feat/distribute-what-we-use` → `-s2` → `-s3` → `-s4`, merged in order. One plugin release per
sprint; wait for the tarball URL to return 200 before any consumer pins it. The medusa-bonsai PR merges after S1's
release exists.

## Definition of Done (epic)
- [x] All sprints merged to `main` + smoke-tested (gaps stated — `node scripts/owed-ledger.mjs` counts what is still owed)
- [x] Each `sprint-N.md` has its smoke walkthrough (real URLs)
- [x] This README marked ✅; every sprint status ticked with commit refs
- [x] `RETROSPECTIVE.md` written
- [x] Product poster (`Roadmap/README.md`) updated
- [x] Team memory + `MEMORY.md` index updated
- [x] Durable learnings promoted to `Roadmap/LEARNINGS.md` (dedupe — sharpen, don't append)
- [ ] ~~Kill-switch~~ n/a — carve-out recorded at grooming (pinned kit versions). **(only if one was planned at grooming — Stage 6b):** the flag slice shipped, the flag
      exists **in Golden Frijoles, in every env**, with the stated polarity, **and is ACTIVATED there** —
      `gf flags get <key>` must not print `—` in its PRODUCTION row. Creating a definition is not
      turning it on, and a flag that is synced but never activated serves compile-time defaults while
      every dashboard says it exists. *Verify-only — not a new gate; whether a high-risk epic needs one
      is decided at grooming, not here.*
- [x] Feature branch deleted; **this README's frontmatter `status: shipped`** (the SSOT — the board & Notion derive from it; run `node scripts/build-order.mjs`)
