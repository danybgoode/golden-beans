# golden-frijoles-plugin: wave 1 ("install", S1–S3) retrospective, written at ship time

Wave 1 was built and shipped 2026-09-23 (S1, S2 and S3.1–S3.4 merged and deployed). Its closing verification is
**still owed**: S3.5's two stranger walkthroughs on a clean machine (Daniel). The epic is **not** closed: wave 2 ("configure", S4–S5) is re-bet at the boundary, and the
epic's own `RETROSPECTIVE.md` is written at epic close. It will fold this file in.

## What shipped

| Sprint | PRs | Live evidence |
|---|---|---|
| S1 Identity, license, releases | golden-frijoles/skills#44 · golden-beans#161 · miyagi-product-management#194 (merged within 8 s) | `v0.1.0` cut by CI; the repo is `golden-frijoles/skills` under Apache-2.0; golden-beans loads `golden-frijoles@golden-frijoles` 0.1.0 (isolated session check) |
| S2 The kit | #45 · #46 · golden-beans#162 | `@golden-frijoles/kit@0.2.0` with a verified SLSA attestation; `v0.2.0`; golden-beans runs babysit-pr, doc-hygiene and groom's preflight from the published kit, with output byte-identical to its old local copies |
| S3 The front door | #47 · golden-beans#163 | `v0.3.0` / kit `0.3.0` published on the first try; `check-onboarding-parity --exec --live` runs the install prompt against the published repo, and the real `npx skills --skill '*'` install lands all 11 skills |

The architecture lock (D1–D8) held. It named 14 deviations from the scaffolded docs (X1–X14). Eleven were found
before any builder started, and three (X12–X14) were measured during S3.

## What went well

- **Locking against live state, not the doc.** The doc's "14 `__dirname` sites" was really 18 files, plus 5 hidden
  `node scripts/x.mjs` spawns and 4 project-owned assets. A grep for `__dirname` alone would have shipped a kit that
  ran the stranger's copy of `build-order.mjs`.
- **Measure, don't assume, paid off repeatedly:**
  - npx survives an outage with a warm cache (so no `--prefer-offline`);
  - `npx skills` installs into `.agents/skills/`;
  - `$CLAUDE_PLUGIN_ROOT` is **not** set in a skill's shell (the umbrella skill would otherwise have told every
    Claude Code user that hooks were missing);
  - `--skill golden-frijoles` installs only the umbrella skill (a stranger's first hand-off would have
    dead-ended).
- **Output parity caught what byte parity couldn't.** golden-beans' `build-order-sync.mjs` was byte-identical to
  the template, but through the kit its board would have lost 58 lines to the kit's extractor, because
  golden-beans' extractor is a fork. The before/after diff kept it local.
- **The fresh reviewer was the strongest layer.** It reproduced every finding. On #45 it found a relative
  `--root` silently corrupting spawned children. On #46 it refused an unproven causal claim, and it was right.

## What we learned

- **The first npm publish took three attempts and one wrong theory.** I merged #46 blaming setup-node's
  `registry-url`, and it was harmless but wrong. The verbose log added at the fresh reviewer's insistence showed
  the OIDC exchange succeeding. The real causes were npm-side: a trusted publisher whose *Allowed actions* was
  stage-only, then asynchronous validation (`PUT 202`, live minutes later) racing a 60-second confirmation.
- **"All steps pass" was wrong once, from the wrong environment.** `skills@1.7.0` prints plain names inside an
  agent session and ANSI-coloured ones in CI, so the check was green locally and red on GitHub. It's proven now
  with `env -i … CI=true`.
- **A silent linter read as clean.** ESLint run on files outside its configured paths linted nothing. A planted
  unused variable exposed 13 orphaned bindings that would have failed golden-beans' CI on copy-in.
- **The local CI runner downgraded the operator's global `claude`** (CI's `npm i -g` step). It was restored, and
  the runner now installs into a throwaway prefix.
- **Builders died twice at the session limit mid-task.** Re-deriving from `git status` (never from their last
  words) made both re-entries cheap. One builder had finished, one had not committed.
- **Weather blocked merges for hours.** ghcr.io and the Supabase CLI release lookup rate-limited golden-beans' e2e
  job five times before it ran a single test. The merges waited instead of routing around an absent gate.
- **Automatic behaviour must not run repo-supplied code.** "Local wins" (D3) is right for a skill the user
  explicitly invokes in their own repo. The umbrella skill's first-contact detection and its `gf-kit init` now
  call the kit directly, because `scripts/preflight.mjs` and `scripts/init.mjs` are names a stranger's repo can own.
- **Stacked PRs: merge the base with a merge commit, not a squash.** It kept #45's and #162's ancestry intact when
  they retargeted to `main`.

## Gaps / follow-ups

- **Owed to Daniel:**
  - the medusa-bonsai session check (S1.4);
  - the signed-in onboarding smoke (S3.3);
  - **both stranger walkthroughs on a clean machine (S3.5)**. The headless dry run stopped at login, by design.
- **medusa-bonsai's shared-rail copies lag the template** for the files S2.1 converted. They still work (local
  wins), but they're no longer byte-identical. It doesn't adopt the kit (an epic no-go), so a copy-in chore is
  owed.
- golden-beans keeps `build-order-sync.mjs` until its extractor fork is retired (recorded in its
  `scripts/README.md`).
- The generated `BUILD-ORDER.md` banner still says "Regenerate: node scripts/build-order.mjs", which a kit user
  doesn't have.
- Accepted risk, stated on #47: the install prompt tracks `main` rather than a pinned release. Pinning is
  documented in RELEASING.md.
- Review capacity: agy was capped all wave. vibe overflowed its context on three larger PRs, and codex ran both
  lenses there (said on each PR).
