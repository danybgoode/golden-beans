// flags-visual-rule-builder · Sprint 1, Story 1.1 — D3's single conversion seam.
//
// ── Why this is four functions in its own zero-import file, and not `bp / 100` at the call site ──
// `FlagRule.rollout.basisPoints` is an integer 0–10000 (packages/sdk/src/flags.ts, and the parser
// enforces it). A PM thinks in percent. Somewhere the two have to meet, and the epic README calls
// that meeting "the highest-consequence line in the epic" for a specific reason: a misplaced factor
// of 100 produces a flag that SAVES, RENDERS CORRECTLY, and serves ten times too many users. There
// is no type error — 1000 and 100000 are both numbers — and no integration test notices, because
// the definition round-trips perfectly. The only thing that catches it is a human reading the JSON.
//
// So the arithmetic exists exactly once, here, and every display and every write goes through it.
// Sprint 1 closes by grepping the epic's diff for a stray `100` near a rollout; that grep only
// means anything because there is one legitimate place for the number to live.
//
// Zero-import (no `server-only`, no React) for the reason LEARNINGS gives: pure logic stays free of
// framework imports so the native `node --test` runner can execute it directly. The client builder,
// the server action and the diff all import from here, which a `server-only` module could not do.

/** The stored unit's ceiling. 100% = 10000 basis points; the SDK parser rejects anything above. */
const MAX_BASIS_POINTS = 10_000
const BASIS_POINTS_PER_PERCENT = 100

/**
 * A PM's percent → the stored basis points, or `null` when the input is not a rollout.
 *
 * **Rejects rather than clamps.** 150% does not become 100%: clamping would silently agree with
 * someone who meant something else, and D2 makes the server-side parser the authority on what is
 * valid. This seam narrows what can be *typed*; it must never launder an input past a check the
 * parser would have failed. `null` is the caller's cue to show the PM an error, not a default.
 *
 * **Rounds half-up, deliberately.** Basis points hold two decimal places of percent, so 0.019%
 * cannot be stored exactly. Flooring it would give 0 — turning the smallest possible canary into
 * "nobody" without saying so — which is the more dangerous of the two directions.
 */
export function percentToBasisPoints(percent: number): number | null {
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) return null
  return Math.round(percent * BASIS_POINTS_PER_PERCENT)
}

/**
 * Stored basis points → the percent to display, or `null` when the stored value is uninterpretable.
 *
 * The `null` case is not defensive padding. This function is fed from definition rows written by
 * the parser, so a value outside 0–10000 (or a non-integer) means the row disagrees with the code
 * that wrote it. Rendering "150%" would present corruption as data; callers render "unreadable"
 * instead — the same rule `design-system/charts/geometry.ts` applies to a stage it could not read.
 */
export function basisPointsToPercent(basisPoints: number): number | null {
  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_BASIS_POINTS) return null
  return basisPoints / BASIS_POINTS_PER_PERCENT
}

/**
 * The one label. Every rollout the product renders — the builder's control, Sprint 2's bars and
 * diff sentences, Sprint 3's "excluded by rollout" — comes from here.
 *
 * Three outcomes, and the distinction between the first two is the point:
 *   • `undefined` / `null` — **no rollout is configured**, which means EVERYONE who matches the
 *     clauses. Rendering that as "0%" would invert the rule's meaning, and an empty bar reading as
 *     zero is exactly the failure Story 2.1 names (CODE-QUALITY rule 8).
 *   • a valid 0–10000 — the percent, with its unit attached so no caller has to remember it.
 *   • anything else — "unreadable". Never a guess.
 */
export function formatRolloutPercent(basisPoints: number | null | undefined): string {
  if (basisPoints === null || basisPoints === undefined) return 'everyone'
  const percent = basisPointsToPercent(basisPoints)
  return percent === null ? 'unreadable' : `${percent}%`
}

/**
 * The proportion of the bar to fill, 0–100 — or `null` when the stored value cannot be read.
 *
 * An absent rollout fills the bar completely, because "no rollout" means every matching context is
 * served (see `formatRolloutPercent`). Sprint 2's `RolloutBar` pairs this with that label so the
 * geometry and the words can never disagree about what an unset rollout means.
 *
 * ── Why `null` and not `0` for a corrupt value (cross-review, Codex) ──────────────────────────
 * This returned `?? 0`, which drew an EMPTY bar for a basis-points value the label beside it was
 * simultaneously calling "unreadable". An empty bar reads as "0% — reaching nobody", so corrupt data
 * would have been presented as a real, deliberate targeting decision, with the two halves of the
 * same component contradicting each other. `null` forces the caller to render the unreadable state
 * the label already uses — the same rule `design-system/charts/geometry.ts` applies to a stage it could not read,
 * and the CODE-QUALITY rule 8 case where a broken read must not look like a legitimate zero.
 */
export function rolloutBarPercent(basisPoints: number | null | undefined): number | null {
  if (basisPoints === null || basisPoints === undefined) return 100
  return basisPointsToPercent(basisPoints)
}
