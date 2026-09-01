// The numbers the visual gate asserts, as DATA the fast unit layer can check.
//
// ── Why this is not inside `console-visual.authed.spec.ts` ────────────────────────────────────
// It was, and that made the weld a lie. `console-spec.test.ts` exists to check the gate's numbers
// against the regenerated `MEASURED-SPEC.md` — but it was written against a HAND-RETYPED COPY of
// these two arrays, so it checked itself. The fresh reviewer proved it by mutation: setting the
// gate's page-h1 to `48px` — the pre-contract value this whole epic exists to catch — left all
// twenty design-system tests green.
//
// The in-tree evidence was already visible and nobody had looked: the gate's deferred row said
// `contract: 78` while the weld's copy said `71`. **78 is the disproved number the weld's own
// header says it was written to fix.** It fixed its copy and left the gate carrying the defect.
//
// Two things that must agree get ONE implementation, not two that currently match
// (CODE-QUALITY.md #2). So the arrays live here, the Playwright spec imports them, and the unit
// test imports the same objects. Only the prototype-row MAPPING stays hand-written, because that
// is a genuine claim — "this app element and that prototype element are the same thing in the
// design" — and there is nothing to derive it from.

/**
 * How far down a page its first element carrying DATA may begin, at 1440 × 960.
 *
 * ⚠️ **This replaced an assertion that was green for the wrong reason, and that is the whole story
 * of this constant.**
 *
 * The visual gate required every covered route to fit 1440 × 960 without scrolling, citing *"a page
 * that scrolls means the chrome is eating the viewport — 48px headings, three-line rail cards, a
 * list that pages at 25 instead of collapsing."* Measured against the approved design itself
 * (`MEASURED-SPEC.md`, the chrome table), **eleven of the thirty approved states scroll**: `today`
 * is 1711px, `experiment-blocked` 1625px, `hub-roadmap` 1364px — and `ship-activity` is 1274px while
 * the route built from it passes the gate today. The gate was asserting a property the approved
 * design does not have, and it was passing because the fixture tenant is thin.
 *
 * Every failure that assertion actually names is about CHROME, not about row count. So this is the
 * chrome, measured: the top of the first element carrying data. A 48px `h1` wrapping to four lines
 * pushes it down. A three-line rail card pushes it down. Two hundred extra rows do not.
 *
 * ⚠️ **480 is a BOUND derived from the design, not a measurement of it — and the difference cost a
 * red CI run to learn.** The first version welded this to the generated table's maximum byte for
 * byte, and `--check` went red on `ubuntu-latest`: `ship-features` measures **458** on macOS and
 * **459** there, and `today` measures **223** and **202**, because a lede wraps differently under
 * different font metrics. These are text-layout positions — the same class as `Page h1`'s width,
 * which `MEASURED-SPEC.md` has recorded as `_text-sized_` since Sprint 1 for exactly this reason. I
 * committed a fact about my laptop and called it the design, which is the defect that file exists to
 * prevent.
 *
 * So the chrome table is EVIDENCE (emitted below `--check`'s marker, never compared), and this is a
 * ceiling above it: the design's worst case, plus **21px** — the largest cross-platform delta the
 * table itself shows, `today`'s 223 vs 202. `console-spec.test.ts` holds it to being at least the
 * table's maximum and within 40px of it, so it stays derived from the design and cannot be argued
 * upward in a spec file, while a one-pixel renderer difference cannot turn the gate red.
 *
 * Every console state other than the `ship-features` family measures 202–384, so the budget is not
 * slack: it is one page's head plus the variance that page's own text carries.
 */
export const CHROME_BUDGET_PX = 480

export type SpecRow = {
  what: string
  selector: string
  fontSize?: string
  fontWeight?: string
  fontFamily?: RegExp
  height?: number
  width?: number
  /** Heights tolerate ±1px per the contract; font size and weight are exact. */
  tolerance?: number
}

