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
  parseExperimentBuilderAnswers,
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

function prototypeCombos(): Catalog['segmentCombos'] {
  const region: Array<[string | null, number]> = [
    ['MX', 0.98 * 0.91],
    ['US', 0.98 * 0.05],
    ['CO', 0.98 * 0.03],
    ['AR', 0.98 * 0.01],
    [null, 0.02],
  ]
  const channel: Array<[string | null, number]> = [
    ['web', 0.72],
    ['app', 0.21],
    ['whatsapp', 0.07],
  ]
  const plan: Array<[string | null, number]> = [
    ['free', 0.64 * 0.81],
    ['founding', 0.64 * 0.12],
    ['pro', 0.64 * 0.07],
    [null, 0.36],
  ]
  const combos: Catalog['segmentCombos']['combos'] = []
  for (const [r, pr] of region)
    for (const [c, pc] of channel)
      for (const [p, pp] of plan) {
        const count = Math.round(10_000 * pr * pc * pp)
        if (count === 0) continue
        combos.push({
          values: { ...(r ? { region: r } : {}), ...(c ? { channel: c } : {}), ...(p ? { plan: p } : {}) },
          count,
        })
      }
  return { rows: combos.reduce((sum, combo) => sum + combo.count, 0), combos, complete: true }
}

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
    // The prototype only draws MARGINALS; its example tenant is modelled as region × channel × plan
    // arriving independently (10,000 rows) — the one assumption the planner itself no longer makes.
    segmentCombos: prototypeCombos(),
    observedDays: 14,
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
  takenExperimentKeys: [] as string[],
  takenFlagKeys: [] as string[],
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
  const rollout = planExperimentRollout(result.plan.flagDefinition, 'on', {
    experimentKey: result.plan.experimentKey,
    version: 1,
  })
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

