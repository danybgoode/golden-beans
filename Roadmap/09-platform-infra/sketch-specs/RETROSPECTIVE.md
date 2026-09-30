# Sketch specs — a surface spec renders the grey wireframe and becomes the state contract — Retrospective

_Closed: 2026-09-30_

## What shipped
**Sprint 1 — the format and the grey wireframe** (#210, `307999c`, plugin + kit **0.16.0** on npm). A screen state is
now a ` ```surface ` block: an id, a route, and one line per block from twelve kinds. The only facts it carries are a
primary action's words, a count and a list's columns. `lib/surface.mjs` parses it (CommonMark fences, including a
fence nested inside a longer one), and every refusal reads `<file>:<line>:` with the nearest kind and the known ones.
`sketch-render.mjs` draws every block in a file as one grey page, and a test enforces that it imports only Node and the
parser. The groom seed template and visuals rule now write this grammar; the template had been shipping a YAML-ish
shape that nothing could read.

**Sprint 2 — the spec becomes the contract** (#211, `e7e5f5f`). An approved `surfaces/<state>.surface` becomes exactly
the entry `extractSignature` would produce, plus `source: "spec"`. It is refused if the prototype owns the id, if two
files share it, or if its SHA-256 is not on an `APPROVED.md` row. It sits beside the two prototype hash pins that
`tokens.test.ts` has enforced since #128. A route may cite the id: the generator and the manifest test share one `approvedSurfaces()` call. Three
prototype states written as surfaces reproduce their entries byte for byte. `STATE-CONTRACT.json` changed by one line
(`_source`). Story 2.3 was deferred at the lock.

## What worked
- **The lock disproved six things before any code**, each said out loud:
  - 38 states, not 33.
  - ~~Nothing checked the prototype hash~~ — **wrong, corrected at close-out**: `tokens.test.ts` has pinned both
    prototypes since #128. The lock grepped for the literal hash, and the test reads it from `APPROVED.md`.
  - The template already shipped an incompatible shape.
  - The walkthrough asked for three `source: spec` entries, which D5 forbids.
  - 2.3 had no epic to wait on.
  - Only three states could be byte-expressible.

  The last one decided what parity could honestly claim, and "blocks only" covered what it missed.
- **Mutation checks on every guard**, restored from a copy each time. One harness bug (zsh not splitting `$T`) printed
  nothing, and it was caught because an empty result was treated as a failure, not a pass.
- **Looking at the page.** The snapshot was green while the phone width clipped the list bars and ran a header word
  into the next column. Only the rendered 375px screenshot showed it.
- **Two independent reads found different things.** Codex (the one external family routed here) raised one
  Should-fix on #210 (an array `kinds` accepted by `validateMap`) and was clean on every other round. The fresh
  `pr-reviewer` found:
  - the lint and Format failures;
  - `Object.prototype` names parsing as kinds;
  - the manifest gap, where an approved surface could never reach the gate.

## What didn't / incidents
- **The branch started 21 commits behind `main`.** The plan commit had never merged. It was rebased, and the pushed
  copy was then merged back in, because force-push is denied and `range-diff` proved the patch identical.
- **The delegated 1.3 builder died on a session rate limit** before writing a file. Its worktree held only a branch, as
  `git status` showed. The architect built 1.3, and the README routing was amended to say so.
- **The same CI lesson was paid for twice in one PR.** Lint was red; fixing it revealed the Format step behind it. S2
  then failed Format the same way. The fix that held was replaying every `run:` line of the static job from
  `ci.yml`. This is the third time LEARNINGS records it, and it is now sharpened to say so.
- **Fixed a class in S1 and missed the sibling in S2.** `kind in OBJ` became `Object.hasOwn`, but `state in entries`
  in the next PR did not, until review.
- **The headline claim was briefly false under a green CI.** `surfaces/README.md` said an approved surface is checked
  by the gate; `route-manifest.test.ts` admitted prototype ids only. It was fixed rather than softened, and probed end
  to end.

## Gaps / follow-ups
- **Story 2.3:** the next epic that adds a console state should draft it as a surface, get Daniel's hash row, and cite
  it in `route-manifest.ts`. Until then the contract holds 0 spec entries.
- **A lock claim was wrong, and it shipped into five docs before the close-out audit caught it.** Lock C2 said nothing
  checked the prototypes' hashes; `tokens.test.ts` has since #128. Corrected in the README (dated), the poster,
  `APPROVED.md`, a code comment and this file. There is no follow-up chore: the check exists.
- **Words are drawn, not enforced.** A head's title, an answer's sentence and an empty state's copy are approved in the
  picture but not in the contract. The same holds for prototype states (D13 scope), and it is worth knowing before
  someone assumes otherwise.
- **Owed to Daniel:** open one rendered wireframe and say whether it reads; and check the signed-in `/app/flags` look
  (S2 step 4, with the authed gate as a green proxy).

## Durable learnings
- **A new SOURCE of a thing needs every validator of the set widened.** Grep the constant that enumerates it
  (`ALL_STATE_IDS`), not the one caller you changed. Sharpens LEARNINGS' "grep for its siblings".
- **Derive the local gate from the workflow file, never from memory: each red step hides the next.** Sharpens "a local
  gate that is a subset of CI's".
- **A seed's example can be wrapped so that no parser sees it.** The epic's own sketch sat inside a four-backtick fence;
  correct CommonMark handling meant the walkthrough would have rendered nothing. Test the example with the tool it
  demonstrates.
- **To prove nothing checks a value, change it and watch what goes red.** Lock C2 grepped for the literal hash and
  missed a test that reads it from the file. Sharpens LEARNINGS' "verify an absence by enumerating".

**Owed to Daniel: did we build what was meant?** Answer on its own line as `_Intent: yes_`, `_mostly_` or `_no_`. The
builder does not answer this for the product owner. This epic has no `intent_match:` score, so `epic-dod` does not require it.
