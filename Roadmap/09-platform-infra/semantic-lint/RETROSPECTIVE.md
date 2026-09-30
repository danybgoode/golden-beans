# Semantic lint — Jev judges what deterministic checks select (v1: AGENTS rule 1, in shadow) — Retrospective

_Closed: 2026-09-30_

_Intent: yes | mostly | no_ <!-- not scored (no intent_match on this epic); Daniel answers if he wants it counted -->

## What shipped

One sprint, one PR, one plugin release: [#200](https://github.com/danybgoode/golden-frijoles/pull/200) (`eb8d392`),
`@golden-frijoles/kit@0.13.0`, tag `v0.13.0`.

- **`semantic-lint.mjs`**, in `scripts/` and the template, and in the kit through `jev-eval`. A rule's globs,
  added-line patterns and allowlist pick candidate hunks, and Jev answers one question per candidate. There are four
  outcomes: raise, clear, uncertain and **not checked**. Not checked is printed and logged and never counts as clear.
- **Rules are data** in `golden-frijoles.config.json → lint.rules`. This is the first time that file exists in this
  repo. The switch is `jev.config.json → rails.lint`, in shadow until **2026-10-14**.
- **AGENTS rule 1 is measured.** Its labels are 33 fixtures in the project-owned `scripts/jev-eval.lint.fixtures.json`:
  16 real candidates from 220 commits of `main` and 17 constructed ones, 14 of them violations. Wording v1 decided
  23/33; v2 decided 30/33, then 31/33 on re-recording. Every decided answer was right. The threshold is still the
  unfitted 0.8.
- **Both pre-push hooks** run the lint in their ADVISORY section, on the ranges git hands them. **`jev-report`**
  summarises lint decisions for the owed promotion decision.

## What went well

- **The lock paid for itself.** It corrected five groomed claims before any code was written:
  - A `jev.rails` key in the new config file would have silently turned the promoted review and prose rails off.
  - `gf doctor` cannot list a setting.
  - The fixture floor is 30, not 10–20.
  - The report couldn't read lint rows.
  - The hooks are not advisory end to end.
- **Harvesting candidates from history** did two jobs. It gave real negatives: none of the 40 real candidates was a
  violation, which confirms grooming's "rule 1's literal half is clean". It also measured the selector's cost: 19 of
  220 commits select anything, at most 11 candidates each.
- **Mutation checks caught nothing broken,** and every guard went red when its line was broken. That covers the
  allowlist, not-checked-as-clear, the hook's `|| true`, the question hash, the report's dedupe key, per-rule
  coverage and the deletion-only guard.

## What we learned

- **Measure what you send, not only what you ask.** The first design sent whole hunks. On real history, 33 of 60
  candidates exceeded the size limit, because a new file is a single hunk. Nearly every new route and migration would
  have been "not checked", and the constructed fixtures, which were all small, would never have shown it. With a
  window of ±15 lines around each hit, 3 of 40 exceed it.
- **Labels for project-data rules are project data.** Putting this repo's `rule-1` fixtures in the shared,
  template-shipped fixtures file looked like reuse. The fresh reviewer showed it would fail any consumer that reused
  the id. Once coverage became per configured rule, it would have failed *every* consumer that added a rule. The same
  review found that skipping fixtures for an unknown rule let a renamed rule replay green with zero cases scored.
- **Jev is not perfectly repeatable.** Re-asking identical hunks moved p by up to 0.04 between runs. One read sat at
  0.20–0.22, right on the clear line. A threshold fitted to one recording would be fitting noise.
- **A verified lock can go stale inside the same session.** The kit-closure claim (C4) was checked against the
  pre-rebase tree. `main` had meanwhile made `jev-eval` part of a skill's closure. `check-skill-scripts` caught it.
  Re-run the lock's checks after a rebase.

## Gaps / follow-ups

- **Owed to Daniel on 2026-10-14:** read `node scripts/jev-report.mjs` and decide promote / tune / drop for
  `lint:rule-1`. `scripts-guard` goes red that day by design.
- **The external cross-family review was DARK for #200.** Codex was capped, agy was quota-capped (about 150 h), vibe
  had no `MISTRAL_API_KEY`, and Claude built the diff. The fresh reviewer ran two rounds: four Should-fix, all fixed,
  then clean. No backtest is owed when a family returns (LEARNINGS).
- **agy moved 1.2.13 → 1.2.14.** `cross-agent-doctor agy --fix` refused to bump the pin, correctly, because no model
  answered the probe. Re-run it once the quota resets.
- **The smoke walkthrough ran on loose commits,** not real scratch-branch pushes: creating remotes and branches was
  denied in-session. The hook path is covered by specs and by #200's own three pushes.
- **Known v1 limits, answered on the PR:**
  - One unreadable range makes the whole run "not checked".
  - `headSha` is taken from the last range.
  - The root hook's lint wiring has no spec.
  - Paths that git still quotes (control characters, `"`, `\`) are not unquoted.
- **Noticed, not ours:** the 0.12.1 Release run on `golden-frijoles/skills` failed (13:21Z), yet 0.12.1 is on npm.
  0.13.0's run passed both jobs.
- **Next rules**, each its own config entry once rule 1 has shadow data: paraphrased vocabulary, poster ✅ lines,
  suppression comments whose reason has rotted, and CodeQL triage.
