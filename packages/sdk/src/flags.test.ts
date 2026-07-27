import { test } from 'node:test'
import assert from 'node:assert/strict'
import { evaluateFlag, parseFlagDefinition, parseFlagSnapshot, type FlagDefinition } from './flags.ts'
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
