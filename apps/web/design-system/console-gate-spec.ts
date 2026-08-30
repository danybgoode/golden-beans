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
  { what: 'page h1', selector: 'main h1', fontSize: '23px', fontWeight: '700' },
  { what: 'page subtitle', selector: '.page-head p', fontSize: '13.5px', fontWeight: '400' },
  { what: 'the answer line', selector: '.answer', fontSize: '13.5px', fontWeight: '400' },
  { what: 'stat number', selector: '.stat .n', fontSize: '26px', fontWeight: '600', fontFamily: /Plex Mono/ },
  { what: 'stat label', selector: '.stat .k', fontSize: '12.5px', fontWeight: '400' },
  { what: 'list header row', selector: '.listhead', fontSize: '11px', fontWeight: '600', height: 36 },
  { what: 'feature key', selector: '.row-key code', fontSize: '13.5px', fontFamily: /Plex Mono/ },
  { what: 'feature description', selector: '.row-desc', fontSize: '12.5px', fontWeight: '400' },
  { what: 'state pill', selector: '.pill', fontSize: '12px', fontWeight: '600', height: 26 },
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
  { what: 'the row switch', selector: '.row-act .sw', height: 21, width: 38 },
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
  {
    what: 'feature row',
    // ⚠️ 71, not 78. This row deferred from a number D8 disproved and no run reproduces, and it
    // survived the commit that added an owner and a date to it. `console-spec.test.ts` now asserts
    // every `contract` here against the regenerated table, so it cannot happen again.
    contract: 71,
    built: 'up to 90',
    why: 'the never-state detail wraps to two lines in a 190px column',
    // ⚠️ The contract number itself was WRONG: a fresh measurement says 71, not 78 (epic D8). It is
    // corrected by regeneration in `MEASURED-SPEC.md`, and this row stays deferred only for the
    // wrap, which Story 4.1 fixes when it rebuilds the list against reference state `ship-features`.
    owner: 'Daniel',
    until: '2026-10-15',
  },
  {
    what: 'dormant summary row',
    contract: 89,
    built: '91',
    why: 'two-line body copy; within 3px of the contract',
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
  {
    what: 'section nav (tier 2)',
    contract: 44,
    built: 'not built',
    why: 'ProductShell renders the tabs INSIDE the 54px header, so the second tier does not exist — splitting it touches every console route and is out of this PR',
    // Story 3.2 is that PR. This is the one deferred row that describes something genuinely absent
    // rather than slightly off, which is why it gets the tightest date.
    owner: 'Daniel',
    until: '2026-09-30',
  },
] as const
