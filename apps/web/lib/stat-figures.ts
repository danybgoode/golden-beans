// app-shell-and-agent-rail · Sprint 3, Story 3.1 — turning outcome facts into card contents.
//
// Pure and zero-import so the distinction this epic's acceptance turns on is directly assertable:
// **an unreadable figure must never be representable as a zero.** That failure has shipped from
// this repo before — a query that silently requires a tag the realistic caller has no reason to set
// returns an honest-looking zero, and a zero pages nobody (Roadmap/LEARNINGS.md, four entries).
//
// Keeping it here rather than inside components/product/CommandCenter.tsx is CODE-QUALITY rule 5:
// a rule that only exists inside a server component can only be tested by rendering the page.

/** What a StatCard should show. `value: null` ALWAYS carries the sentence explaining which nothing. */
export type StatFigure = { value: string; caveat?: string } | { value: null; caveat: string }

export type NorthStarFacts = {
  metric: string | null
  unavailable?: boolean
  inputCount: number | null
  latestValue: number | null
  caveat?: string
} | null

/**
 * The North Star card's FOUR states, which is one more than most readers expect:
 *
 *   1. no metric registered      — a truthful absence
 *   2. the read failed           — an incident, and it must not read like (1)
 *   3. registered, never recorded — a defined metric with no reading, which is not a reading of 0
 *   4. a real value              — including a real 0, which IS a reading
 *
 * lib/pod-outcome.ts already writes the sentences for 2 and 3; this maps them onto the card and
 * supplies its own for 1.
 */
export function northStarFigure(northStar: NorthStarFacts): StatFigure {
  if (!northStar) {
    return { value: null, caveat: 'No North Star metric is registered for this project yet.' }
  }
  if (northStar.unavailable) {
    return {
      value: null,
      caveat:
        northStar.caveat ?? 'The North Star metric could not be read — a failed query, not an absent metric.',
    }
  }
  if (northStar.latestValue === null) {
    return {
      value: null,
      caveat:
        northStar.caveat ??
        'A metric is registered but no value has been recorded yet — a defined metric with no reading, not a reading of zero.',
    }
  }
  // A recorded 0 falls through to here on purpose. It is a measurement.
  return {
    value: northStar.latestValue.toLocaleString('en-US'),
    caveat: northStar.metric ?? undefined,
  }
}

const RATE_CAVEATS = {
  adoption: {
    unreadable:
      'Nobody has been targeted for this feature yet, so there is no rate to compute — not a 0% adoption rate.',
    readable:
      'Registry-declared: counts the events this project mapped to each stage, not observed behaviour.',
  },
  retention: {
    unreadable:
      'Nobody has adopted this feature yet, so there is nothing to retain — not a 0% retention rate.',
    readable: 'Registry-declared, over the feature’s configured retention window.',
  },
} as const

/**
 * A funnel rate as a card figure.
 *
 * `lib/pod-outcome.ts`'s `rate()` returns null when the DENOMINATOR is zero — deliberately, because
 * "0 out of 0" is not 0%, it is undefined. This carries that distinction to the screen instead of
 * rounding it away: a project nobody has been targeted for reads as "there is no rate yet", and a
 * project where a thousand people were targeted and none adopted reads as a real, alarming 0%.
 */
export function rateFigure(rate: number | null, kind: keyof typeof RATE_CAVEATS): StatFigure {
  // `!Number.isFinite` alongside the null check, matching design-system/charts/geometry.ts, which
  // guards its arithmetic the same way (cross-review round 3, Agy on PR #73 — I guarded one and not
  // the other; the rule outlived `funnel-geometry.ts`, which Story 5.3 retired).
  // `lib/pod-outcome.ts`'s `rate()` already returns null for a non-finite input, so this is not
  // reachable through today's caller; the point is that a NaN arriving here must not render as
  // "NaN%", which is a number-shaped nothing and therefore the one output this module exists to
  // make impossible.
  if (rate === null || !Number.isFinite(rate)) {
    return { value: null, caveat: RATE_CAVEATS[kind].unreadable }
  }
  return { value: `${Math.round(rate * 100)}%`, caveat: RATE_CAVEATS[kind].readable }
}