// ⚠️ **THE SELECTORS MOVED TO `ds-` IN SPRINT 4, AND THE NUMBERS DID NOT.** Story 4.1 rebuilds Ship
// › Features from `apps/web/design-system/`, so `.answer` became `.ds-answer`, `.stat .n` became
// `.ds-stat-value`, `.row-act .sw` became `.ds-col-act .ds-switch`, and so on. `console-spec.test.ts`
// welds this table to the regenerated `MEASURED-SPEC.md` by ROW NAME and by VALUE, never by
// selector — which is why a port can move every selector here and the weld still checks the design
// rather than the markup. The `page h1`, `rail item` and two chrome rows are unchanged: the shell is
// Sprint 3's and this sprint does not touch it.
export const MEASURED_SPEC: SpecRow[] = [
  // ⚠️ The chrome had NO row at all, so nothing in the epic's own gate looked at the part of the
  // page the epic rebuilt — and Do-not #3 was open there (uppercase mono in the project switcher)
  // for three review rounds (fresh reviewer, round 3).
  {
    what: 'project switcher',
    selector: '.product-shell__identity .product-shell__signal',
    fontSize: '13px',
    fontWeight: '400',
  },
  { what: 'section tab', selector: '.product-shell__tab', fontSize: '13px' },
  // ⚠️ **THE TWO TIERS, which the contract measured and the gate never checked.**
  // `MEASURED-SPEC.md` has carried "Top bar (tier 1) 1440 x 54" and "Section nav (tier 2) 1440 x 44"
  // since Sprint 1 — generated from the approved prototype. Neither had a row HERE, the array
  // actually asserted against the product, so the console shipped with ONE 54px bar carrying the
  // tabs inside it at 289px wide and nothing noticed: measured, written down, published in a
  // contract, never compared to the thing it described (Story 3.2).
  //
  // Width is deliberately omitted. Both tiers are full-bleed, so at the gate's 1440 viewport they
  // measure 1440 — a number that says the viewport is 1440, not that the design is right. The
  // HEIGHTS are the design decision.
  //
  // `tolerance: 0`. ±1 is the runner's default and is right for text-sized things that shift a pixel
  // between platforms; these two are STATED heights on full-bleed bands — 54 and 44 exactly, or the
  // chrome is not the approved chrome. Verified load-bearing: setting the CSS to 55/45 fails both
  // rows at 0 and passes at the ±1 default.
  //
  // ⚠️ **The justification that used to sit here was a reproduction that did not reproduce.** It
  // said stripping tier 2's `height` leaves the row "at 43px, and |43 − 44| = 1", so the row passed
  // at ±1. The reviewer measured it at **43.5px**, which `Math.round` turns into 44 — so that
  // mutation passes at ±1 AND at 0, and proves nothing about either. I wrote a plausible number
  // instead of reading the one the failure printed (fresh reviewer, Major; 43.5 is THEIR
  // measurement, cited rather than re-derived here, which is the honest way to carry it).
  //
  // Keeping `tolerance: 0` and correcting the reason, rather than the reverse: the field is right,
  // the evidence for it was invented. Prose asserting a property the code lacks is this epic's third
  // most common defect and this is an instance of it in a comment about avoiding it.
  { what: 'top bar (tier 1)', selector: '.product-shell__header', height: 54, tolerance: 0 },
  { what: 'section nav (tier 2)', selector: '.product-shell__tabs', height: 44, tolerance: 0 },
  { what: 'page h1', selector: 'main h1', fontSize: '23px', fontWeight: '700' },
  { what: 'page subtitle', selector: '.ds-page-head p', fontSize: '13.5px', fontWeight: '400' },
  { what: 'the answer line', selector: '.ds-answer', fontSize: '13.5px', fontWeight: '400' },
  {
    what: 'stat number',
    selector: '.ds-stat-value',
    fontSize: '26px',
    fontWeight: '600',
    fontFamily: /Plex Mono/,
  },
  { what: 'stat label', selector: '.ds-stat-label', fontSize: '12.5px', fontWeight: '400' },
  { what: 'list header row', selector: '.ds-listhead', fontSize: '11px', fontWeight: '600', height: 36 },
  { what: 'feature key', selector: '.ds-row-key code', fontSize: '13.5px', fontFamily: /Plex Mono/ },
  { what: 'feature description', selector: '.ds-row-desc', fontSize: '12.5px', fontWeight: '400' },
  { what: 'state pill', selector: '.ds-pill', fontSize: '12px', fontWeight: '600', height: 26 },
  // ⚠️ `.console-rail ul a`, not `.console-rail a`. `ConsoleRail` renders the environment picker
  // BEFORE the list, so the bare selector matched an `.envpick` link — and it passed only because
  // the rail-item rule was leaking onto a control the reference styles separately (fresh reviewer,
  // round 3). Two defects in one line: the wrong element, and a rule reaching past its subject.
  // ⚠️ `> ul a`. `.console-rail ul a` still matched the environment picker, which renders its own
  // `<ul>` inside the rail — so this row measured the wrong element for a SECOND round, and passed
  // (fresh reviewer, round 4).
  { what: 'rail item', selector: '.console-rail > ul a', fontSize: '13.5px', fontWeight: '600', height: 36 },
  // ⚠️ **Was a DEFERRED row until Story 3.3.** It read: *"switch · contract 21 · not built · the
  // row-act cell has no controls until Story 3.3 lands the toggle alongside its replacement
  // authoring path."* It is built, so it moves from the list of things this gate does not check to
  // the list it does — which is the only honest way for a deferred row to be closed.
  //
  // The 21px height needs `min-height` on the element: `globals.css` applies a 44px WCAG 2.5.5
  // target floor to every `button`, and used height is `max(min-height, height)`. The floor is met
  // by a transparent 44px pseudo-element instead, so the TARGET is 44 and the INK is the design's
  // 38 × 21 — which is the resolution the `primary/secondary button` row below could not have,
  // because a button's ink IS its target.
  { what: 'the row switch', selector: '.ds-col-act .ds-switch', height: 21, width: 38 },
  // ⚠️ **Was a DEFERRED row until Story 4.1** — see the note at the top of `DEFERRED_SPEC_ROWS`.
  // The height is driven by the STATE column, not by the feature column: a 26px pill plus a 3px gap
  // plus one line of detail. Clamping the detail to one line is what makes it the same 71 on every
  // state, and asserting it is what stops the wrap coming back.
  { what: 'feature row', selector: '[data-feature-list] .ds-row', height: 71 },
]

