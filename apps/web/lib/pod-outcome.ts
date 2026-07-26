// pod-report · Sprint 2, Story 2.2 — the outcome layer.
//
// Delivery metrics say "shipped fast". This says "shipped AND it mattered" — or admits that we
// cannot yet tell, which for a first real tenant is often the truthful answer.
//
// ── Read through the canonical query libs, never around them ──────────────────────────────────
// AGENTS rule #1: TARS and North-Star reads go through `lib/tars-query.ts` and
// `lib/north-star-query.ts`. This module SHAPES their results and never re-queries `events`
// itself, so a change to how a funnel is computed reaches the Pod Report automatically instead of
// drifting away from every other surface that shows the same number.
//
// ── Why this is a live read, not a section of the pushed artifact ─────────────────────────────
// The delivery half is computed by a Node script from a git checkout and pushed. The outcome half
// needs the engine's own database, which that script has no business holding credentials for. So
// the report joins a STORED delivery artifact to a LIVE outcome read at render time. It also makes
// the outcome numbers current rather than frozen at generation, which is what a reader assumes of
// anything labelled "adoption".
//
// No `server-only` import here on purpose: the shaping below is pure and unit-tested, and the
// Supabase-touching callers live in the query libs it consumes.

/** What the outcome layer can say about one registered feature. */
export type OutcomeRow = {
  featureKey: string
  /** Registry-declared funnel counts. Null when the funnel could not be read at all. */
  tars: { targeted: number; adopted: number; retained: number } | null
  /** Adopted ÷ targeted, as a fraction. Null when targeted is zero — never 0, which would read as failure. */
  adoptionRate: number | null
  /** Retained ÷ adopted. Same null-not-zero rule. */
  retentionRate: number | null
  /** Every row states where its numbers came from, so a reader can go and check. */
  provenance: string
  /** Present when something is honestly unmeasurable for this feature. */
  caveat?: string
}

export type OutcomeSection = {
  tenant: string
  /**
   * True when the outcome layer could not be READ, as distinct from having nothing to report.
   *
   * These are opposite facts and this repo has already shipped the bug that conflates them: a query
   * that silently returns nothing renders as an honest-looking zero, and a zero pages nobody
   * (Roadmap/LEARNINGS.md). "No features are registered" is a truthful sales answer; "the database
   * did not answer" is an incident. The renderer must not present the second as the first.
   */
  unavailable: boolean
  rows: OutcomeRow[]
  northStar: {
    metric: string | null
    /** True when the metric read FAILED. Distinct from `null` (no metric registered) — same
     *  three-state discipline as the section's own `unavailable`, applied one level down. */
    unavailable?: boolean
    /** Null when the count query itself failed — NOT 0, which would assert "none are registered". */
    inputCount: number | null
    /** Null when no value has been recorded — distinct from a recorded zero. */
    latestValue: number | null
    caveat?: string
  } | null
  notInstrumented: Array<{ key: string; label: string; reason: string; guardrail: string }>
}

/**
 * Outcome metrics this layer deliberately does not compute, each with the guardrail that would
 * close it — the same honest-gap-as-upsell shape the delivery half uses.
 */
export const OUTCOME_NOT_INSTRUMENTED = [
  {
    key: 'revenue_per_feature',
    label: 'Revenue per feature',
    reason:
      'Revenue attribution requires linking a transaction back to the feature that drove it. The engine ' +
      'reads attribution telemetry and derived reports, never a commerce replica (the Medusa-truth ' +
      'boundary), and no attribution events are being sent yet.',
    guardrail: 'Emit an attribution event on the transaction path, carrying the feature that drove it.',
  },
  {
    key: 'north_star_movement',
    label: 'North-Star movement over time',
    reason:
      'Movement needs at least two recorded values to compare. A single reading is a level, not a trend, ' +
      'and drawing a line through one point would invent a direction.',
    guardrail: 'Record the North-Star value on a schedule so a trend exists to read.',
  },
]

/**
 * Safe ratio: null when the denominator is zero, never 0 — "no data" must not read as "total failure".
 *
 * A NEGATIVE numerator also yields null. Counts of people cannot be negative, so a negative value
 * here means the input is malformed — and `-0.2` would render as a real, plausible-looking rate
 * rather than announcing that something upstream is broken.
 */
export function rate(numerator: number, denominator: number): number | null {
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator)) return null
  if (numerator < 0 || denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 1000
}

/**
 * Shape one feature's funnel into an outcome row.
 *
 * The TARS caveat is attached unconditionally and deliberately. Targeted/Adopted/Retained are
 * REGISTRY-DECLARED — they count events the tenant chose to map to those stages — not
 * gateway-observed truth. Every other surface in this product says so, and a sales artifact is the
 * last place that caveat should quietly disappear.
 */
export function buildOutcomeRow(
  featureKey: string,
  tars: { targeted: number; adopted: number; retained: number } | null
): OutcomeRow {
  if (!tars) {
    return {
      featureKey,
      tars: null,
      adoptionRate: null,
      retentionRate: null,
      provenance: 'lib/tars-query.ts',
      caveat: 'The funnel could not be read for this feature — reported as unavailable, not as zero.',
    }
  }
  return {
    featureKey,
    tars,
    adoptionRate: rate(tars.adopted, tars.targeted),
    retentionRate: rate(tars.retained, tars.adopted),
    provenance: 'lib/tars-query.ts (registry-declared funnel over ingested events)',
    caveat:
      'Targeted, adopted and retained are REGISTRY-DECLARED: they count the events this tenant mapped to ' +
      'each stage, not gateway-observed behaviour.',
  }
}

/**
 * Assemble the outcome section.
 *
 * Pure — the caller does the reading. `northStar.latestValue` stays null when nothing has been
 * recorded, which is not the same fact as a recorded zero and must not render as one.
 */
export function buildOutcomeSection(input: {
  tenant: string
  features: Array<{ key: string; tars: { targeted: number; adopted: number; retained: number } | null }>
  northStar?: {
    metric: string | null
    inputCount: number | null
    latestValue: number | null
    unavailable?: boolean
  } | null
  /** Set by the caller when a read FAILED. Defaults false — an absent flag means "we looked". */
  unavailable?: boolean
}): OutcomeSection {
  const rows = input.features.map((f) => buildOutcomeRow(f.key, f.tars))

  let northStar: OutcomeSection['northStar'] = null
  if (input.northStar) {
    northStar = {
      ...input.northStar,
      // An unreadable metric gets the failure sentence, never the reassuring one. Cross-review
      // round 2 (Agy): the sibling of the `unavailable` fix one round earlier — when you harden one
      // instance of a bug class, its siblings are what the NEXT round finds (Roadmap/LEARNINGS.md).
      caveat: input.northStar.unavailable
        ? 'The North-Star metric could not be read — this is a failed query, not an absence of a registered metric.'
        : input.northStar.latestValue === null
          ? 'A metric and its inputs are registered, but no value has been recorded yet — this is a defined metric with no reading, not a reading of zero.'
          : undefined,
    }
  }

  return {
    tenant: input.tenant,
    unavailable: input.unavailable === true,
    rows,
    northStar,
    notInstrumented: OUTCOME_NOT_INSTRUMENTED,
  }
}