test('check 5 fails a short window for EVERYONE and its fix is the smallest run that fits', () => {
  const everyone = { mode: 'everyone' as const, conditions: [], allocation: 100 }
  const window = checkOf({ ...copyAnswers(), weeks: 2, who: everyone }).window
  assert.equal(window.status, 'fail')
  assert.equal(window.fix?.kind, 'set-weeks')
  const weeks = window.fix?.kind === 'set-weeks' ? window.fix.weeks : 0
  assert.equal(checkOf({ ...copyAnswers(), weeks, who: everyone }).window.status, 'ok')
  // The same shortfall with a condition is a share of events standing in for people: it only warns.
  assert.equal(checkOf({ ...copyAnswers(), weeks: 2 }).window.status, 'warn')
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

test('check 5 on a fresh plan counts the FULL planned length: needing exactly 14 days fits 2 weeks (agy, PR #169)', () => {
  const answers = { ...copyAnswers(), weeks: 2 }
  const probe = buildExperimentPlan(answers, context())
  assert.ok(probe.ok)
  // Traffic tuned so the estimate lands on exactly 14 days, at a `now` with seconds on the clock.
  // In-test share per merchant seen, as the planner computes it, then just enough merchants for 14 days.
  const inTestPerSubject = probe.plan.estimate.inTestPerDay / 3912
  const subjects = (probe.plan.estimate.needPerVersion! / 14 / 0.5 / inTestPerSubject) * 1.000001
  const catalog = prototypeCatalog({ entities: [{ type: 'merchant', subjects14d: subjects }] })
  const result = buildExperimentPlan(answers, context({ catalog, now: new Date('2026-09-24T15:00:37.500Z') }))
  assert.ok(result.ok)
  assert.equal(result.plan.estimate.days, 14)
  assert.equal(result.plan.checks.find((check) => check.id === 'window')?.status, 'ok')
})

test('planning on a feature ALREADY serving an experiment re-plans from the stripped definition (agy, PR #169)', () => {
  const v1 = buildExperimentPlan(copyAnswers(), context())
  assert.ok(v1.ok)
  const live = { ...context().served, definition: v1.plan.flagDefinition }
  const v2 = buildExperimentPlan({ ...copyAnswers(), split: 20 }, context({ served: live, nextVersion: 2 }))
  assert.ok(v2.ok, JSON.stringify(!v2.ok && v2.errors))
  assert.deepEqual(
    v2.plan.flagDefinition.rules.map((rule) => rule.priority),
    [0, 10]
  )
  assert.equal(v2.plan.flagDefinition.metadata?.experiment_version, 2)
  assert.deepEqual(stripExperiment(v2.plan.flagDefinition), SERVED)
})

test('check 2 never says "all 0 guardrails" when the only guardrail is the metric itself', () => {
  assert.equal(
    checkOf({ ...copyAnswers(), guardrails: ['application.completed'] }).metrics.detail,
    'application.completed.'
  )
})

// ── fresh reviewer, PR #169 — each finding, and each mutation that used to survive ──────────────

test('D8: the rollout refuses to strip an experiment other than the one it was asked to', () => {
  const result = buildExperimentPlan(copyAnswers(), context())
  assert.ok(result.ok)
  for (const expected of [
    { experimentKey: 'someone_else', version: 1 },
    { experimentKey: result.plan.experimentKey, version: 2 },
  ]) {
    const refused = planExperimentRollout(result.plan.flagDefinition, 'on', expected)
    assert.equal(refused.ok, false, JSON.stringify(expected))
  }
})

test('check 1 fails when the feature is already serving a DIFFERENT experiment', () => {
  const running = buildExperimentPlan(copyAnswers(), context())
  assert.ok(running.ok)
  const other = checkOf(
    { ...copyAnswers(), template: 'pricing' },
    context({ served: { ...context().served, definition: running.plan.flagDefinition } })
  ).feature
  assert.equal(other.status, 'fail')
  assert.match(other.detail, /serving founding_merchants_copy_test/)
})

test('re-planning a saved draft keeps its names even when they are taken (by itself)', () => {
  const result = buildExperimentPlan(
    { ...copyAnswers(), flagKey: null },
    context({
      served: null,
      takenExperimentKeys: ['copy_test_copy_test'],
      takenFlagKeys: ['experiments.copy_test_enabled'],
      draft: { experimentKey: 'copy_test_copy_test', flagKey: 'experiments.copy_test_enabled' },
    })
  )
  assert.ok(result.ok)
  assert.equal(result.plan.experimentKey, 'copy_test_copy_test')
  assert.equal(result.plan.flagKey, 'experiments.copy_test_enabled')
})

test('check 5 on a saved draft: changing the run length re-plans the window, so the offered fix clears itself', () => {
  const savedWindow = { startAt: '2026-09-25T00:00:00.000Z', endAt: '2026-10-09T00:00:00.000Z' } // 2 weeks
  const everyone = { mode: 'everyone' as const, conditions: [], allocation: 100 }
  const short = checkOf({ ...copyAnswers(), weeks: 2, who: everyone }, context({ savedWindow })).window
  assert.equal(short.status, 'fail')
  assert.ok(short.fix?.kind === 'set-weeks' || short.fix?.kind === 'replan-from-today')
  const weeks = short.fix?.kind === 'set-weeks' ? short.fix.weeks : 6
  assert.equal(
    checkOf({ ...copyAnswers(), weeks, who: everyone }, context({ savedWindow })).window.status,
    'ok'
  )
})

test('check 5 never offers a run length that cannot fit (more than 8 weeks needed)', () => {
  const thin = prototypeCatalog({ entities: [{ type: 'merchant', subjects14d: 60 }] })
  const window = checkOf(
    { ...copyAnswers(), weeks: 8, who: { mode: 'everyone' as const, conditions: [], allocation: 100 } },
    context({ catalog: thin })
  ).window
  assert.equal(window.status, 'fail')
  assert.equal(window.fix?.kind, 'step')
})

test('an empty condition is a failing CHECK (Save still works), not a plan error', () => {
  const base = copyAnswers()
  const result = buildExperimentPlan(
    {
      ...base,
      who: {
        mode: 'some',
        conditions: [...base.who.conditions, { field: 'plan', values: [] }],
        allocation: 100,
      },
    },
    context()
  )
  assert.ok(result.ok, JSON.stringify(!result.ok && result.errors))
  const eligibility = result.plan.checks.find((check) => check.id === 'eligibility')!
  assert.equal(eligibility.status, 'fail')
  assert.match(eligibility.title, /no value picked/)
  assert.deepEqual(result.plan.definition.eligibility.tags, { region: 'MX' })
})

test('the answers parser refuses what the planner must never see', () => {
  const good = copyAnswers()
  assert.equal(parseExperimentBuilderAnswers(good).ok, true)
  for (const bad of [
    { ...good, template: 'toString' },
    { ...good, why: 'nope' },
    { ...good, why: 'constructor' },
    { ...good, versions: ['A', 42] },
    { ...good, who: undefined },
    { ...good, mde: 1e-200 },
    { ...good, extra: true },
    {
      ...good,
      who: {
        mode: 'some',
        conditions: [
          { field: 'region', values: ['MX'] },
          { field: 'region', values: ['US'] },
        ],
        allocation: 100,
      },
    },
  ]) {
    assert.equal(parseExperimentBuilderAnswers(bad).ok, false, JSON.stringify(bad).slice(0, 120))
    assert.equal(buildExperimentPlan(bad as Answers, context()).ok, false)
  }
})

test('boundaries the old fixtures never touched: coverage exactly 90% is fine; a served rule at priority 0 strips back to 0', () => {
  const at90 = prototypeCatalog({
    segments: prototypeCatalog().segments.map((segment) =>
      segment.field === 'plan' ? { ...segment, coverage: 0.9 } : segment
    ),
  })
  assert.equal(
    checkOf(
      {
        ...copyAnswers(),
        weeks: 8,
        who: { mode: 'some', conditions: [{ field: 'plan', values: ['free'] }], allocation: 100 },
      },
      context({ catalog: at90 })
    ).eligibility.status,
    'ok'
  )
  const served: FlagDefinition = { ...SERVED, rules: [{ priority: 0, clauses: [], variantKey: 'on' }] }
  const result = buildExperimentPlan(
    copyAnswers(),
    context({ served: { ...context().served, definition: served } })
  )
  assert.ok(result.ok)
  assert.deepEqual(stripExperiment(result.plan.flagDefinition), served)
})

test('metadata: 13 existing entries leave room for the three; 14 are refused, never truncated', () => {
  const entries = (n: number) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`k${i}`, i]))
  const fits = buildExperimentPlan(
    copyAnswers(),
    context({ served: { ...context().served, definition: { ...SERVED, metadata: entries(13) } } })
  )
  assert.ok(fits.ok)
  const full = buildExperimentPlan(
    copyAnswers(),
    context({ served: { ...context().served, definition: { ...SERVED, metadata: entries(14) } } })
  )
  assert.equal(full.ok, false)
})