/**
 * ⚠️ **Rows the contract specifies that the build does NOT meet.**
 *
 * The previous version of this file carried ten rows, was named "every row of the measured spec",
 * and its own header cited "feature row h78" as something it asserted. It did not — and the three
 * rows it left out are exactly the three that fail (fresh reviewer, round 3):
 *
 *   feature row          contract 78   built 90 when the row's state is `never`
 *   dormant summary row  contract 89   built 91
 *   primary/secondary    contract 38   built 44
 *
 * A gate that asserts what passes and describes what fails is the failure mode this whole layer was
 * added to end, one level up. So they are listed, with the reason each is deferred rather than
 * silently dropped.
 *
 * **The 90px row is not an edge case.** It is the state 39 of 42 production flags are in, and every
 * row of the authed fixture — so the suite ran against 90px rows and stayed green. The cause is
 * real copy: `FLAG_STATE_PRESENTATION.never.detail` wraps to two lines in the 190px state column.
 *
 * And the contract's own numbers deserve scrutiny here: `console-reference.css` sets **no** height
 * on `.row` or `.btn` at all. 78 and 38 are emergent measurements of the prototype's shorter copy,
 * not declared design intent — which makes "the build is wrong" the wrong conclusion to jump to.
 *
 * `38px` is additionally **unreachable by decision**: `globals.css` sets `min-height: 44px` on every
 * interactive element for WCAG 2.5.5 target size, and used height is `max(min-height, height)`. The
 * accessibility floor wins over a measured pixel, and that is a decision rather than an oversight.
 */
