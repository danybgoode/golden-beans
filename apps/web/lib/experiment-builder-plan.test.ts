// experiments-for-humans · Story 2.2 — the planner, held to the numbers and words it owes.
//
// The catalog fixture is the approved prototype's own example data (`EVENTS`, `FIELDS`, `ENTITIES`
// in design-system/approved-prototype.html), reshaped into the event-catalog read's output, so the
// "Copy or button" example the product owner approved is the first thing pinned.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { evaluateFlag, parseFlagDefinition, type FlagDefinition } from '@golden-frijoles/sdk'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown
;(Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/apps/web/lib/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const {
  EXPERIMENT_RULE_PRIORITIES,
  buildExperimentPlan,
  planExperimentRollout,
  resolveTemplateDefaults,
  sampleSizePerVersion,
  sentenceText,
  stackedBasisPoints,
  stripExperiment,
} = await import('./experiment-builder-plan.ts')
const { parseExperimentDefinition } = await import('./experiment-definition.ts')
type Catalog = import('./event-catalog.ts').EventCatalog
type Answers = import('./experiment-builder-plan.ts').ExperimentBuilderAnswers

// ── the prototype's example tenant, as a catalog ─────────────────────────────────────────────
const PROTOTYPE_EVENTS: Array<[string, number, number, number]> = [
  // event, 14-day count, baseline % among merchants, 24-hour count
  ['application.completed', 1318, 26.8, 96],
  ['application.started', 4912, 62.8, 341],
  ['application.abandoned', 2106, 42.9, 151],
  ['listing.published', 5622, 31.4, 402],
  ['onboarding.abandoned', 1240, 24.6, 88],
  ['subscription.started', 412, 4.1, 29],
  ['checkout.completed', 9840, 9.4, 702],
  ['signup.completed', 3480, 12.2, 251],
  ['refund.requested', 188, 1.9, 13],
  ['support.ticket_opened', 640, 6.3, 47],
  ['error.shown', 402, 2.4, 31],
  ['page.slow', 1020, 3.2, 74],
  ['referral.sent', 96, 0.8, 0],
]

function prototypeCatalog(overrides: Partial<Catalog> = {}): Catalog {
  return {
    events: PROTOTYPE_EVENTS.map(([event, count14d, , count24h]) => ({
      event,
      count14d,
      count24h,
      daily: Array(14).fill(Math.round(count14d / 14)),
      reserved: false,
    })),
    entities: [
      { type: 'device', subjects14d: 26105 },
      { type: 'merchant', subjects14d: 3912 },
      { type: 'user', subjects14d: 18440 },
    ],
    baselines: PROTOTYPE_EVENTS.map(([event, , base]) => ({ event, type: 'merchant', baseline: base / 100 })),
    segments: [
      {
        field: 'source',
        coverage: 0.88,
        values: [
          { value: 'organic', share: 0.54 },
          { value: 'ads', share: 0.29 },
          { value: 'referral', share: 0.12 },
          { value: 'partner', share: 0.05 },
        ],
      },
      {
        field: 'channel',
        coverage: 1,
        values: [
          { value: 'web', share: 0.72 },
          { value: 'app', share: 0.21 },
          { value: 'whatsapp', share: 0.07 },
        ],
      },
      {
        field: 'campaign',
        coverage: 0.03,
        values: [
          { value: 'founding_launch', share: 0.7 },
          { value: 'hot_sale_2026', share: 0.3 },
        ],
      },
      {
        field: 'plan',
        coverage: 0.64,
        values: [
          { value: 'free', share: 0.81 },
          { value: 'founding', share: 0.12 },
          { value: 'pro', share: 0.07 },
        ],
      },
      {
        field: 'region',
        coverage: 0.98,
        values: [
          { value: 'MX', share: 0.91 },
          { value: 'US', share: 0.05 },
          { value: 'CO', share: 0.03 },
          { value: 'AR', share: 0.01 },
        ],
      },
    ],
    flagEvaluations: [{ flagKey: 'growth.founding_merchants_enabled', evaluations: 3180 }],
    truncated: false,
    rowCap: 50000,
    windowDays: 14,
    asOf: '2026-09-24T15:00:00.000Z',
    ...overrides,
  }
}

const SERVED: FlagDefinition = {
  valueType: 'boolean',
  description: 'Founding-merchant offer at signup',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [],
  metadata: { source: 'miyagi', criticality: 'low' },
}
const NOW = new Date('2026-09-24T15:00:00.000Z')
const context = (overrides: Record<string, unknown> = {}) => ({
  catalog: prototypeCatalog(),
  served: { flagKey: 'growth.founding_merchants_enabled', definition: SERVED, activeInProduction: true },
  now: NOW,
  nextVersion: 1,
  ...overrides,
})

function copyAnswers(): Answers {
  const resolved = resolveTemplateDefaults('copy', {
    catalog: prototypeCatalog(),
    flagKey: 'growth.founding_merchants_enabled',
    adoptedEvent: 'application.completed',
    served: context().served,
  })
  assert.ok(resolved.answers)
  return resolved.answers
}

// ── the approved example ─────────────────────────────────────────────────────────────────────
test('the Copy template on the prototype catalog: the sentence and the day count are pinned', () => {
  const answers = copyAnswers()
  // D5 resolved the template against the catalog: the feature's adoptedEvent, the top guardrail,
  // the top region (coverage 98%), the channel breakdown (100%), merchants.
  assert.equal(answers.metric, 'application.completed')
  assert.deepEqual(answers.guardrails, ['application.abandoned'])
  assert.deepEqual(answers.who.conditions, [{ field: 'region', values: ['MX'] }])
  assert.deepEqual(answers.breakdowns, ['channel'])
  assert.equal(answers.entity, 'merchant')

  const result = buildExperimentPlan(answers, context())
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors))
  const { plan } = result
  assert.equal(
    sentenceText(plan.sentence),
    "New copy goes to half of merchants in MX. It wins if application completed rises by at least 10%, as long as application abandoned don't rise."
  )
  assert.equal(plan.estimate.needPerVersion, 4371) // 16·p(1−p)/δ², p = 0.268, δ = 0.0268 — the prototype's formula
  // ⚠️ The prototype says "about 13 days". It divides by a hand-typed 780 merchants/day; the
  // catalog can only know merchants SEEN in 14 days (3,912 → 279.4/day). × region 0.98·0.91 ×
  // the smaller arm's 50% = 124.6/day → 36 days. Same formula, honest traffic.
  assert.equal(plan.estimate.days, 36)
  assert.equal(plan.estimate.recommendedWeeks, 6)
  assert.equal(plan.experimentKey, 'founding_merchants_copy_test')
  assert.equal(
    plan.hypothesis,
    'We believe showing New copy to merchants in MX will raise application completed because the funnel drops most at this step.'
  )
})

