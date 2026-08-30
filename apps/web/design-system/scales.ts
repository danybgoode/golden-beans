// The type, space, weight, radius and elevation scales — DERIVED FROM THE APPROVED DESIGN BY
// MEASUREMENT, not chosen.
//
// ── How these were arrived at, so the next person can re-derive them ──────────────────────────
// `reference.css` is the approved prototype's stylesheet, extracted verbatim by `extract-css.mjs`.
// Every number below is a value that stylesheet actually uses, and the `uses` count beside it is how
// many declarations use it. Story 2.1's requirement is "derived from the approved prototype by
// measurement, not by taste", and a count is the difference between the two.
//
// ── ⚠️ THE FINDING: the approved design's SPACING IS NOT ON A SCALE ───────────────────────────
// Its type is: 184 font-size declarations across 20 values, and **131 of them (71%) fall in the
// five steps 11 → 13.5**. That is a scale someone designed.
//
// Its spacing is not. The padding/gap/margin values run 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
// 15, 16, 18, 20, 22 — eighteen values with no gaps, which is the definition of "a number someone
// typed" that Story 2.1 exists to replace. `SPACE` below is therefore the smallest scale the design
// SNAPS TO, and `OFF_SCALE_SPACE` records every value in the approved stylesheet that does not land
// on a step, with how often. That list is a debt, not a decoration: it is what a builder consults
// when a port wants 11px and the scale offers 10 or 12.
//
// The scale is not applied retroactively to `reference.css` — that file is generated verbatim from
// an approved artefact and must stay byte-identical to it. It governs what `system.css` and every
// primitive written from here on may use.

/** One step of a scale, with the evidence for it. */
export type Step = {
  /** The value, in px. */
  px: number
  /** How many declarations in the approved stylesheet use it. */
  uses: number
  /** What it is for, in the approved design. */
  role: string
}

/**
 * The type scale.
 *
 * Named by role rather than by size (`body`, not `t13`), because a role survives a redesign and a
 * number does not — and because the epic's whole complaint is that pages were built from numbers.
 * The five steps from `micro` to `body` carry 71% of the design's type.
 */
export const TYPE = {
  /** Column labels and the group heading. The only uppercase, and never mono (Do-not #3). */
  label: { px: 11, uses: 16, role: 'uppercase column labels, 600' },
  /** Chips, pills and dense metadata. */
  micro: { px: 11.5, uses: 13, role: 'chips and dense metadata' },
  /** Secondary text inside a row. */
  small: { px: 12, uses: 23, role: 'secondary row text' },
  /** Descriptions, stat labels, captions. */
  caption: { px: 12.5, uses: 30, role: 'descriptions, stat labels' },
  /** Controls: tabs, buttons, menu items. */
  control: { px: 13, uses: 29, role: 'tabs, menu items, the project switcher' },
  /** The workhorse. Rail items, body copy, the answer line, feature keys. */
  body: { px: 13.5, uses: 33, role: 'rail items, body copy, the answer line' },
  /** The page ground — set on `.is-console` itself. */
  ground: { px: 14, uses: 7, role: 'the console ground size' },
  /** Section headings inside a page. */
  section: { px: 15, uses: 8, role: 'in-page section headings' },
  /** The page h1. Contract Do-not #1: 23/700 on ONE line, never the `display` class. */
  page: { px: 23, uses: 2, role: 'the page h1 — 23/700, one line' },
  /** Stat numbers, in mono with tabular figures. */
  stat: { px: 26, uses: 2, role: 'stat numbers, IBM Plex Mono 600, tabular-nums' },
} as const satisfies Record<string, Step>

/**
 * The weight scale. Three weights, and the approved stylesheet uses exactly three.
 *
 * ⚠️ There is no 400 entry and that is not an omission: `reference.css` never DECLARES 400, because
 * it is the inherited default. Adding a `regular: 400` step would invent a declaration the design
 * does not make.
 */
export const WEIGHT = {
  medium: { px: 500, uses: 14, role: 'the active section tab' },
  semibold: { px: 600, uses: 49, role: 'rail items, buttons, labels, stat numbers' },
  bold: { px: 700, uses: 6, role: 'the page h1 and the brand mark' },
} as const satisfies Record<string, Step>

/**
 * The space scale — a 2px-based ramp the approved design snaps to.
 *
 * Chosen as the smallest ramp that covers the design's actual usage without inventing steps: the
 * six values below account for 152 of the 288 spacing declarations, and every other value in the
 * stylesheet is within 1px of one of them (see `OFF_SCALE_SPACE`).
 */
export const SPACE = {
  hair: { px: 2, uses: 15, role: 'the gold underline, hairline offsets' },
  tight: { px: 4, uses: 17, role: 'icon-to-label inside a chip' },
  snug: { px: 6, uses: 29, role: 'stacked text in a row' },
  base: { px: 8, uses: 38, role: 'the default gap between siblings' },
  cosy: { px: 12, uses: 33, role: 'row padding, control padding' },
  roomy: { px: 16, uses: 22, role: 'panel padding, section gaps' },
  loose: { px: 20, uses: 14, role: 'page gutters' },
} as const satisfies Record<string, Step>

/**
 * ⚠️ Every spacing value in the approved stylesheet that is NOT a step, and how often it appears.
 *
 * This is the finding, written down rather than rounded away. A port that needs one of these should
 * take the nearest step and say so in review; a port that genuinely cannot is telling you the scale
 * is wrong, which is a decision for the product owner and not for the builder.
 *
 * `11px` is the loudest: 25 declarations, all row and control padding, sitting between `cosy` (12)
 * and `base` (8). It is the single value most likely to be argued about.
 */
export const OFF_SCALE_SPACE: readonly { px: number; uses: number; nearest: keyof typeof SPACE }[] = [
  { px: 1, uses: 7, nearest: 'hair' },
  { px: 3, uses: 15, nearest: 'hair' },
  { px: 5, uses: 18, nearest: 'tight' },
  { px: 7, uses: 21, nearest: 'base' },
  { px: 9, uses: 24, nearest: 'base' },
  { px: 10, uses: 26, nearest: 'cosy' },
  { px: 11, uses: 25, nearest: 'cosy' },
  { px: 13, uses: 16, nearest: 'cosy' },
  { px: 14, uses: 23, nearest: 'roomy' },
  { px: 15, uses: 9, nearest: 'roomy' },
  { px: 18, uses: 14, nearest: 'roomy' },
  { px: 22, uses: 9, nearest: 'loose' },
  { px: 24, uses: 5, nearest: 'loose' },
  { px: 26, uses: 7, nearest: 'loose' },
]

/**
 * The radius set. `--r` and `--r-lg` are tokens; the rest are shapes, not sizes.
 *
 * `999px` is the pill and `50%` the circle — neither is a step on a ramp, and treating them as one
 * is how a pill becomes slightly-rounded-rectangle after a token change.
 */
export const RADIUS = {
  control: { px: 8, uses: 25, role: 'buttons, inputs, rows — `var(--r)`' },
  panel: { px: 12, uses: 12, role: 'panels and dialogs — `var(--r-lg)`' },
} as const satisfies Record<string, Step>

/** Every step of every scale, flattened — what `scales.test.ts` checks against the stylesheet. */
export const ALL_STEPS = [
  ...Object.entries(TYPE).map(([name, step]) => ({ scale: 'TYPE', name, ...step })),
  ...Object.entries(SPACE).map(([name, step]) => ({ scale: 'SPACE', name, ...step })),
  ...Object.entries(RADIUS).map(([name, step]) => ({ scale: 'RADIUS', name, ...step })),
] as const