// ⚠️ **Every deferred row now carries an OWNER and a DECAY DATE** — `design-system-rails` Story 1.4.
//
// This list shipped with five rows, each with a reason and none with either. A reason explains why
// a row is short today; it does not say who decides when it stops being short, or when. So nothing
// expired, nobody was asked, and "deferred" quietly became "exempt" — five routes' worth, on the
// gate that is this project's only defence against a page that looks wrong.
//
// The dates are the sprint that closes each row, plus a fortnight. `every deferred row carries an
// owner and a date that has not passed` fails once one goes by, which turns a silent exemption into
// a conversation with a name attached.
export const DEFERRED_SPEC_ROWS = [
  // ⚠️ **`feature row` is CLOSED — design-system-rails Story 4.1.** It deferred at *contract 71 ·
  // built up to 90 · the never-state detail wraps to two lines in a 190px column*, owned by Daniel
  // until 2026-10-15, with a note saying Story 4.1 would fix it when it rebuilt the list. It did:
  // `.ds-state-detail` clamps the detail to one line and carries the full sentence on `title`, so
  // the row is the contract's 71px in every state rather than 90px in the state 39 of 42 production
  // flags are in — which is why the gate ran against 90px rows and stayed green. The sentence was
  // NOT shortened: it is what separates "never turned on here" from "switched off", the distinction
  // this console exists to make.
  //
  // It has a row in `MEASURED_SPEC` above now rather than an entry here, which is the only honest
  // way for a deferral to close (the same move Story 3.3 made with the switch).
  {
    what: 'dormant summary row',
    contract: 89,
    built: '91',
    // ⚠️ STILL DEFERRED, and deliberately not swept up with its neighbour. The 2px is the body copy
    // wrapping to a second line at `max-width: 78ch` — the same wrap the prototype has, which is why
    // its own measurement is 89 and not 70. Closing it would mean pinning a height on an element
    // whose height is its text, and Story 4.1's acceptance does not ask for it. What DID change is
    // that `.ds-dormant` now carries the prototype's own `13px 16px` padding rather than a rounder
    // number, so the remaining difference is the copy alone.
    why: 'two-line body copy at 78ch; within 3px of the contract, and the difference is the sentence',
    owner: 'Daniel',
    until: '2026-10-15',
  },
  {
    what: 'primary/secondary button',
    contract: 38,
    built: '44',
    // ⚠️ Round 3's stated mechanism was imprecise: globals.css's floor covers button/summary/select/
    // textarea/input and explicitly NOT links, so an `<a class="btn">` is saved by the design
    // system's own `.btn` rule instead. The conclusion holds; the reason did not (round 4, N5).
    why: 'a 44px WCAG 2.5.5 target floor applies (globals.css for controls, the .btn rule for links) and the floor wins over a measured pixel',
    // This one is NOT a defect and will never close: an accessibility floor outranks a measured
    // pixel. The date is when Story 2.3 makes that explicit in the design system's own button, so
    // the contract and the floor stop disagreeing rather than being reconciled in a comment.
    owner: 'Daniel',
    until: '2026-09-30',
  },
  {
    what: 'project switcher',
    contract: 30,
    built: '34',
    why: "height follows the shell chrome; the contract's 140px width is waived too because a real tenant slug is longer than the prototype's and truncating it would hide the one thing the control shows",
    // Story 3.2 rebuilds the switcher against the REGENERATED number (122 x 30, not 140 x 30).
    owner: 'Daniel',
    until: '2026-09-30',
  },
] as const