test('n ≈ 16·p(1−p)/δ²: unknowable inputs are null, never a number', () => {
  assert.equal(sampleSizePerVersion(0.268, 10), 4371)
  assert.equal(sampleSizePerVersion(null, 10), null)
  assert.equal(sampleSizePerVersion(0, 10), null)
  assert.equal(sampleSizePerVersion(1, 10), null)
})

// ── D4 — the flag version and the stacked-rollout property ──────────────────────────────────
function sharesThroughTheRealEvaluator(definition: FlagDefinition, keys: number) {
  const counts = new Map<string, number>()
  const flag = { key: 'growth.founding_merchants_enabled', definitionVersion: 9, definition }
  const experimentRules = new Set(String(definition.metadata?.experiment_rules).split(',').map(Number))
  for (let index = 0; index < keys; index += 1) {
    const details = evaluateFlag({
      flag,
      context: { targetingKey: `merchant-${index}`, region: 'MX' },
      defaultValue: '',
      expectedType: definition.valueType,
    })
    const arm =
      details.rulePriority !== undefined && experimentRules.has(details.rulePriority)
        ? details.variant!
        : '(held out)'
    counts.set(arm, (counts.get(arm) ?? 0) + 1)
  }
  return new Map([...counts].map(([arm, count]) => [arm, count / keys]))
}

