// signals-loop · Story 1.0 — friction detectors, declared as DATA.
//
// The point of "rules as data" is that a threshold is tuned by an UPDATE, never by a deploy — the
// same principle as `projects.monthly_event_quota` (AGENTS.md: "tenancy limits are DATA, not env").
// A noisy detector destroys trust in the whole task queue, and a fix that needs a release is a fix
// nobody makes on the day it's noticed.
//
// This module holds the pure evaluation and the conservative DEFAULTS. Per-project overrides live
// in the `friction_rules` table; a project with no rows evaluates against these, so friction works
// out of the box and tuning is opt-in.
//
// Zero imports: the whole point of the acceptance criterion "changing a threshold changes the
// output, deterministically" is that it is checkable without a database.

export type FrictionKind = 'adoption_drop_off' | 'dead_end' | 'abandoned_adoption'

export type FrictionRule = {
  /** Stable key — also the rule half of the signal's fingerprint, so renaming one splits its history. */
  key: string
  kind: FrictionKind
  /** A ratio in [0,1]. Below it (strictly) is friction. Unused by `dead_end`, which tests for zero. */
  threshold: number
  /** The smallest denominator worth an opinion. THE most important field in this module: without
   *  it, one targeted user who didn't adopt is a 0% adoption rate and a screaming red signal. */
  minSample: number
  enabled: boolean
}

/**
 * Deliberately conservative. The scope doc's stated risk is false positives, and the stated
 * mitigation is "tuned on gb's own dogfood before any client sees them" — so these start quiet.
 */
export const DEFAULT_FRICTION_RULES: readonly FrictionRule[] = Object.freeze([
  Object.freeze({
    key: 'adoption_drop_off',
    kind: 'adoption_drop_off' as const,
    // Fewer than 1 in 5 targeted users ever adopting is a funnel problem, not a preference.
    threshold: 0.2,
    minSample: 25,
    enabled: true,
  }),
  Object.freeze({
    key: 'dead_end',
    kind: 'dead_end' as const,
    // Not a ratio — this rule fires only on exactly zero retained. Recorded as 0 so the row shape
    // is uniform and a UI can render every rule the same way.
    threshold: 0,
    minSample: 10,
    enabled: true,
  }),
  Object.freeze({
    key: 'abandoned_adoption',
    kind: 'abandoned_adoption' as const,
    threshold: 0.15,
    minSample: 10,
    enabled: true,
  }),
])

/** The funnel shape this evaluates over — exactly what lib/tars-query.ts already returns. Nothing
 *  new is measured; friction is a reading of numbers the engine has had since v1. */
export type FunnelCounts = {
  featureKey: string
  targeted: number
  adopted: number
  retained: number
}

export type FrictionFinding = {
  ruleKey: string
  kind: FrictionKind
  featureKey: string
  /** The observed ratio that tripped the rule, rounded — 0 for `dead_end`. */
  observed: number
  threshold: number
  /** The denominator, so a reader can judge the finding without re-querying. */
  sample: number
  /** A stable, human-readable statement of the finding. Feeds both the title and the fingerprint,
   *  so it must NOT contain anything that varies between evaluations of the same situation. */
  description: string
}

function ratio(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0
  return Math.round((numerator / denominator) * 10_000) / 10_000
}

/**
 * Evaluates one feature's funnel against one rule.
 *
 * Returns `null` — not a finding with a false flag — when the rule does not fire. A "finding" that
 * exists but says "nothing wrong" is how a queue fills with rows nobody wants, and how a `WHERE`
 * clause somewhere later forgets to exclude them.
 */
export function evaluateRule(rule: FrictionRule, funnel: FunnelCounts): FrictionFinding | null {
  if (!rule.enabled) return null

  if (rule.kind === 'adoption_drop_off') {
    if (funnel.targeted < rule.minSample) return null
    const observed = ratio(funnel.adopted, funnel.targeted)
    if (observed >= rule.threshold) return null
    return {
      ruleKey: rule.key,
      kind: rule.kind,
      featureKey: funnel.featureKey,
      observed,
      threshold: rule.threshold,
      sample: funnel.targeted,
      description: `Only ${pct(observed)} of targeted users adopted ${funnel.featureKey}`,
    }
  }

  if (rule.kind === 'dead_end') {
    // Fires only on EXACTLY zero retained out of a meaningful number of adopters. "Some retention,
    // but low" is `abandoned_adoption`'s job; keeping the two distinct is what stops one feature
    // producing two signals that say the same thing.
    if (funnel.adopted < rule.minSample) return null
    if (funnel.retained > 0) return null
    return {
      ruleKey: rule.key,
      kind: rule.kind,
      featureKey: funnel.featureKey,
      observed: 0,
      threshold: rule.threshold,
      sample: funnel.adopted,
      description: `No user who adopted ${funnel.featureKey} ever came back`,
    }
  }

  // abandoned_adoption — adopted, but retention below the floor. Guarded against overlapping with
  // dead_end: zero retained is dead_end's finding, not this one.
  if (funnel.adopted < rule.minSample) return null
  if (funnel.retained === 0) return null
  const observed = ratio(funnel.retained, funnel.adopted)
  if (observed >= rule.threshold) return null
  return {
    ruleKey: rule.key,
    kind: rule.kind,
    featureKey: funnel.featureKey,
    observed,
    threshold: rule.threshold,
    sample: funnel.adopted,
    description: `Only ${pct(observed)} of ${funnel.featureKey} adopters were retained`,
  }
}

function pct(value: number): string {
  return `${Math.round(value * 100)}%`
}

/**
 * Evaluates every rule against every funnel.
 *
 * Output order is stable (funnel order, then rule order) because callers persist findings and a
 * shifting order would make two identical evaluations produce different-looking results — the
 * "deterministic on rerun" acceptance criterion, at the seam where it is easiest to lose.
 */
export function evaluateFriction(
  rules: readonly FrictionRule[],
  funnels: readonly FunnelCounts[],
): FrictionFinding[] {
  const findings: FrictionFinding[] = []
  for (const funnel of funnels) {
    for (const rule of rules) {
      const finding = evaluateRule(rule, funnel)
      if (finding) findings.push(finding)
    }
  }
  return findings
}
