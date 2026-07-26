// signals-loop · Story 1.0 — pinning "rules as data" and the false-positive guards.
//
// The module's own comment names the risk: a noisy detector destroys trust in the whole task
// queue. The two guards that keep it quiet are `minSample` (one targeted user who didn't adopt
// must never read as a 0% screaming red signal) and the strict "< threshold" test (an observed
// value exactly AT the threshold is not yet friction). This file also pins the "rules as data"
// acceptance criterion literally — the same funnel data evaluated against two rule sets that
// differ ONLY in `threshold` must produce different output, with no redeploy involved — and the
// dead_end / abandoned_adoption split, which exists so one feature can't produce two findings that
// say the same thing.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateRule,
  evaluateFriction,
  DEFAULT_FRICTION_RULES,
  type FrictionRule,
  type FunnelCounts,
} from './friction-rules.ts'

function rule(overrides: Partial<FrictionRule>): FrictionRule {
  return {
    key: 'test_rule',
    kind: 'adoption_drop_off',
    threshold: 0.2,
    minSample: 25,
    enabled: true,
    ...overrides,
  }
}

function funnel(overrides: Partial<FunnelCounts>): FunnelCounts {
  return {
    featureKey: 'test_feature',
    targeted: 0,
    adopted: 0,
    retained: 0,
    ...overrides,
  }
}

// ── adoption_drop_off ──────────────────────────────────────────────────────────────────────────

test('adoption_drop_off fires when adopted/targeted is below threshold and sample meets minSample', () => {
  const r = rule({ kind: 'adoption_drop_off', threshold: 0.2, minSample: 25 })
  const f = funnel({ targeted: 100, adopted: 10 }) // 10% < 20%
  const finding = evaluateRule(r, f)
  assert.ok(finding)
  assert.equal(finding!.kind, 'adoption_drop_off')
  assert.equal(finding!.observed, 0.1)
  assert.equal(finding!.sample, 100)
})

test('adoption_drop_off does NOT fire when targeted is below minSample, even at 0% adoption', () => {
  const r = rule({ kind: 'adoption_drop_off', threshold: 0.2, minSample: 25 })
  // One targeted user who didn't adopt: 0/1 = 0%, well below threshold, but sample is tiny.
  const f = funnel({ targeted: 1, adopted: 0 })
  assert.equal(evaluateRule(r, f), null)
})

test('adoption_drop_off: observed exactly EQUAL to threshold does not fire (strict below)', () => {
  const r = rule({ kind: 'adoption_drop_off', threshold: 0.2, minSample: 25 })
  const f = funnel({ targeted: 100, adopted: 20 }) // exactly 20%
  assert.equal(evaluateRule(r, f), null)
})

// ── dead_end ────────────────────────────────────────────────────────────────────────────────────

test('dead_end fires only on exactly zero retained, with adopted meeting minSample', () => {
  const r = rule({ kind: 'dead_end', threshold: 0, minSample: 10 })
  const f = funnel({ adopted: 10, retained: 0 })
  const finding = evaluateRule(r, f)
  assert.ok(finding)
  assert.equal(finding!.kind, 'dead_end')
  assert.equal(finding!.observed, 0)
})

test('dead_end does NOT fire when retained is even 1 (not exactly zero)', () => {
  const r = rule({ kind: 'dead_end', threshold: 0, minSample: 10 })
  const f = funnel({ adopted: 10, retained: 1 })
  assert.equal(evaluateRule(r, f), null)
})

test('dead_end does NOT fire when adopted is below minSample, even with zero retained', () => {
  const r = rule({ kind: 'dead_end', threshold: 0, minSample: 10 })
  const f = funnel({ adopted: 1, retained: 0 })
  assert.equal(evaluateRule(r, f), null)
})

// ── abandoned_adoption ──────────────────────────────────────────────────────────────────────────

test('abandoned_adoption fires when retained/adopted is below threshold and adopted meets minSample', () => {
  const r = rule({ kind: 'abandoned_adoption', threshold: 0.15, minSample: 10 })
  const f = funnel({ adopted: 20, retained: 1 }) // 5% < 15%
  const finding = evaluateRule(r, f)
  assert.ok(finding)
  assert.equal(finding!.kind, 'abandoned_adoption')
  assert.equal(finding!.observed, 0.05)
})

test('abandoned_adoption does NOT fire when adopted is below minSample', () => {
  const r = rule({ kind: 'abandoned_adoption', threshold: 0.15, minSample: 10 })
  const f = funnel({ adopted: 5, retained: 0 })
  assert.equal(evaluateRule(r, f), null)
})

