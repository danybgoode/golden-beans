# The flag console a human can operate — Flagsmith-grade IA, terminology and list ergonomics — Retrospective

_Closed: 2026-08-26_

## What shipped

Three sprints, three PRs, all merged and deployed to production **dark**:

| Sprint | PR | Merge | What |
|---|---|---|---|
| 1 — the list becomes a list | [#118](https://github.com/danybgoode/golden-beans/pull/118) | `2bdb6f7` | One server-rendered, URL-driven feature list; environment selector; `FLAG_CONSOLE_ENABLED` born dark |
| 2 — one feature, in its own place | [#120](https://github.com/danybgoode/golden-beans/pull/120) | `62bf561` | Per-feature destination (Value · History · Settings); one enable/disable control; rollback; the legacy stack retired |
| 3 — the split and the language | [#121](https://github.com/danybgoode/golden-beans/pull/121) | `1ecacb1` | Credentials route (owner-only); audit route (member-readable); one vocabulary module + its sweep |

Plus [#119](https://github.com/danybgoode/golden-beans/pull/119), a tooling PR the epic forced out
of hiding — see *The reviewer rail reviewed itself*.

**`FLAG_CONSOLE_ENABLED` is the 17th gate**, created disabled in development, preview and production
before Sprint 1 merged, and **still disabled**. Every surface this epic built renders behind it, so
production today is byte-for-byte what it was before — a property verified behaviourally at each
sprint (the gate-off page emits the same heading sequence as `main`), not asserted in prose.

**No migration, no new query, no new dependency, no change to the wire contract.** Every read is
`getFlagRegistryView()`, which the page already called. Every write posts through the same server
actions the legacy surface used.

## What we learned

### Moving a control is not one change — it is a change plus everything that pointed at it

This is the epic's central lesson, and it cost four separate near-misses:

| # | Sprint | What was nearly lost | Caught by |
|---|---|---|---|
| 1 | 1 | The definitions stack — every activate/deactivate control, hidden before the destination existed | Codex, round 3 |
| 2 | 2 | Rollback — the per-version buttons were the only way to serve an older version | Me, before building |
| 3 | 3 | The **authoring form** — gated along with the credential forms it shared a block with | The D7 vocabulary sweep |
| 4 | 3 | `flag-sync-keys.authed.spec.ts` — still driving mint/revoke at the old URL | Fresh reviewer |

Three of the four were **capability** losses; the fourth was a **coverage** loss, which is the same
defect wearing a disguise — the credential flow would have had zero automated cover at exactly the
moment it became reachable at a new address.

The rule that came out of it, applied from Sprint 2 onward and written into `sprint-2.md`:
**land the replacement and retire the original in the same story.** Destination → control on it →
rollback → then the stack. Any other ordering has a window where the capability does not exist.

### A constraint you cannot immediately justify is not thereby unjustified

Amendment 1 said *"Sprint 1 does not edit `flag-manager.tsx`."* I weakened it mid-build with
reasoning that looked careful — four lines, default preserved, gate-off render unchanged — and **the
weakening was the defect**: that file holds every activate/deactivate control, and their replacement
was a sprint away. Turning the gate on would have removed the only way to kill a live flag.

Before removing a constraint, find the failure it was written to prevent. Failing to find it is a
reason to look harder, not a licence to proceed.

### A vocabulary sweep is also a capability sweep

Story 3.3 exists to retire storage words. It caught near-miss #3 — the hidden authoring form —
because it reads *every* surface, which is something no other check in this epic did. That is the
argument for running the language story **before** a sprint closes rather than as a tidy-up after.

### My own guard was drawn around its own offences

The sweep spec was real in mechanism and quietly hollow in practice. Its term list carried a
paraphrase of `mint` and omitted `activation` entirely — both live on swept surfaces. Its surface
list was hand-maintained and missing the four files where an explicitly-named, unfixed acceptance
criterion was hiding. And `includes()` over unnormalised text meant a **Prettier line wrap** defeated
it: the same phrase caught in a heading walked through in a paragraph.

Hardening it first produced **five failures of which only two were real**, because it had started
sweeping identifiers (`FlagActivationState`, `flag.activations`). The version that shipped reads
rendered text only, derives its surface list from the directory, and is mutation-checked in both
directions — including the false-positive direction, because a guard that cries wolf gets suppressed.

**A test that cannot fail is worse than no test**, and this epic produced several of mine: a spec
whose body sat behind `if (status === 200)` on a route that always redirects; an assertion of
`.page >= 1` that is true for every possible implementation; a fixture ordered so that "take the
highest" and "take the first" were indistinguishable. All three were found by reviewers, not by me.

### "Activated" is not "on"

The money-path defect, and the one I am least comfortable with. The console equated *an activation
row exists* with *the feature is on*. A definition whose `defaultVariantKey` names a falsey variant
serves `false` — so **"Turn on in production" could activate a version serving `false`**, with no
dialog and a success notice saying it was on.

The fresh reviewer rated live likelihood **"medium"**, reasoning that few flags have been
re-versioned. Production said otherwise: **the latest version of 34 of 42 `miyagisanchez` flags
evaluates to `false` by default.** It was the common case, not the corner.

Two things generalise. First: **check the reviewer's severity estimate against live data** — it was
right about the mechanism and wrong about the blast radius, in the safe-sounding direction. Second:
a console that reports storage facts where the operator is asking an operational question is exactly
what this epic existed to fix, and I rebuilt it one layer down without noticing.

### Words on a dangerous control belong where the gate can read them

Story 2.2's acceptance is about *sentences*: the confirmation must name the feature, the environment
and what stops. Rendered inside a client island, those words are reachable only through a signed-in
browser — outside the merge gate. So the assertion that matters most would have been pinned by
nothing, and would have decayed to "Are you sure?" the first time someone found it wordy.

They live in `lib/flag-console-copy.ts` as pure functions, pinned by 15 specs. Degrading the turn-off
sentence to *"This feature will be deactivated"* fails seven of them.

### The reviewer rail reviewed itself

Enabling vibe as a third family (asked for mid-epic) surfaced two real bugs in the review tooling:

1. **`cross-review.mjs` fed reviewers file content from the WORKING TREE**, not the PR head. On a
   stacked branch — this repo's default shape — that means one branch's diff beside another branch's
   files. Vibe duly reported a compile error that did not exist. Fixed by pinning to the PR head; a
   file that cannot be read there is now **omitted** rather than substituted, because a reviewer
   shown the wrong file states defects that do not exist.
2. **A truncated review posted as a clean pass.** Vibe exhausted its turn budget mid-read and exited
   `0` with a bare `read_file{…}` tool call as its entire output. Both existing guards (non-zero
   status, empty output) passed, so the runner posted it — where it renders as a review that found
   nothing. Worse than an empty result: an empty one looks wrong and gets investigated; a truncated
   one silently drops a family from the gate on the PR it was reviewing.

Also: **a PR that conflicts with `main` silently stops GitHub Actions from creating any run.** Eight
pushes produced nothing, a close/reopen produced nothing, and it presents exactly like a quota
outage — I put that wrong diagnosis to Daniel before finding the real cause. `gh pr view N --json
mergeable` first, and expect it after every stacked merge.

## Gaps / follow-ups

- **Owed to the product owner: the signed-in walkthroughs for all three sprints.** Every surface is
  credential-gated, so nothing in this repo reaches past the login redirect. Sprint 2's includes the
  money-path confirm on preview **and** production (cancel both).
- **The outcome test is unrun**, and it is the epic's actual definition of done: open
  `/app/flags/miyagisanchez` cold and answer *"which of these are on, in which environment, and which
  aren't created yet"* without a second question.
- **Story 3.4 is PARTIAL.** Three `legacyStackOnly()` suites are not ported, and neither new route
  has an authed spec on its *rendered* surface. **Until that lands, the moved components have no
  automated cover with the gate ON** — which matters before anyone flips it.
- **25 `startTransition(async` call sites** across the repo share the double-submit hole fixed on the
  money path here. Real pre-existing defect, out of this epic's scope, logged in `sprint-2.md` as a
  candidate chore.
- **`rule-builder.tsx` uses array indices as React keys** on a removable clause list. Pre-existing
  from #15; removing an intermediate clause mismatches input state.
- **The flip is a separate, deliberate act** and needs its own commit to `main` — Vercel snapshots
  env values at build time, so an env edit alone does nothing.