test('a served rule too high to move below the test is refused', () => {
  const served: FlagDefinition = { ...SERVED, rules: [{ priority: 995_000, clauses: [], variantKey: 'on' }] }
  const result = buildExperimentPlan(
    copyAnswers(),
    context({ served: { ...context().served, definition: served } })
  )
  // The flag parser would refuse it too (priority > 1,000,000); the planner's own refusal exists to
  // say WHY in words a product person can act on, so the words are what is asserted.
  assert.equal(result.ok, false)
  assert.match(!result.ok ? result.errors[0] : '', /priority too high/)
})

// ── round 2 (Codex + fresh reviewer, PR #169) ──────────────────────────────────────────────────
test('two conditions use the JOINT share: tags that never arrive together mean nobody is in the test', () => {
  const catalog = prototypeCatalog({
    segmentCombos: {
      rows: 1000,
      complete: true,
      combos: [
        { values: { region: 'MX', plan: 'pro' }, count: 600 },
        { values: { region: 'US', plan: 'free' }, count: 400 },
      ],
    },
  })
  const who = {
    mode: 'some' as const,
    conditions: [
      { field: 'region' as const, values: ['MX'] },
      { field: 'plan' as const, values: ['free'] },
    ],
    allocation: 100,
  }
  const result = buildExperimentPlan({ ...copyAnswers(), who }, context({ catalog }))
  assert.ok(result.ok)
  assert.equal(result.plan.estimate.inTestPerDay, 0) // the product of marginals would have said 0.6 × 0.4
  // A zero share of EVENTS is still not a count of people, so it warns rather than blocks.
  assert.equal(result.plan.checks.find((check) => check.id === 'window')?.status, 'warn')
})