test('abandoned_adoption: observed exactly EQUAL to threshold does not fire (strict below)', () => {
  const r = rule({ kind: 'abandoned_adoption', threshold: 0.15, minSample: 20 })
  const f = funnel({ adopted: 20, retained: 3 }) // exactly 15%
  assert.equal(evaluateRule(r, f), null)
})

test('dead_end and abandoned_adoption never both fire for the same funnel: zero retained is dead_end ONLY', () => {
  const deadEnd = rule({ kind: 'dead_end', threshold: 0, minSample: 10 })
  const abandoned = rule({ kind: 'abandoned_adoption', threshold: 0.15, minSample: 10 })
  const f = funnel({ adopted: 20, retained: 0 })
  assert.ok(evaluateRule(deadEnd, f)) // dead_end fires
  assert.equal(evaluateRule(abandoned, f), null) // abandoned_adoption explicitly does not
})

// ── enabled flag ────────────────────────────────────────────────────────────────────────────────

test('a disabled rule never fires, regardless of how bad the funnel looks', () => {
  const r = rule({ kind: 'dead_end', threshold: 0, minSample: 10, enabled: false })
  const f = funnel({ adopted: 1000, retained: 0 })
  assert.equal(evaluateRule(r, f), null)
})

// ── rules as data ──────────────────────────────────────────────────────────────────────────────

test('rules as data: the same funnel evaluated against two rule sets differing ONLY in threshold produces different output', () => {
  const funnels = [funnel({ featureKey: 'reports', targeted: 100, adopted: 18 })] // 18%
  const looseRules: FrictionRule[] = [rule({ kind: 'adoption_drop_off', threshold: 0.1, minSample: 25 })]
  const strictRules: FrictionRule[] = [rule({ kind: 'adoption_drop_off', threshold: 0.3, minSample: 25 })]

  const looseFindings = evaluateFriction(looseRules, funnels)
  const strictFindings = evaluateFriction(strictRules, funnels)

  assert.equal(looseFindings.length, 0) // 18% >= 10% threshold: no friction
  assert.equal(strictFindings.length, 1) // 18% < 30% threshold: friction
  assert.notDeepEqual(looseFindings, strictFindings)
})

// ── stable output order ────────────────────────────────────────────────────────────────────────

test('evaluateFriction output order is stable: funnel order, then rule order', () => {
  const rules: FrictionRule[] = [
    rule({ key: 'rule_a', kind: 'adoption_drop_off', threshold: 1, minSample: 0 }),
    rule({ key: 'rule_b', kind: 'abandoned_adoption', threshold: 1, minSample: 0 }),
    rule({ key: 'rule_c', kind: 'dead_end', threshold: 0, minSample: 0 }),
  ]
  // dead_end (rule_c) and abandoned_adoption (rule_b) are mutually exclusive on `retained` by
  // design, so no single funnel fires both — feature_one (retained: 0) fires rule_a + rule_c,
  // feature_two (retained: 1) fires rule_a + rule_b. That still exercises all 3 rules against
  // both funnels and lets us pin the exact (funnel-order, then rule-order) output sequence.
  const funnels: FunnelCounts[] = [
    funnel({ featureKey: 'feature_one', targeted: 10, adopted: 5, retained: 0 }),
    funnel({ featureKey: 'feature_two', targeted: 10, adopted: 5, retained: 1 }),
  ]
  const findings = evaluateFriction(rules, funnels)
  assert.deepEqual(
    findings.map((f) => [f.featureKey, f.ruleKey]),
    [
      ['feature_one', 'rule_a'],
      ['feature_one', 'rule_c'],
      ['feature_two', 'rule_a'],
      ['feature_two', 'rule_b'],
    ],
  )
})

// ── DEFAULT_FRICTION_RULES shape ──────────────────────────────────────────────────────────────

test('DEFAULT_FRICTION_RULES is frozen (top level and each entry)', () => {
  assert.ok(Object.isFrozen(DEFAULT_FRICTION_RULES))
  for (const r of DEFAULT_FRICTION_RULES) {
    assert.ok(Object.isFrozen(r))
  }
})

test('DEFAULT_FRICTION_RULES: every threshold is in [0,1] and every minSample is >= 1', () => {
  assert.ok(DEFAULT_FRICTION_RULES.length > 0)
  for (const r of DEFAULT_FRICTION_RULES) {
    assert.ok(r.threshold >= 0 && r.threshold <= 1, `${r.key} threshold ${r.threshold} out of [0,1]`)
    assert.ok(r.minSample >= 1, `${r.key} minSample ${r.minSample} is below 1`)
  }
})