test('property: stacked rollouts reproduce the declared weights and allocation within 0.5 pp (100k keys, the real evaluator)', () => {
  for (const [versions, split, allocation] of [
    [['Current', 'New copy'], 50, 100],
    [['Current', 'New copy'], 20, 50],
    [['Current', 'Version B', 'Version C'], 50, 10],
    [['Current', 'Version B', 'Version C', 'Version D'], 50, 100],
    [['Current', 'Version B', 'Version C', 'Version D'], 50, 50],
  ] as const) {
    const answers: Answers = {
      ...copyAnswers(),
      flagKey: null,
      versions: [...versions],
      split,
      who: { mode: 'everyone', conditions: [], allocation },
    }
    const result = buildExperimentPlan(answers, context({ served: null }))
    assert.ok(result.ok, JSON.stringify(!result.ok && result.errors))
    const shares = sharesThroughTheRealEvaluator(result.plan.flagDefinition, 100_000)
    result.plan.flagDefinition.variants.forEach((variant, index) => {
      const expected = (allocation / 100) * (result.plan.weights[index] / 100)
      const got = shares.get(variant.key) ?? 0
      assert.ok(
        Math.abs(got - expected) <= 0.005,
        `${versions.length} versions, a=${allocation}: ${variant.key} ${got} vs ${expected}`
      )
    })
    const heldOut = shares.get('(held out)') ?? 0
    assert.ok(
      Math.abs(heldOut - (1 - allocation / 100)) <= 0.005,
      `held out ${heldOut} vs ${1 - allocation / 100}`
    )
  }
})

test('stacked basis points: each rule admits its share of who is left; everyone-in leaves the last rule unrolled', () => {
  assert.deepEqual(stackedBasisPoints([50, 50], 100), [5000, null])
  assert.deepEqual(stackedBasisPoints([50, 50], 50), [2500, 3333])
  assert.deepEqual(stackedBasisPoints([34, 33, 33], 100), [3400, 5000, null])
})

test('the flag version: every arm has a rule at 0/10/100/1000, served rules move below, metadata names the test', () => {
  const served: FlagDefinition = {
    ...SERVED,
    rules: [
      { priority: 5, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    ],
  }
  const answers = {
    ...copyAnswers(),
    who: {
      mode: 'some' as const,
      conditions: [{ field: 'region' as const, values: ['MX', 'CO'] }],
      allocation: 50,
    },
  }
  const result = buildExperimentPlan(
    answers,
    context({ served: { ...context().served, definition: served }, nextVersion: 3 })
  )
  assert.ok(result.ok)
  const { flagDefinition, definition, notes } = result.plan
  assert.deepEqual(
    flagDefinition.rules.map((rule) => [rule.priority, rule.variantKey, rule.rollout?.basisPoints ?? null]),
    [
      [0, 'off', 2500],
      [10, 'on', 3333],
      [10005, 'on', null],
    ]
  )
  assert.deepEqual(flagDefinition.rules[0].clauses, [
    { field: 'region', operator: 'one_of', values: ['MX', 'CO'] },
  ])
  assert.deepEqual(flagDefinition.metadata, {
    source: 'miyagi',
    criticality: 'low',
    experiment_key: 'founding_merchants_copy_test',
    experiment_version: 3,
    experiment_rules: '0,10',
  })
  assert.deepEqual(definition.eligibility.tags, { region: ['MX', 'CO'] })
  assert.deepEqual(definition.variants, [
    { key: 'off', weight: 50, label: 'Current' },
    { key: 'on', weight: 50, label: 'New copy' },
  ])
  assert.equal(parseFlagDefinition(flagDefinition).ok, true)
  assert.equal(parseExperimentDefinition(definition).ok, true)
  assert.match(notes[0], /1 rule of its own/)
  assert.equal(EXPERIMENT_RULE_PRIORITIES.length, 4)
})

test('D8: stripping the experiment returns the served definition exactly; the rollout serves the winner with no split', () => {
  const served: FlagDefinition = {
    ...SERVED,
    rules: [
      { priority: 5, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    ],
  }
  const result = buildExperimentPlan(
    copyAnswers(),
    context({ served: { ...context().served, definition: served } })
  )
  assert.ok(result.ok)
  assert.deepEqual(stripExperiment(result.plan.flagDefinition), served)
  const rollout = planExperimentRollout(result.plan.flagDefinition, 'on')
  assert.ok(rollout.ok)
  assert.equal(rollout.plan.definition.defaultVariantKey, 'on')
  assert.deepEqual(rollout.plan.definition.rules, served.rules)
  assert.equal(rollout.plan.definition.metadata?.experiment_key, undefined)
  assert.deepEqual(rollout.plan.environments, ['production'])
})

// ── D6 — the six checks ──────────────────────────────────────────────────────────────────────
function checkOf(answers: Answers, ctx = context()) {
  const result = buildExperimentPlan(answers, ctx)
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors))
  return Object.fromEntries(result.plan.checks.map((check) => [check.id, check]))
}