test('a saved draft that has NOT started yet but is too short is offered more weeks, not "dates have run out"', () => {
  const savedWindow = { startAt: '2026-09-25T00:00:00.000Z', endAt: '2026-10-09T00:00:00.000Z' }
  const window = checkOf({ ...copyAnswers(), weeks: 2 }, context({ savedWindow })).window
  assert.equal(window.fix?.kind, 'set-weeks')
  assert.doesNotMatch(window.title, /run out/)
})

test('traffic per day divides by the days the window really spans', () => {
  const full = buildExperimentPlan(copyAnswers(), context())
  const partial = buildExperimentPlan(
    copyAnswers(),
    context({ catalog: prototypeCatalog({ observedDays: 13.5 }) })
  )
  assert.ok(full.ok && partial.ok)
  assert.ok(Math.abs(partial.plan.estimate.inTestPerDay / full.plan.estimate.inTestPerDay - 14 / 13.5) < 1e-9)
})

test('the sentence never prints an unfinished condition, and a repeated value is refused', () => {
  const base = copyAnswers()
  const result = buildExperimentPlan(
    {
      ...base,
      who: {
        mode: 'some',
        conditions: [...base.who.conditions, { field: 'plan', values: [] }],
        allocation: 100,
      },
    },
    context()
  )
  assert.ok(result.ok)
  assert.doesNotMatch(sentenceText(result.plan.sentence), /on the {2}plan|  /)
  assert.equal(
    parseExperimentBuilderAnswers({
      ...base,
      who: { mode: 'some', conditions: [{ field: 'region', values: ['MX', 'MX'] }], allocation: 100 },
    }).ok,
    false
  )
})

test('an exhausted name is refused, never re-used', () => {
  const taken = [
    'founding_merchants_copy_test',
    ...Array.from({ length: 998 }, (_, i) => `founding_merchants_copy_test_${i + 2}`),
  ]
  const result = buildExperimentPlan(copyAnswers(), context({ takenExperimentKeys: taken }))
  assert.equal(result.ok, false)
})

