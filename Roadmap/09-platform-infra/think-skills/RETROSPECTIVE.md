# Think skills — PMF Narrative, North Star and Risk Validation ship in the plugin and write files groom reads — Retrospective

_Closed: 2026-10-01_

## What shipped

- **S1 (#214, `f14c68d`), plugin 0.17.0, live:** `pmf-narrative`, `north-star` and `risk-validation` ship in the plugin.
  Each body is ported verbatim from the account copies. Each skill writes `Roadmap/00-strategy/<name>.md` from its own
  template, asks before overwriting an `agreed` file, credits its sources, and offers the next skill: narrative, then
  North Star, then risk validation, then groom. The North Star mis-trigger is gone. Riding along: `doc-format` and a
  root test now catch an HTML comment that never closes. Two epic READMEs, this one and sketch-specs, were hidden on
  GitHub by one.
- **S2 (#215, `ac13f46`), plugin 0.18.0, live:** `groom/strategy.mjs` reads the strategy files. Stage 0 runs it, and
  the pitch gets one line naming the input it moves and the dimension it tests. With no strategy it prints nothing.
  Pins prove the Roadmap tools ignore a flat `00-strategy/`. intent-match's think-chain route now names the coaches.
- **S3 (#216, `fbce291`), plugin 0.19.0 and CLI 0.3.0 (the npm publish is owed), deployed and verified live:** `gf
  north-star set` runs over a new `/api/v1/cli/north-star` route, which shares its sync logic with the ingest-key
  route rather than copying it. The command is a dry run by default. It names what it can't undo: a metric added
  beside another, an input moved, a refused value-source change. It refuses unfilled templates. In passing, all three
  CLI POST routes now check the gate before reading the body.

## What went well

- **The lock earned its keep.** Querying the live system before any code turned up three things. S3's premise was
  false: `gf`'s token can't call the ingest-key route. Sync *adds* beside an existing metric rather than replacing it.
  And S2.2 had nothing to fix, only things to pin. Each changed the work, and the first was settled with one question
  before anything was built.
- **The templates as the one contract.** The coaches write from them. Groom's reader and the CLI's tests parse them as
  fixtures. The app test runs the real `northStarSyncSchema` against them. Renaming a heading turns three suites red.
- **Fixes were treated with the same suspicion as code.** Every round re-reviewed its own fix. The rounds converged:
  each PR merged only after a round that was clean from every reader (S1 took three rounds; S2 and S3 two each).

## What we learned

- **A live end-to-end check is worth more than the lock's reading of the code.** The prod dry run (built CLI → new
  route → membership → `golden-beans`) was the first time the whole path ran together. It agreed with the lock's
  query: zero metrics, and zero rows written.
- **"Run the gate" means the whole job, not a hand-picked subset.** S2's self-QA listed individual skills checks and
  missed groom's prose-budget step, so skills-ci went red. After that, a script ran every non-network step on the
  split, and nothing else was missed.
- **A guard's failing direction is part of the guard.** Several pins first had only their passing direction. The
  review found doc-format's walk *could* be mutated red, against the deviation text's claim, and the e2e cross-project
  test needed a positive anchor before its 404s meant anything.
- **The gate goes before the body, not only before the credential.** All three CLI POST routes parsed first. Found on
  the new route, fixed as a class, and pinned structurally because the e2e server can't switch the gate off.

## Gaps / follow-ups

- **Owed to Daniel, by name:**
  - `npm publish` of `@golden-frijoles/cli@0.3.0` (npm 2FA). Until then the North Star skill's pinned command fails
    loudly.
  - Run the North Star coach on Golden Frijoles and judge the file (S1 smoke step 2).
  - The live `--yes` against `golden-beans` with that file, then check the North Star surface (S3 smoke steps 2–3).
  - The interactive coach runs (S1 smoke steps 1 and 3; S2 smoke step 1).
  - Remove the three account copies of the coaches.
- **Follow-ups worth a seed:**
  - a `sendable` field in `gf north-star set --json` dry runs;
  - widen the body-order guard to catch `req.clone().json()`;
  - explicitly excluding `00-strategy/` in the walkers was considered and declined (C3/D8), so reopen it only if
    something ever writes a subfolder there.
- **Unchanged and pre-existing:** `doc-format --check` is still red on `main` for three unrelated older docs. The
  stale `BUILD-ORDER.md` on `main` was regenerated along the way.
