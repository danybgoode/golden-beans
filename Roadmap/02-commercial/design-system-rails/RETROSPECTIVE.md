# One design system, every surface — the rails that make a design outlive an epic — Retrospective

_Closed: 2026-09-02 — **shipped and live**, merged as `3258381` (PR #135)._

## What shipped

| Sprint | What | Merged |
|---|---|---|
| 1 — the rails | `apps/web/design-system/` exists; tokens, stylesheet and spec **generated** from the approved prototype; the manifest and the manifest-driven visual gate | `8bd9167` (#128) |
| 2 — the language | the ten-state taxonomy implemented on every primitive; `/app/design-system`, the specimen | `97254b3` (#129) |
| 3 — the shell | `ProductShell` rebuilt; 21 console routes wrapped, straight to production with no flag | `8f86cf7` (#131) |
| 4 — Ship and Setup | 8 routes; three credential routes retired into one Setup › Keys | `3229652` (#132) |
| 5 — Measure and Today | 10 more routes; the hand-rolled charting primitives; **DA2**'s significance layer | `a896f9c` (#133) |
| 6 — the doors, the hub, the deletion | the 9 non-`ProductShell` routes; **the old design deleted**; 27/27 and the ratchet | `3258381` (#135) |

**The outcome, as the epic stated it:** *"all 29 in-scope routes render from one design system in
`apps/web/design-system/`, each has an approved reference state derived from that system, the visual
gate is blocking for all of them, and coverage is a generated number that cannot go down."*
Delivered at **27/27** — 29 was corrected to 27 by **D13**'s ledger, computed rather than typed,
because the epic's own Story 4.5 retired three routes and 4.3 added one.

## What went well

- **Generation, not discipline.** `extract-css.mjs` emits the tokens, the stylesheet and the TS
  union from the approved prototype, and CI's `--check` fails on any diff. *"One definition"* holds
  **by construction**. The alternative — editing the prototype to import a shared stylesheet — was
  rejected because it would change the file's content hash, which `APPROVED.md` defines as
  un-approving the design. Refusing the tidier option here is why the contract stayed true.
- **The architecture locks did their job, loudly.** Five of eight scaffolded decisions came back
  **changed** against the live code, the live database and the live Vercel environment, and five more
  (D9–D13) exist only because verification found them. D9 alone — *preview has no database at all* —
  invalidated every preview-based walkthrough step in the epic before a builder could run one.
- **`git revert` was the right trade.** D6 removed the kill-switch mid-epic on Daniel's call. The
  saving was not the flag: it was that Sprints 3–6 did not have to keep **two designs rendering** for
  four sprints. Nothing needed rolling back.
- **The number could not be argued with.** Coverage went 0 → 0 → 0 → 8 → 18 → 27 against a
  denominator the manifest computes. Sprint 3 wrapping 21 routes moved it by **zero**, on purpose,
  because the boolean is about a page's own body and not its chrome.

## What we learned

1. **A structural guard passes on a page whose stylesheet is entirely missing.** Sprint 6's `Frame`
   shipped `<div className="ds ds-door">` where every rule is `.ds .ds-…` — a descendant combinator
   that cannot match the element carrying the scope class. `/login` rendered top-left on the
   browser's default ground, and the visual gate's four assertions all passed: `ds-` classes inside
   `<main>` ✓, chrome budget ✓, no horizontal scroll ✓, status < 400 ✓. **The epic's own thesis,
   reproduced by its author in its last sprint.** Found by rendering the page and looking.
2. **Guard the RELATIONSHIP, not the presence.** The fix for (1) is not "remember to nest": it is an
   assertion that every `ds-` element has a `.ds` **ancestor** — `parentElement.closest('.ds')`,
   deliberately not `closest()` on the element itself, which would call the broken markup correct.
3. **Porting a page means porting its measurements.** `/talk`'s iframe height was 700px with its
   working recorded in the comment (620 measured to scroll, 860 to leave a gap). The port wrote 640
   — below the value already measured as too short — and the calendar clipped. Re-deriving a number
   somebody measured, and getting it wrong, is the same defect as the two unreproducible contract
   numbers this epic **opened** by fixing.
4. **A rule dies only when EVERY selector in its comma list does.** The Sweeper's tool removed a rule
   when *any* selector matched, so `.eyebrow, .surface-note strong, .panel-label, .kicker` went with
   its one dead member — which would have silently un-uppercased three classes live across the public
   site. Caught by diffing what the sweep removed against what it was asked to remove.
5. **A JSX pragma is per FILE.** Fourteen specs went red at once with one unrelated-looking error the
   moment a page component composed a primitive from a file without `@jsxImportSource react`. Three
   files already carried the line; a caller having it does nothing for the JSX inside what it calls.
6. **A guard keyed on INDENTATION breaks on a wrapper element.** `setup-route-guards.test.ts` sliced
   `ProductShell` by newline-plus-eight-spaces and went red because a `<div>` moved every line two
   columns. Two versions of that line were now wrong in opposite directions; depth-counting is the
   version that cannot be fooled by either.
7. **Verify absence by ENUMERATING, not by grepping a command's output.** Confirming
   `DESIGN_V2_ENABLED` was in no Vercel environment, the first `vercel env ls | grep` returned "0
   matches" because the **CLI had errored**. Listing all three environments and counting (32 / 11 /
   10) is what caught it. A grep over a failed command is a false green.
8. **A `coveredBy` label is a claim, and this epic found six false ones.** Sprint 5 found four specs
   named as covering routes they cannot see; Sprint 6 closed the fifth by *minting a real share
   token* rather than rewording the string. The gate now prints what it opened — "23 route(s) opened
   here; 4 covered elsewhere" — so the reader can check rather than trust.
9. **Two copies of a decay date is one date somebody updates.** Both pod-report rows carry the same
   deferral for the same reason; it is one constant now.
10. **Seven review rounds, and the shape of them is the finding.** Rounds 1–5 each found a defect in
    the shipped product — including a Blocking one the visual gate was passing *because of*. Rounds 6
    and 7 found only guard and documentation defects. **That convergence is the stop signal, not a
    round count.** Six of the defects were in fixes for earlier rounds, and three consecutive rounds
    found a guard I had written checking a proxy instead of the property it claimed to enforce
    (presence of a string → one spelling → a tag position → finally a computed specificity).
11. **A capped review family is a real downgrade, and a fallback model is a different reviewer.**
    Codex was quota-capped for this PR; agy silently fell back from `gemini-3.6-flash-high` to
    `gpt-oss-120b-medium` on two of four passes and filed three "Blocking" findings that a one-line
    `grep -c` and a green `tsc` disprove. On the passes where it did not fall back it found **two
    real defects in a guard I had already mutation-verified** — which is exactly the value the layer
    exists for. Both halves are the lesson.

## Gaps / follow-ups

- ⚠️ **Owed to Daniel, by name — the auth-path production smoke.** Signing up and signing in as a
  brand-new user, and opening a real share link while signed out. No automated smoke covers either;
  `sprint-6.md`'s walkthrough has both with what "wrong" looks like at each step.
- ⚠️ **There is no password-reset flow.** `door-login` is approved with a "Forgot your password?"
  link and nothing in the repo calls `resetPasswordForEmail`. The control is **omitted rather than
  shipped dead**, so today a person who forgets their password has no self-serve way back in. **This
  is a product decision, not a builder task.**
- **The pod report's evidence tables are still on `hub.module.css`** — deliberately, because the
  approved `hub-report` state is prose and has no table in it. Both rows carry a `deferred` entry
  (Daniel, **2026-11-30**) and `route-manifest.test.ts` fails the day it passes.
- **`console.css` still exists** with ~150 `.is-console` rules that are not shell chrome, all on bare
  class names. `tokens.css`'s generated header promised the alias would be retired "in Sprint 6"; it
  was not, and the promise is **corrected** rather than left standing.
- **`door-signup-closed` is approved and unreachable** — `/signup` 404s while `SIGNUP_ENABLED` is
  off. Recorded in the manifest rather than silently skipped.
- **The hub's bar has no project switcher and no ⌘K.** Reaching them needs `ProductShell`, whose
  `section` is a closed union of the four console sections; widening it would re-decide DD2.
- **The two rail components carry two class names each** (`console-rail ds-rail-slot`), because
  `system.css` may only match `ds-`-prefixed selectors and renaming them outright would have touched
  fifteen `console.css` rules inside the sprint already deleting a stylesheet.