test('six checks, all passing, on the approved example with a long enough window', () => {
  const result = buildExperimentPlan({ ...copyAnswers(), weeks: 6 }, context())
  assert.ok(result.ok)
  assert.deepEqual(
    result.plan.checks.map((check) => [check.id, check.status]),
    [
      ['feature', 'ok'],
      ['metrics', 'ok'],
      ['eligibility', 'ok'],
      ['split', 'ok'],
      ['window', 'ok'],
      ['srm', 'ok'],
    ]
  )
  assert.equal(result.plan.failing, 0)
})

test('check 5 fails a short window and its fix is the smallest run that fits', () => {
  const window = checkOf({ ...copyAnswers(), weeks: 2 }).window
  assert.equal(window.status, 'fail')
  assert.deepEqual(window.fix, { label: 'Run it for 6 weeks', kind: 'set-weeks', weeks: 6 })
})

test('check 3: a campaign condition fails (3% coverage) with a one-click removal; a plan condition warns (64%)', () => {
  const base = copyAnswers()
  const campaign = checkOf({
    ...base,
    who: {
      mode: 'some',
      conditions: [...base.who.conditions, { field: 'campaign', values: ['founding_launch'] }],
      allocation: 100,
    },
  }).eligibility
  assert.equal(campaign.status, 'fail')
  assert.deepEqual(campaign.fix, {
    label: 'Remove the campaign condition',
    kind: 'remove-condition',
    field: 'campaign',
  })
  const plan = checkOf({
    ...base,
    weeks: 8,
    who: { mode: 'some', conditions: [{ field: 'plan', values: ['free'] }], allocation: 100 },
  }).eligibility
  assert.equal(plan.status, 'warn')
})

test('check 1: a new feature fails; an inactive feature fails; no evaluations in 24h warns', () => {
  assert.equal(checkOf({ ...copyAnswers(), flagKey: null }, context({ served: null })).feature.status, 'fail')
  assert.equal(
    checkOf(copyAnswers(), context({ served: { ...context().served, activeInProduction: false } })).feature
      .status,
    'fail'
  )
  assert.equal(
    checkOf(copyAnswers(), context({ catalog: prototypeCatalog({ flagEvaluations: [] }) })).feature.status,
    'warn'
  )
})

test('check 2 fails a guardrail that went quiet; check 5 replans a saved draft whose dates ran out', () => {
  assert.equal(checkOf({ ...copyAnswers(), guardrails: ['referral.sent'] }).metrics.status, 'fail')
  const stale = checkOf(
    { ...copyAnswers(), weeks: 6 },
    context({ savedWindow: { startAt: '2026-08-01T00:00:00.000Z', endAt: '2026-09-12T00:00:00.000Z' } })
  ).window
  assert.equal(stale.status, 'fail')
  assert.equal(stale.fix?.kind, 'replan-from-today')
})

test('a template never invents an event: an empty catalog returns no answers and says why', () => {
  const resolved = resolveTemplateDefaults('copy', {
    catalog: prototypeCatalog({ events: [] }),
    flagKey: null,
  })
  assert.equal(resolved.answers, null)
  assert.match(resolved.gaps[0], /hasn't sent any events/)
})

test('D5 on a thin catalog: no condition and no breakdown are suggested, and the gaps are named', () => {
  const thin = prototypeCatalog({
    segments: prototypeCatalog().segments.map((segment) => ({ ...segment, coverage: 0.01 })),
  })
  const resolved = resolveTemplateDefaults('copy', { catalog: thin, flagKey: null })
  assert.ok(resolved.answers)
  assert.equal(resolved.answers.who.mode, 'everyone')
  assert.deepEqual(resolved.answers.breakdowns, [])
  assert.equal(resolved.gaps.length, 2)
})
