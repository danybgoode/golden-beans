import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  evaluateFlag,
  explainFlagEvaluation,
  parseFlagDefinition,
  parseFlagSnapshot,
  type FlagDefinition,
  type FlagEvaluationContext,
} from './flags.ts'
import { deterministicFraction } from './bucketing.ts'

const definition: FlagDefinition = {
  valueType: 'boolean',
  description: 'Controls the disposable migration fixture.',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [
    { priority: 20, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'on' },
    {
      priority: 10,
      clauses: [{ field: 'plan', operator: 'one_of', values: ['pro', 'enterprise'] }],
      variantKey: 'on',
    },
  ],
  metadata: { criticality: 'low' },
}

test('definition parser rejects an unknown targeting field, duplicate priority, and mismatched value', () => {
  const checked = parseFlagDefinition({
    ...definition,
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: 'not_boolean' },
    ],
    rules: [
      {
        priority: 1,
        clauses: [{ field: 'requestHeader', operator: 'equals', value: 'x' }],
        variantKey: 'on',
      },
      { priority: 1, clauses: [], variantKey: 'off' },
    ],
  })
  assert.equal(checked.ok, false)
  if (!checked.ok) {
    assert.ok(checked.errors.some((error) => error.includes('allow-listed')))
    assert.ok(checked.errors.some((error) => error.includes('duplicates 1')))
    assert.ok(checked.errors.some((error) => error.includes('does not match')))
  }
})

test('rules use ascending unique priority, exact and one-of matching, then the declared static default', () => {
  const flag = { key: 'migration.fixture', definitionVersion: 3, definition }
  const first = evaluateFlag({
    flag,
    context: { plan: 'pro', region: 'mx' },
    defaultValue: false,
    expectedType: 'boolean',
  })
  assert.equal(first.value, true)
  assert.equal(first.variant, 'on')
  assert.equal(first.reason, 'TARGETING_MATCH')

  const staticValue = evaluateFlag({
    flag,
    context: { plan: 'free', region: 'us' },
    defaultValue: true,
    expectedType: 'boolean',
  })
  assert.equal(staticValue.value, false)
  assert.equal(staticValue.variant, 'off')
  assert.equal(staticValue.reason, 'STATIC')
})

test('rollout is deterministic, requires targetingKey, and has a closed 0-10000 basis-point domain', () => {
  const rollout: FlagDefinition = {
    ...definition,
    rules: [{ priority: 1, clauses: [], rollout: { basisPoints: 10_000 }, variantKey: 'on' }],
  }
  const flag = { key: 'migration.fixture', definitionVersion: 7, definition: rollout }
  const first = evaluateFlag({
    flag,
    context: { targetingKey: 'subject-1' },
    defaultValue: false,
    expectedType: 'boolean',
  })
  const again = evaluateFlag({
    flag,
    context: { targetingKey: 'subject-1' },
    defaultValue: false,
    expectedType: 'boolean',
  })
  assert.deepEqual(again, first)
  assert.equal(first.value, true)
  assert.equal(evaluateFlag({ flag, context: {}, defaultValue: false, expectedType: 'boolean' }).value, false)
  assert.equal(
    parseFlagDefinition({
      ...rollout,
      rules: [{ priority: 1, clauses: [], rollout: { basisPoints: 10_001 }, variantKey: 'on' }],
    }).ok,
    false
  )
})

test('flag rollout uses the same deterministic FNV fraction as local experiment bucketing', () => {
  const rollout: FlagDefinition = {
    ...definition,
    rules: [{ priority: 1, clauses: [], rollout: { basisPoints: 5_000 }, variantKey: 'on' }],
  }
  const tuple = JSON.stringify(['subject-parity', 'migration.fixture', 9, 1])
  const expected = deterministicFraction(tuple) < 0.5
  const resolved = evaluateFlag({
    flag: { key: 'migration.fixture', definitionVersion: 9, definition: rollout },
    context: { targetingKey: 'subject-parity' },
    defaultValue: false,
    expectedType: 'boolean',
  })
  assert.equal(resolved.value, expected)
})

