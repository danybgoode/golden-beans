# Flags — a visual rule builder, rollout viz, and a plain-language version diff — Retrospective

_Closed: 2026-08-10. **All three sprints merged and LIVE in production**, gate on._

## What shipped

| Sprint | Capability | PR | State |
|---|---|---|---|
| 1 | The rule builder — two selects and a value control that cannot produce a clause the parser rejects | [#87](https://github.com/danybgoode/golden-beans/pull/87) `92e24b3` | **merged, dark in production** |
| 2 | Rollout bars, per-environment state, the bounded version diff | [#88](https://github.com/danybgoode/golden-beans/pull/88) `a3a5606` | **merged** · 7 review rounds |
| 3 | Preview as a user, and the SDK's `explainFlagEvaluation` | [#90](https://github.com/danybgoode/golden-beans/pull/90) `b473d13` | **merged** · 3 review rounds |

`FLAG_RULE_BUILDER_ENABLED` is the 15th gate, created **disabled** in Development, Preview and
Production on 2026-08-09. Every surface in all three sprints renders behind it, so with the gate down
the flags page is byte-for-byte what it was before the epic — a property round 2 of Sprint 2's review
caught us quietly breaking with a one-class CSS tidy-up.

**No migration, no new route, no new dependency, no change to the wire contract.** The builder posts
through the server action the textarea already used; the bars and the diff are pure derivations over
props the page already had; the preview calls the SDK's own evaluator server-side.

## What went well

**The architecture lock paid for itself four times over.** Before Sprint 1 started, re-reading every
decision against shipped code disproved four things this doc had asserted: the named write seam was
the wrong file (A1), D4 was unbuildable as the SDK stood (A3), D5 was unbuildable because three of its
four constants were never exported (A6), and the line count D7 argued from was stale (A2). Each of
those would have been discovered by a builder mid-story, under pressure, with the wrong incentive.
A6 in particular: a builder told to "read the constant" and finding no constant to read writes the
literal `20` that D5 exists to forbid.

**Bounding the diff was the right appetite call, and the bound is what makes it useful.** D8's six
parts plus an explicit "definition changed — show JSON" produced a diff a PM can trust precisely
because it can say *I cannot describe this one*. Every reviewer who probed it probed the bound, and
the bound held.

**A3 kept D4 without breaking D10.** Splitting the private `matchesRule` into `clausesMatch` +
`rolloutAdmits` and redefining `matchesRule` as their conjunction means `evaluateFlag` is unchanged
**by construction, not by assertion** — and the exported explanation is built from the same two
predicates, so there is still exactly one implementation of matching in the repository. The
alternative — a second matcher in `apps/web` — is the failure D4 exists to name.

**Putting the words on a seam.** Twice — Sprint 2's per-environment derivation and Sprint 3's
explanation prose — the acceptance criterion was a *sentence*, and a sentence built inside a client
component is reachable only through a signed-in browser. Extracting them made "excluded by rollout
must not read like no rule matched" an assertion instead of an intention.

## What we learned

**A clean cross-family round is not a clean round.** Sprint 2 ran seven rounds and found sixteen real
defects. Round 4 was clean from *both* external families — and the fresh reviewer found a regression
that round 3's own fix had introduced. Rounds 5 and 6 each found one more path after Antigravity had
gone clean three rounds running. The two-round floor in `WAYS-OF-WORKING` is a floor; the stopping
condition is a clean round, and this epic is the argument for it.

**Fixing one collapse can create its opposite.** `reachOf` was corrected three times in three rounds,
each time for a *different* wrong statement about the same data: a rollout-less rule filtered out
(understating reach), then counted as 10000 (conflating it with a real 100% rollout), then shadowed
rules included (counting rules the evaluator never consults). Then round 4 found that the round-3 fix
had moved a readability guard behind a filter, so corrupt data started drawing a confident bar. A fix
is a change, and a change deserves the same suspicion as the code it replaces.

**Four findings with one cause means the cause is the finding.** Rounds 3–6 produced four separate
"guard this shape" reports on the same two seams — a corrupt basis-points value, a missing `clauses`
array, a `rollout: null`, a missing `rules` array. Guarding each was building the second validator D2
forbids, one review finding at a time and always one behind. The fix was to ask the authority once:
the read path now takes the evaluator's own verdict on a definition and describes nothing about a row
it refuses. **A TypeScript type over a JSONB column is a promise the database does not make.**

**A positional locator over two identically-worded controls is a spec that will silently start
testing something else.** Sprint 1's rejection probe used `.first()` on a button whose text the
builder also uses — and the builder renders first, and its button is disabled — so the probe would
have hung rather than tested anything. It was never caught because the `authed` Playwright project
does not run in CI. Sprint 2's second `<pre>` would have re-pointed a second locator the same way.

**Comments that assert properties are code, and go stale like code.** Three separate rounds found a
comment claiming something the code did not do: a `satisfies` said to enforce exhaustiveness that did
not (Sprint 1), a renumbering said to always be recognised as a move when a swap defeated it, and a
`.code-input` note instructing the next kit-adoption pass to do the exact thing this epic had just
decided against. The last one is the dangerous kind: a stale comment that reads as an unfinished task.

**A git worktree with no `node_modules` silently tests the ROOT checkout's packages.** Cost real time
in Sprint 1 — SDK edits appeared inert and unit tests asserted against `main`. `npm install` inside
the worktree first, and confirm with `require.resolve('@golden-beans/sdk')`.

## Gaps / follow-ups

- ~~The two merges~~ — **done.** One mechanical lesson: **deleting a stacked PR's base branch on merge
  auto-closes the child, and GitHub will not reopen a PR whose base is gone.** #89 had to be
  rebased onto the post-merge `main` and re-opened as #90; the review history stays on #89 and #90
  links back to it. Next stacked pair: merge the parent WITHOUT `--delete-branch`, retarget the child
  first, then delete.
- ~~The signed-in walkthroughs~~ — **done 2026-08-10. All 36 authed specs pass**, including every
  Sprint 1–3 flag spec. Running them for the first time cost three more defects in that one file, all
  in the SPEC and none in the product, and all of the same family A9 names:
  1. `getByLabel('Serves variant')` matched two selects, because `getByLabel` is a **substring**
     match and the definition-level control is "Serves variant when no rule matches". The test died
     at the exact step the epic calls its most important.
  2. `not.toContainText('"basisPoints": 10\n')` — the guard against the factor-of-100 error — **could
     never pass**. Playwright normalises whitespace, so the newline was stripped and
     `"basisPoints": 10` is a prefix of the correct `"basisPoints": 1000`. It failed on a correct
     build, which is how it was finally noticed. Both assertions now parse the JSON and compare
     values, and the round-trip is stated as `expect(stored).toEqual(built)`.
  3. The fixture needed `SIGNUP_ENABLED=true` on the server — the provisioning redirect is gated on
     it. The setup spec **names that in its own failure message**, which is why the first run
     diagnosed itself in one pass. That is what a good fixture failure looks like.
  **Mutation-checked:** dropping the `× 100` from `percentToBasisPoints` turns the repaired headline
  test red. It has teeth now; for the whole epic before today, it did not.
- ~~Flipping the gate~~ — **done 2026-08-10: `FLAG_RULE_BUILDER_ENABLED=true` in Production and
  Preview**, and verified on the live signed-in page against a real flag. The bars, the diff sentence
  and a real preview evaluation all render; the `no-rules` case that round 4 corrected shows as
  *"default only"* with no bar, which before that fix would have drawn a full bar labelled
  *"everyone"* on flags that target nobody.
- **`north-star-sync.spec.ts` fails locally**, identically on a stashed baseline tree — pre-existing,
  unrelated to this epic, and worth a look on its own.
- **Subset shadowing is undetected, deliberately.** The rollout bar only recognises the unambiguous
  catch-all (no clauses, no rollout). A rule shadowing a later one because its conditions are implied
  by theirs needs a solver, which is the appetite trap D8 refuses for the diff. Named in the code.
- **`draftFromDefinition` still declines any definition with metadata or a non-string clause value**,
  so those flags keep the JSON textarea. Bounded on purpose (Sprint 1); the diff and the bars read
  them fine.