test('an INCOMPLETE combination table never reads a real audience as zero (round 3, PR #169)', async () => {
  const { buildEventCatalog } = await import('./event-catalog.ts')
  const asOf = new Date('2026-09-24T15:00:00.000Z')
  const rows = [
    ...Array.from({ length: 1000 }, (_, i) => ({
      event: 'page_viewed',
      tags: { region: 'US', campaign: `u${i % 500}` },
      subject_type: 'merchant',
      subject_id: `us-${i}`,
      created_at: '2026-09-24T10:00:00.000Z',
    })),
    ...Array.from({ length: 600 }, (_, i) => ({
      event: 'page_viewed',
      tags: { region: 'MX', campaign: `m${i}` },
      subject_type: 'merchant',
      subject_id: `mx-${i}`,
      created_at: '2026-09-24T10:00:00.000Z',
    })),
  ]
  const real = buildEventCatalog(rows, { asOf, rowCap: 50_000, windowDays: 14 })
  assert.equal(real.segmentCombos.complete, false)
  const catalog = { ...prototypeCatalog(), segments: real.segments, segmentCombos: real.segmentCombos }

  // One condition: the exact marginal, 37.5 % of events.
  const one = buildExperimentPlan(
    {
      ...copyAnswers(),
      weeks: 8,
      who: { mode: 'some', conditions: [{ field: 'region', values: ['MX'] }], allocation: 100 },
    },
    context({ catalog })
  )
  assert.ok(one.ok)
  assert.ok(Math.abs(one.plan.estimate.inTestPerDay / (3912 / 14) - 0.375) < 1e-9)
  assert.notEqual(one.plan.checks.find((check) => check.id === 'window')?.title, 'Nobody matches who’s in it')
  assert.equal(
    one.plan.notes.some((note) => /approximate/.test(note)),
    false
  ) // one condition is EXACT

  // Two conditions on an incomplete table: approximate, and at most a WARNING.
  const two = buildExperimentPlan(
    {
      ...copyAnswers(),
      weeks: 8,
      who: {
        mode: 'some',
        conditions: [
          { field: 'region', values: ['MX'] },
          { field: 'campaign', values: ['m1'] },
        ],
        allocation: 100,
      },
    },
    context({ catalog })
  )
  assert.ok(two.ok)
  assert.notEqual(two.plan.checks.find((check) => check.id === 'window')?.status, 'fail')
  assert.ok(two.plan.notes.some((note) => /approximate/.test(note)))
})

// ── round 4 (Codex + fresh reviewer, PR #169): an approximate estimate never blocks Start ────────
test('a chosen value cut from the top 20 is approximate, and can only warn', async () => {
  const { buildEventCatalog } = await import('./event-catalog.ts')
  const rows = Array.from({ length: 25 }, (_, r) =>
    Array.from({ length: r === 24 ? 39 : 40 }, (_, i) => ({
      event: 'page_viewed',
      tags: { region: `r${String(r).padStart(2, '0')}` },
      subject_type: 'merchant',
      subject_id: `m${r}-${i}`,
      created_at: '2026-09-24T10:00:00.000Z',
    }))
  ).flat()
  const real = buildEventCatalog(rows, {
    asOf: new Date('2026-09-24T15:00:00.000Z'),
    rowCap: 50_000,
    windowDays: 14,
  })
  const catalog = { ...prototypeCatalog(), segments: real.segments, segmentCombos: real.segmentCombos }
  const result = buildExperimentPlan(
    {
      ...copyAnswers(),
      weeks: 8,
      who: { mode: 'some', conditions: [{ field: 'region', values: ['r24'] }], allocation: 100 },
    },
    context({ catalog })
  )
  assert.ok(result.ok)
  assert.equal(result.plan.checks.find((check) => check.id === 'window')?.status, 'warn')
  assert.equal(result.plan.failing, 0)
})

test('an approximate (independence) estimate that says "too long" warns instead of blocking', () => {
  const catalog = prototypeCatalog({ segmentCombos: { ...prototypeCombos(), complete: false } })
  const who = {
    mode: 'some' as const,
    conditions: [
      { field: 'region' as const, values: ['MX'] },
      { field: 'plan' as const, values: ['pro'] },
    ],
    allocation: 100,
  }
  const result = buildExperimentPlan({ ...copyAnswers(), weeks: 2, who }, context({ catalog }))
  assert.ok(result.ok)
  const window = result.plan.checks.find((check) => check.id === 'window')!
  assert.equal(window.status, 'warn')
  assert.ok(window.fix) // the fix is still offered
})

test("the engine's own telemetry is never a metric or a guardrail", () => {
  for (const event of ['flag_evaluated', 'experiment_exposed', '$error', 'scenario_executed']) {
    assert.equal(parseExperimentBuilderAnswers({ ...copyAnswers(), metric: event }).ok, false, event)
    assert.equal(parseExperimentBuilderAnswers({ ...copyAnswers(), guardrails: [event] }).ok, false, event)
  }
})

