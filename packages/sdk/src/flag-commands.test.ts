// golden-frijoles-cli · D4 — the shared command core, asserted directly.
//
// These are the claims the CLI's `--help` makes and the MCP write tools inherit. They are asserted
// here, against pure functions, rather than through `gf` or through a route, for the reason
// CODE-QUALITY #5 gives: a guard behind auth and network state is a guard the harness reaches by
// accident, and the ones that matter most here — "kill clears the rules", "a percent is rejected
// rather than clamped" — are exactly the ones a happy-path integration test never exercises.
//
// Every plan below is checked for having gone through the real parser, because a planner that
// emitted an unparsed definition would move its failures from the CLI to a 400.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { parseFlagDefinition, type FlagDefinition } from './flags.ts'

// SDK *source* stays extensionless (see index.ts's header); only *.test.ts opts into `.ts`
// specifiers. The hook lets this test reach a module that imports './flags' and './rollout-percent'.
type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown

const registerHooks = (Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void })
  .registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/packages/sdk/src/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const {
  FLAG_POLARITIES,
  OFF_VARIANT_KEY,
  ON_VARIANT_KEY,
  defaultServedValue,
  normalizeEnvironments,
  planFlagCreate,
  planFlagKill,
  planFlagRollout,
  planFlagRules,
  planFlagSet,
  planTypedFlagCreate,
} = await import('./flag-commands.ts')

const ALL = ['development', 'preview', 'production'] as const

function unwrap(result: ReturnType<typeof planFlagCreate>) {
  assert.equal(result.ok, true, result.ok ? '' : `expected a plan, got: ${result.errors.join('; ')}`)
  assert.equal(result.ok && true, true)
  if (!result.ok) throw new Error('unreachable')
  return result.plan
}

// ── D3: polarity decides the default AND the activation ───────────────────────────────────────

test('a kill-switch is born serving true in every environment it names', () => {
  const plan = unwrap(
    planFlagCreate({
      key: 'checkout.demo_enabled',
      polarity: 'kill-switch',
      description: 'Checkout demo.',
      environments: ALL,
    })
  )
  assert.equal(plan.definition.defaultVariantKey, ON_VARIANT_KEY)
  assert.equal(defaultServedValue(plan.definition), true)
  assert.deepEqual(plan.environments, [...ALL])
})

test('an enablement flag is born serving false — and is ACTIVATED, not left absent', () => {
  const plan = unwrap(
    planFlagCreate({
      key: 'checkout.new_flow',
      polarity: 'enablement',
      description: 'New checkout flow.',
      environments: ALL,
    })
  )
  assert.equal(plan.definition.defaultVariantKey, OFF_VARIANT_KEY)
  assert.equal(defaultServedValue(plan.definition), false)
  // The whole of D3's correction. A definition with no activation is ABSENT from the snapshot, so
  // the consumer falls back to its own literal and the flag is invisible in the provider — the
  // exact failure this epic exists to end. "Created disabled" means serving false.
  assert.deepEqual(plan.environments, [...ALL])
})

test('both polarities produce the same two variants, so kill can find `off` later', () => {
  for (const polarity of FLAG_POLARITIES) {
    const plan = unwrap(
      planFlagCreate({ key: 'a.b', polarity, description: 'x', environments: ['production'] })
    )
    assert.deepEqual(
      plan.definition.variants.map((variant) => variant.key).sort(),
      [OFF_VARIANT_KEY, ON_VARIANT_KEY].sort()
    )
  }
})

test('a create plan round-trips through the real parser', () => {
  const plan = unwrap(
    planFlagCreate({ key: 'a.b', polarity: 'kill-switch', description: 'x', environments: ALL })
  )
  assert.equal(parseFlagDefinition(plan.definition).ok, true)
})

test('an invalid flag key fails in the planner, before any network call', () => {
  const result = planFlagCreate({
    key: 'Not A Key',
    polarity: 'kill-switch',
    description: 'x',
    environments: ALL,
  })
  assert.equal(result.ok, false)
})

test('naming no environment is a usage error, not an empty success', () => {
  const result = planFlagCreate({
    key: 'a.b',
    polarity: 'kill-switch',
    description: 'x',
    environments: [],
  })
  assert.equal(result.ok, false)
})

// ── D2: the environment list is canonical and de-duplicated ───────────────────────────────────

test('environments come back in canonical order however they were named', () => {
  assert.deepEqual(normalizeEnvironments(['production', 'development']), ['development', 'production'])
})

test('a repeated environment is collapsed — a second write would trip the first one’s revision', () => {
  assert.deepEqual(normalizeEnvironments(['production', 'production']), ['production'])
})

// ── The verbs that change an existing flag ────────────────────────────────────────────────────

function boolFlag(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
  return {
    valueType: 'boolean',
    description: 'Checkout demo.',
    defaultVariantKey: ON_VARIANT_KEY,
    variants: [
      { key: OFF_VARIANT_KEY, value: false },
      { key: ON_VARIANT_KEY, value: true },
    ],
    rules: [],
    ...overrides,
  }
}