test('missing flag, type mismatch, invalid context, and malformed snapshots return a declared safe default without throwing', () => {
  assert.equal(
    evaluateFlag({ flag: undefined, defaultValue: false, expectedType: 'boolean' }).reason,
    'DEFAULT'
  )
  assert.equal(
    evaluateFlag({
      flag: { key: 'migration.fixture', definitionVersion: 1, definition },
      defaultValue: 'safe',
      expectedType: 'string',
    }).value,
    'safe'
  )
  assert.equal(
    evaluateFlag({
      flag: { key: 'migration.fixture', definitionVersion: 1, definition },
      context: { unknown: 'x' } as never,
      defaultValue: false,
      expectedType: 'boolean',
    }).value,
    false
  )
  assert.equal(
    parseFlagSnapshot({
      contractVersion: 1,
      environment: 'production',
      snapshotVersion: 1,
      flags: [
        { key: 'migration.fixture', definitionVersion: 1, definition },
        { key: 'migration.fixture', definitionVersion: 2, definition },
      ],
    }).ok,
    false
  )
})

// ── flags-visual-rule-builder · Sprint 3 (A3) — the parity pin ────────────────────────────────
//
// D4's whole claim is that "preview as a user" answers with the SDK's evaluator rather than with a
// second implementation. This is where that stops being a promise. `explainFlagEvaluation` and
// `evaluateFlag` are asked the same question over the same fixtures and their answers are compared
// directly — following this file's existing precedent, the FNV fraction pinned against bucketing.ts.
//
// It is also the mutation check sprint-3.md names: point the preview at a locally written comparison
// instead of the SDK and this goes red. It goes red for a second reason too — `matchesRule` is now
// defined as `clausesMatch && rolloutAdmits`, so a change to either predicate that does not change
// the other moves exactly one of the two answers.

const explainable: FlagDefinition = {
  valueType: 'boolean',
  description: 'Every rule shape that behaves differently under a preview context.',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
    { key: 'holdback', value: false },
  ],
  rules: [
    // Deliberately out of priority order in the array: both functions must sort, not read.
    {
      priority: 30,
      clauses: [{ field: 'region', operator: 'one_of', values: ['mx', 'us'] }],
      variantKey: 'holdback',
    },
    {
      priority: 10,
      clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
      rollout: { basisPoints: 1000 },
      variantKey: 'on',
    },
    { priority: 20, clauses: [{ field: 'plan', operator: 'equals', value: 'free' }], variantKey: 'off' },
  ],
}

const contexts: FlagEvaluationContext[] = [
  {},
  { plan: 'pro' },
  { plan: 'free' },
  { region: 'mx' },
  { plan: 'pro', region: 'mx' },
  { plan: 'enterprise', region: 'us' },
  { targetingKey: 'subject-1' },
  { targetingKey: 'subject-1', plan: 'pro' },
  { targetingKey: 'subject-2', plan: 'pro' },
  { targetingKey: 'subject-3', plan: 'pro' },
  { targetingKey: 'subject-9', plan: 'pro', region: 'mx' },
  { targetingKey: '', plan: 'pro' },
  { plan: 5 as never },
]

test('THE PARITY PIN — explainFlagEvaluation names the variant evaluateFlag serves', () => {
  assert.equal(parseFlagDefinition(explainable).ok, true)
  const flag = { key: 'preview.fixture', definitionVersion: 4, definition: explainable }

  for (const context of contexts) {
    const served = evaluateFlag({ flag, context, defaultValue: false, expectedType: 'boolean' })
    const explained = explainFlagEvaluation({ flag, context })
    assert.equal(
      explained.variantKey,
      served.variant,
      `the explanation disagrees with the evaluator for ${JSON.stringify(context)}`
    )
    assert.equal(explained.reason, served.reason, `reason disagrees for ${JSON.stringify(context)}`)
  }
})

test('a matched rule is named by its priority, with the clauses that matched', () => {
  const explained = explainFlagEvaluation({
    flag: { key: 'preview.fixture', definitionVersion: 4, definition: explainable },
    context: { plan: 'free' },
  })

  assert.equal(explained.variantKey, 'off')
  assert.equal(explained.reason, 'TARGETING_MATCH')
  assert.equal(explained.matched?.priority, 20)
  assert.deepEqual(explained.matched?.clauses, [{ field: 'plan', operator: 'equals', value: 'free' }])
})

test('no rule matched is STATIC and names the default variant — never the word DEFAULT (A5)', () => {
  // The epic README's A5 copy trap. 'DEFAULT' is reserved for the error fallbacks; a context that
  // simply matched nothing gets STATIC, and the sentence must name the default VARIANT instead.
  const explained = explainFlagEvaluation({
    flag: { key: 'preview.fixture', definitionVersion: 4, definition: explainable },
    context: { plan: 'enterprise' },
  })

  assert.equal(explained.reason, 'STATIC')
  assert.equal(explained.matched, null)
  assert.equal(explained.defaultVariantKey, 'off')
  assert.equal(explained.variantKey, 'off')
  assert.ok(explained.rules.every((rule) => rule.outcome === 'clause_failed'))
})