test('the "ends before it has enough people" branch also only warns on an approximate estimate', () => {
  const who = {
    mode: 'some' as const,
    conditions: [
      { field: 'region' as const, values: ['MX'] },
      { field: 'channel' as const, values: ['web'] },
    ],
    allocation: 100,
  }
  const approx = buildExperimentPlan(
    { ...copyAnswers(), weeks: 2, who },
    context({ catalog: prototypeCatalog({ segmentCombos: { ...prototypeCombos(), complete: false } }) })
  )
  assert.ok(approx.ok)
  assert.ok(
    approx.plan.estimate.days! > 14 && approx.plan.estimate.days! <= 56,
    String(approx.plan.estimate.days)
  )
  const window = approx.plan.checks.find((check) => check.id === 'window')!
  assert.equal(window.title, 'The test ends before it has enough people')
  assert.equal(window.status, 'warn')
})

test('a TRUNCATED catalog never blocks Start, even for everyone (fresh reviewer + Codex, round 5)', () => {
  const everyone = { mode: 'everyone' as const, conditions: [], allocation: 100 }
  assert.equal(checkOf({ ...copyAnswers(), weeks: 1, who: everyone }).window.status, 'fail')
  assert.equal(
    checkOf(
      { ...copyAnswers(), weeks: 1, who: everyone },
      context({ catalog: prototypeCatalog({ truncated: true }) })
    ).window.status,
    'warn'
  )
})

test('"some" with no conditions is a plan, not a throw (Codex, round 6 probe)', () => {
  const result = buildExperimentPlan(
    { ...copyAnswers(), who: { mode: 'some', conditions: [], allocation: 100 } },
    context()
  )
  assert.ok(result.ok)
  assert.equal(result.plan.checks.find((check) => check.id === 'eligibility')?.status, 'ok')
})

test('a saved window that has already ENDED fails first, whatever the estimate says (fresh reviewer, round 6)', () => {
  const savedWindow = { startAt: '2026-08-01T00:00:00.000Z', endAt: '2026-08-15T00:00:00.000Z' } // 2 weeks, over
  const everyone = { mode: 'everyone' as const, conditions: [], allocation: 100 }
  // No baseline for this metric among merchants → the estimate branch would have said "can't estimate".
  const catalog = prototypeCatalog({ baselines: [] })
  const window = checkOf(
    { ...copyAnswers(), weeks: 2, who: everyone },
    context({ savedWindow, catalog })
  ).window
  assert.equal(window.status, 'fail')
  assert.equal(window.fix?.kind, 'replan-from-today')
})

test('a need above the contract cap is recorded at the cap AND said out loud (Codex, round 7)', () => {
  // referral.sent: a 0.8 % baseline, so a 1 % change needs ~20 million per version.
  const result = buildExperimentPlan({ ...copyAnswers(), metric: 'referral.sent', mde: 1 }, context())
  assert.ok(result.ok)
  assert.ok(result.plan.estimate.needPerVersion! > 1_000_000)
  assert.equal(result.plan.definition.minimumSamplePerVariant, 1_000_000)
  assert.ok(result.plan.notes.some((note) => /more than a plan can declare/.test(note)))
})

test('a saved window with less than a day left counts as over (fresh reviewer, round 7)', () => {
  const savedWindow = { startAt: '2026-09-10T15:30:00.000Z', endAt: '2026-09-24T15:30:00.000Z' } // 30 minutes left
  const window = checkOf(
    { ...copyAnswers(), weeks: 2 },
    context({ savedWindow, catalog: prototypeCatalog({ baselines: [] }) })
  ).window
  assert.equal(window.status, 'fail')
  assert.equal(window.fix?.kind, 'replan-from-today')
})