test('set changes the default variant and carries the rules across untouched', () => {
  const current = boolFlag({
    rules: [
      { priority: 5, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    ],
  })
  const plan = unwrap(planFlagSet({ current, variantKey: OFF_VARIANT_KEY, environments: ['production'] }))
  assert.equal(plan.definition.defaultVariantKey, OFF_VARIANT_KEY)
  assert.deepEqual(plan.definition.rules, current.rules)
})

test('set refuses a variant the flag does not have, and names the ones it does', () => {
  const result = planFlagSet({ current: boolFlag(), variantKey: 'maybe', environments: ['production'] })
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('unreachable')
  assert.match(result.errors[0], /on/)
})

test('rollout stores basis points, through the one conversion seam', () => {
  const plan = unwrap(planFlagRollout({ current: boolFlag(), percent: 25, environments: ['production'] }))
  assert.deepEqual(plan.definition.rules, [
    { priority: 1, clauses: [], rollout: { basisPoints: 2500 }, variantKey: ON_VARIANT_KEY },
  ])
})

test('0% and 100% are exactly expressible', () => {
  for (const [percent, basisPoints] of [
    [0, 0],
    [100, 10_000],
  ] as const) {
    const plan = unwrap(planFlagRollout({ current: boolFlag(), percent, environments: ['production'] }))
    assert.equal(plan.definition.rules[0].rollout?.basisPoints, basisPoints)
  }
})

test('an out-of-range percent is REJECTED, never clamped', () => {
  for (const percent of [150, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    const result = planFlagRollout({ current: boolFlag(), percent, environments: ['production'] })
    assert.equal(result.ok, false, `${percent} should not plan`)
  }
})

test('rules replaces the list and enforces the SDK’s cap, not a literal', async () => {
  const { MAX_FLAG_RULES } = await import('./flags.ts')
  const tooMany = Array.from({ length: MAX_FLAG_RULES + 1 }, (_unused, index) => ({
    priority: index + 1,
    clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }] as const,
    variantKey: ON_VARIANT_KEY,
  }))
  const result = planFlagRules({
    current: boolFlag(),
    rules: tooMany as never,
    environments: ['production'],
  })
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('unreachable')
  assert.match(result.errors[0], new RegExp(String(MAX_FLAG_RULES)))
})

// ── kill: the verb whose whole value is what it ALSO does ─────────────────────────────────────

test('kill flips the default to the false variant AND CLEARS EVERY RULE', () => {
  const current = boolFlag({
    rules: [{ priority: 1, clauses: [], rollout: { basisPoints: 1000 }, variantKey: ON_VARIANT_KEY }],
  })
  const plan = unwrap(planFlagKill({ current, environments: ['production'] }))
  assert.equal(defaultServedValue(plan.definition), false)
  // Without this line a killed flag still serves `true` to one caller in ten — the state an
  // operator is killing the flag to escape, with the flags page reading "off" the whole time.
  assert.deepEqual(plan.definition.rules, [])
})

test('kill refuses a non-boolean flag rather than guessing an off', () => {
  const result = planFlagKill({
    current: {
      valueType: 'string',
      description: 'Theme.',
      defaultVariantKey: 'dark',
      variants: [
        { key: 'dark', value: 'dark' },
        { key: 'light', value: 'light' },
      ],
      rules: [],
    },
    environments: ['production'],
  })
  assert.equal(result.ok, false)
  if (result.ok) throw new Error('unreachable')
  assert.match(result.errors[0], /boolean/)
})

test('kill refuses a boolean flag that has no false variant, rather than inventing one', () => {
  const result = planFlagKill({
    current: {
      valueType: 'boolean',
      description: 'Always on.',
      defaultVariantKey: 'on',
      variants: [{ key: 'on', value: true }],
      rules: [],
    },
    environments: ['production'],
  })
  assert.equal(result.ok, false)
})

// ── typed create ──────────────────────────────────────────────────────────────────────────────

test('a typed create refuses a default that is not one of its variants', () => {
  const result = planTypedFlagCreate({
    key: 'ui.theme',
    valueType: 'string',
    description: 'Theme.',
    variants: [{ key: 'dark', value: 'dark' }],
    defaultVariantKey: 'light',
    environments: ['production'],
  })
  assert.equal(result.ok, false)
})

test('a typed create plans a parseable definition', () => {
  const plan = unwrap(
    planTypedFlagCreate({
      key: 'ui.theme',
      valueType: 'string',
      description: 'Theme.',
      variants: [
        { key: 'dark', value: 'dark' },
        { key: 'light', value: 'light' },
      ],
      defaultVariantKey: 'dark',
      environments: ALL,
    })
  )
  assert.equal(parseFlagDefinition(plan.definition).ok, true)
  assert.equal(defaultServedValue(plan.definition), 'dark')
})

test('defaultServedValue returns undefined for a corrupt row rather than a plausible value', () => {
  assert.equal(
    defaultServedValue({
      valueType: 'boolean',
      description: 'x',
      defaultVariantKey: 'missing',
      variants: [{ key: 'on', value: true }],
      rules: [],
    }),
    undefined
  )
})
