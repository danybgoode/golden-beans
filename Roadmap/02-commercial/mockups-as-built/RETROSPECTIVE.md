# The mockups, as built — delete the disclosures and finish the screens — Retrospective

_Closed: 2026-09-10_

## What shipped

| Sprint | What | Ref |
|---|---|---|
| 1 | The gate that can fail — a structural state contract generated from the approved prototype, per route, blocking | `93b3403` (PR #136) |
| 2 part 1 | Five routes: Today, Journeys, Scenarios, Experiments, Destinations. The `<details>` deleted and the modal seam built | `20cecfb` (PR #137) |
| 2 part 2 | The two detail routes, the `versions` primitive, and Story 2.5 — scenario evidence per drill | `fd10fb7` (PR #138) |
| 3 | North Star as a route, Activity paginated, `CONSOLE_SHELL_ENABLED` deleted | `5e5bedf` (PR #138) |
| 4 | The eight routes nothing was measuring — both Setup surfaces, Shares, the three hub routes, `/install`, `/s/[token]` | `a54bc01` (PR #138) |
| walkthrough | `.ds-row-desc` was a `<span>`, so none of its clipping applied — found on production | `81336ea` (PR #139) |
| 4.1 close | Every approved `+ New …` opens the wizard shape — Keys AND Destinations, and the guard that presses them | PR #140 |

**22 of 22 routes match their approved state's structural signature, measured.** `coverage.json`
reads 28/28 with `outstanding: []`, derived from the gate rather than from a hand-typed boolean.

## What we learned

### `design-system-rails` reported 27/27 with `outstanding: []`, and at least sixteen routes did not match

The number was real arithmetic over `route-manifest.ts`, where `rendersFromDesignSystem: true` was a
hand-typed boolean on each row. Nothing measured it. The ratchet around that number was careful and
its input was typed, so the whole apparatus was rigorous about a value nobody had checked.

**That epic's docs are not rewritten.** The record of what it claimed is the evidence, and this
section is the correction.

Three things had to be true at once for it to go unnoticed, and each is a separate lesson:

1. **The screenshot layer specified as Layer 3 of the original contract was never built**, and the
   spec said so in a comment at line 372 — a stated gap that read as a note rather than as a hole.
2. **The assertion on 25 of 27 routes was `status < 400` and "the `<main>` contains at least one
   `ds-` class".** A JSON textarea inside a collapsed `<details>` satisfies both.
3. **The old UI was HIDDEN, not replaced.** Sixteen disclosures under `app/app`, twelve of them
   wrapping the exact JSON stacks the redesign was commissioned to remove — and a `<details>` is
   invisible to a presence check and to a screenshot of a viewport.

### The measurement that disproved D2, and why it is the most useful thing here

D2 as groomed specified a per-route screenshot diff against the approved PNG, with a threshold
settled by making Journeys red and Ship › Features green. It was disproved by measuring it before
writing it: the page the epic calls **correct** came out 6.9% from its picture and the page it calls
**wrong** came out 6.4%, and the structural metric scored the canonical wrong page a perfect match.
No threshold separates them. Four measured causes, none fixable by a better metric — the content
column differs by construction on every route, the PNGs paint a `PROTOTYPE` badge and designer
annotations that must never be product UI, the PNGs were 960px clips of designs up to 1711px tall,
and live data is not fixture data.

**The general form:** a gate whose threshold has to be tuned until the right pages pass is a gate
aimed at today's pages. The replacement asserts the facts that survive a change of dataset — the
block sequence, the tile count, the column labels, the primary action's label, and that the number
of `<details>` is zero.

### A structural match is not a look — nine defects found by opening the page

Every one of these was on a route whose signature already agreed with its approved state:

- the Activity timeline rendering as **one crammed line** (three `<span>`s inside a `<span>`; every
  `margin-top` below them did nothing), which had shipped an epic earlier
- the `.ds-doc` measure squeezing every table in the pod report to 70ch
- `.ds-dests` overflowing a 360px phone
- a **disabled** decision outcome painted as the chosen one
- an `Empty` making the guardrail panel the tallest block on the page while saying the least
- `ComparisonBars` drawing half its approved line — the shortfall but not "Enough people", so an arm
  that HAD reached its sample said nothing and "enough" and "no minimum declared" looked identical
- `.ds-step-action` putting "Add to Claude" on the same line as the step it belongs under
- Setup › Connect opening on a STATUS verdict about a URL not yet shown
- the three North Star plots wrapping 2 + 1 because the track was capped at 380px

The contract is a floor, not a finish. It cannot go green on a page nobody has looked at — and it
cannot go red on one that looks wrong while its blocks are right.

### A structural contract measures the DEFAULT state, so a button can lie on a green route

Two surfaces — Setup › Keys and Destinations — drew the approved `+ New …` control, matched their
approved block sequence on every run, and opened an inline panel instead of the wizard shape D8
requires. Both facts were true at once, and neither is a bug in the contract: **it measures what a
route renders before anybody touches it, and the panel only existed after a click the gate never
made.** Seven review rounds did not find them either; the first was found by pressing the button on
production, and the second by the guard written for the first.

The guard is the general form, and it is written against the contract rather than beside it: for
every approved state whose head draws an action, press that action's exact words and require a
`<dialog>` that is genuinely `:modal`. Nothing is retyped, so a seventh `+ New …` is covered the
moment its state is generated. **The lesson is not "click more buttons" — it is that a gate's scope
is a claim, and this one's was "the page as it loads".**

### Three routes were FIXTURE gaps wearing product defects' clothes

Destinations' empty list, the North Star's one leading input where the design draws three, and the
two hub artifacts. In each case the gate reported the PAGE as wrong and the page was correct: a
fixture thinner than the design cannot tell a correct page from an incorrect one. The tell is a
diff where the built sequence is a plausible EMPTY state of the approved one.

### Deleting a flag is mostly about the suites that read it

`CONSOLE_SHELL_ENABLED` was six `test.skip` conditions away from silence — including
`console-visual.authed.spec.ts`, this epic's own blocking gate. With the variable unset everywhere,
each would have skipped in every run forever and reported green having asserted nothing. **None of
it appears in a diff of the flag itself.**

The repo had already paid for this twice (`SIGNUP_ENABLED`, `FLAG_CONSOLE_ENABLED`) and the lesson
had been written down both times. What is new here is the direction: those were flags set NOWHERE
and asserted as if lit; this is a flag DELETED and still read. Same failure, opposite cause.

### Two guards were passing incidentally

`⌘K still finds a SURFACE once features are in the list` asserted `toHaveCount(1)` — which held only
because no fixture feature's key contained the word "Activity". The test written for the crowded
case was running on an uncrowded one. Seeding a colliding key turned it red for the right reason,
and a first attempt to fix it asserted the surface ranked FIRST, which is the opposite of what
`console-palette.ts:96` says the design does. **The guard corrected the fix.**

### A comment can be as wrong as the code, and it is not checked by anything

The `NewThingDialog` fix was first attributed to a missing effect dependency, with a paragraph
explaining why. Reverting the dependency proved the guard held without it — the real cause was
React delegating a non-bubbling `close` event. The wrong explanation was deleted rather than left
beside a working fix. **Prose asserting a property the code does not have is a defect with no test.**

## Gaps / follow-ups

- **`/app/flags/[projectSlug]`'s New feature wizard renders `console.css`'s `.modal`, not
  `.ds-dialog`** — a stated `design-system-rails` S4.1 deviation, exempted BY NAME in the D8 guard's
  `WIZARD_DEVIATIONS` so the exemption is one line in a diff rather than a silent pass.
- **The Activity entry names its actor as a raw UUID** where the approved state draws a name.
  Resolving it needs a read of the auth schema — a new query and arguably a new boundary — so it is
  raised rather than built. Named in the epic README and in `sprint-3.md`.
- **`POD_REPORT_TABLES_DEFERRAL` is AMENDED, not closed.** Its premise ("the approved `hub-report`
  state is PROSE and contains no table at all") is disproved — the state is a DOCUMENT and a document
  may contain a table — but its substance stands: the evidence tables are still painted by
  `hub.module.css`. Matching a block sequence is not rendering from `design-system/`, and closing it
  on the strength of a green gate would be this epic's own defect. The date was not moved.
- **`/app/impact/…` BORROWS `measure-north-star`** (D14-b) until a per-feature impact screen is
  designed, or the route is retired into the feature page's Impact tab, which already covers it.
- **The browser-level assertion that the hub's empty state is VISIBLE** is gone: the fixture must now
  push artifacts for the hub routes to be measurable, and artifacts are append-only.
  `hub-empty-state.spec.tsx` asserts its words instead.
- ~~The production walkthrough, and removing `CONSOLE_SHELL_ENABLED` from every Vercel
  environment~~ — **both done 2026-09-10**, each authorized by Daniel by name.
- **Two live prod credentials from the walkthrough** — an API key and a share link, both labelled
  `walkthrough-2026-09-10-…`. Real and working; revoke them if they are not wanted.