test('a rollout that excludes the context is its OWN outcome, not "no rule matched"', () => {
  // sprint-3.md calls this the single most confusing outcome and the one a PM is most likely to
  // report as a bug. The two used to be one `false` inside the private matcher.
  const flag = { key: 'preview.fixture', definitionVersion: 4, definition: explainable }
  const excluded = contexts
    .filter((context) => context.plan === 'pro' && typeof context.targetingKey === 'string')
    .map((context) => explainFlagEvaluation({ flag, context }))
    .find((explained) => explained.rules.some((rule) => rule.outcome === 'rollout_excluded'))

  assert.ok(excluded, 'no fixture context was excluded by the 10% rollout — pick another subject')
  const rule = excluded.rules.find((entry) => entry.priority === 10)
  assert.equal(rule?.outcome, 'rollout_excluded')
  assert.equal(rule?.rolloutBasisPoints, 1000)
  // Its clauses DID match. That is precisely the fact the old boolean threw away.
  assert.equal(rule?.failedClause, undefined)
})

test('a rollout with no targeting key excludes the rule outright, and says which (A5)', () => {
  const explained = explainFlagEvaluation({
    flag: { key: 'preview.fixture', definitionVersion: 4, definition: explainable },
    context: { plan: 'pro' },
  })

  const rule = explained.rules.find((entry) => entry.priority === 10)
  assert.equal(rule?.outcome, 'rollout_missing_targeting_key')
  assert.equal(explained.variantKey, 'off')
  assert.equal(explained.reason, 'STATIC')
})

test('a failing clause is named, so the reader learns which condition they missed', () => {
  const explained = explainFlagEvaluation({
    flag: { key: 'preview.fixture', definitionVersion: 4, definition: explainable },
    // `enterprise` so nothing matches before rule 30 gets consulted — a rule below a match is
    // reported as `not_reached`, and asking it "which clause failed" would be a question the
    // evaluator never asked.
    context: { plan: 'enterprise', region: 'br' },
  })

  const thirty = explained.rules.find((entry) => entry.priority === 30)
  assert.deepEqual(thirty?.failedClause, {
    field: 'region',
    operator: 'one_of',
    values: ['mx', 'us'],
  })
})

test('rules are reported in evaluation order, and the ones below a match are NOT REACHED', () => {
  const explained = explainFlagEvaluation({
    flag: { key: 'preview.fixture', definitionVersion: 4, definition: explainable },
    context: { plan: 'free', region: 'mx' },
  })

  assert.deepEqual(
    explained.rules.map((rule) => [rule.priority, rule.outcome]),
    [
      // Clauses are tested BEFORE the rollout, so rule 10 fails on `plan`, not on the missing
      // targeting key — the explanation reports the first reason the evaluator actually stopped at.
      [10, 'clause_failed'],
      [20, 'matched'],
      [30, 'not_reached'],
    ]
  )
  // Rule 30 would have matched `region: 'mx'`. Saying "not reached" rather than "did not match" is
  // the difference between teaching a PM about priority and lying to them about their conditions.
  assert.equal(explained.variantKey, 'off')
})

test('a refused flag or definition explains nothing rather than guessing', () => {
  assert.equal(explainFlagEvaluation({ flag: undefined }).errorCode, 'FLAG_NOT_FOUND')
  assert.equal(explainFlagEvaluation({ flag: undefined }).variantKey, null)

  const broken = { ...explainable, defaultVariantKey: 'nope' } as FlagDefinition
  const refused = explainFlagEvaluation({
    flag: { key: 'preview.fixture', definitionVersion: 4, definition: broken },
  })
  assert.equal(refused.errorCode, 'INVALID_DEFINITION')
  assert.deepEqual(refused.rules, [])

  const badContext = explainFlagEvaluation({
    flag: { key: 'preview.fixture', definitionVersion: 4, definition: explainable },
    context: { nonsense: 'x' } as never,
  })
  assert.equal(badContext.errorCode, 'INVALID_CONTEXT')
  assert.equal(badContext.variantKey, null)
  // The default variant is still named: a rejected context is the caller's problem, and the reader
  // is entitled to know what the flag would have served.
  assert.equal(badContext.defaultVariantKey, 'off')
})
