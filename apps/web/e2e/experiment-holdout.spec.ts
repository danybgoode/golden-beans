import { expect, test } from '@playwright/test'
import {
  createGrowthEngineClient,
  evaluateFlag,
  experimentForResolution,
  type FlagDefinition,
  type FlagEvaluationSegments,
} from '@golden-frijoles/sdk'
import { computeExperimentAnalysis, type ExperimentAnalysisFact } from '@/lib/experiment-analysis'
import type { ExperimentDefinition } from '@/lib/experiment-definition'

// experiments-for-humans · Story 1.3 (epic README D2, A3) — "How many of them", end to end.
//
// Nothing here is mocked except the network: 10,000 subjects go through the REAL evaluator, the REAL
// client builds the REAL request bodies (captured by `fetchImpl`), and those bodies become the facts
// the REAL governed analysis reads. The flag definition is D4-shaped by hand from the formula, because
// the planner that writes it arrives in Story 2.2 — whose property test holds the planner to the same
// numbers.

const FLAG_KEY = 'growth.founding_merchants_enabled'
const EXPERIMENT_KEY = 'founding_copy_test'
const VERSION = 1
const SUBJECTS = 10_000
const REGIONS = ['MX', 'CO', 'US'] as const

// allocation a = 0.5, weights 50/50: control a·w = 0.25 → 2500 bp; treatment 0.25 / (1 − 0.25) → 3333 bp.
const eligible = [{ field: 'region' as const, operator: 'one_of' as const, values: ['MX', 'CO'] }]
const FLAG: FlagDefinition = {
  valueType: 'boolean',
  description: 'Founding-merchant offer at signup',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [
    { priority: 0, clauses: eligible, rollout: { basisPoints: 2500 }, variantKey: 'off' },
    // Priority 10, not 1: see D4's correction — rules whose hash tuples differ in one same-length
    // digit are strongly correlated under FNV-1a, which silently breaks stacked-rollout arithmetic.
    { priority: 10, clauses: eligible, rollout: { basisPoints: 3333 }, variantKey: 'on' },
    // The feature's OWN rule, shifted below the experiment's (+10000): it serves `on` to the US, and a
    // TARGETING_MATCH through it must never be mistaken for an exposure.
    { priority: 10000, clauses: [{ field: 'region', operator: 'equals', value: 'US' }], variantKey: 'on' },
  ],
  metadata: {
    source: 'miyagi',
    experiment_key: EXPERIMENT_KEY,
    experiment_version: VERSION,
    experiment_rules: '0,10',
  },
}

const at = (second: number) =>
  `${new Date(Date.UTC(2026, 8, 25, 0, 0, second)).toISOString().slice(0, 19)}.000Z`

const DEFINITION: ExperimentDefinition = {
  hypothesis:
    'We believe showing New copy to merchants in Mexico or Colombia will raise completed applications.',
  assignmentEntityType: 'merchant',
  eligibility: { description: '50% of merchants in Mexico or Colombia', tags: { region: ['MX', 'CO'] } },
  variants: [
    { key: 'off', weight: 1, label: 'Current' },
    { key: 'on', weight: 1, label: 'New copy' },
  ],
  controlVariantKey: 'off',
  primaryMetric: { event: 'application.completed', direction: 'increase' },
  guardrailMetrics: [],
  segmentFields: ['region'],
  plannedWindow: { startAt: at(0), endAt: at(3600) },
  minimumSamplePerVariant: 1,
}

type Body = {
  event: string
  featureId?: string
  tags?: Record<string, unknown>
  context?: { subject?: { type: string; id: string } }
}

/** Runs every subject through evaluate → trackFlagEvaluation and returns what the SDK would POST. */
async function simulate(options: { holdoutLeaks?: boolean; omitSegments?: boolean } = {}) {
  const bodies: Body[] = []
  const growth = createGrowthEngineClient({
    baseUrl: 'https://engine.test',
    apiKey: 'test',
    userId: 'server',
    fetchImpl: (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Body)
      return new Response(JSON.stringify({ ok: true, id: String(bodies.length) }), { status: 200 })
    }) as unknown as typeof fetch,
  })
  const served = { off: 0, on: 0, heldOutOn: 0 }
  for (let index = 0; index < SUBJECTS; index += 1) {
    const id = `merchant-${index}`
    const region = REGIONS[index % REGIONS.length]
    const details = evaluateFlag({
      flag: { key: FLAG_KEY, definitionVersion: 7, definition: FLAG },
      context: { targetingKey: id, region },
      defaultValue: false,
      expectedType: 'boolean',
    })
    served[details.variant as 'off' | 'on'] += 1
    let experiment = experimentForResolution(details)
    if (!experiment && details.variant === 'on') served.heldOutOn += 1
    // The deliberately broken app: it tags EVERY eligible evaluation as an exposure, held-out included.
    if (options.holdoutLeaks && !experiment && region !== 'US')
      experiment = { key: EXPERIMENT_KEY, definitionVersion: VERSION }
    const segments: FlagEvaluationSegments | undefined = options.omitSegments ? undefined : { region }
    await growth.trackFlagEvaluation({
      flagKey: FLAG_KEY,
      flagVersion: 7,
      variant: details.variant!,
      reason: details.reason,
      snapshotVersion: 40,
      environment: 'production',
      subject: { type: 'merchant', id },
      ...(segments ? { segments } : {}),
      ...(experiment ? { experiment } : {}),
    })
  }
  return { bodies, served }
}

function facts(bodies: Body[]): ExperimentAnalysisFact[] {
  return bodies.map((body, index) => ({
    id: `fact-${index}`,
    event: body.event,
    featureId: body.featureId ?? null,
    tags: body.tags ?? null,
    subjectType: body.context?.subject?.type ?? null,
    subjectId: body.context?.subject?.id ?? null,
    occurredAt: at(1 + (index % 3000)),
    createdAt: at(1 + (index % 3000)),
  }))
}

function analyse(bodies: Body[]) {
  return computeExperimentAnalysis({
    experimentKey: EXPERIMENT_KEY,
    definitionVersion: VERSION,
    definition: DEFINITION,
    lifecycle: { status: 'running', startedAt: at(0), endedAt: null },
    asOf: at(3601),
    facts: facts(bodies),
  })
}

test.describe('holding people out (D2 = A)', () => {
  test('held-out people are served control and emit NO exposure; the in-test half splits 50/50; SRM clear', async () => {
    const { bodies } = await simulate()
    const exposures = bodies.filter((body) => body.event === 'experiment_exposed')
    const evaluated = bodies.filter((body) => body.event === 'flag_evaluated')
    expect(exposures.length + evaluated.length).toBe(SUBJECTS)

    // Every flag_evaluated from an ELIGIBLE region is a held-out person, and every one of them saw control.
    const heldOut = evaluated.filter((body) => body.tags?.region !== 'US')
    expect(heldOut.every((body) => body.tags?.variant === 'off')).toBe(true)
    // The US is served `on` by the feature's own rule — and still never exposed.
    expect(
      evaluated.filter((body) => body.tags?.region === 'US').every((body) => body.tags?.variant === 'on')
    ).toBe(true)
    // Nobody outside eligibility is ever exposed.
    expect(exposures.some((body) => body.tags?.region === 'US')).toBe(false)

    const eligibleCount = Math.round((SUBJECTS * 2) / 3)
    const inTestShare = exposures.length / eligibleCount
    expect(Math.abs(inTestShare - 0.5)).toBeLessThan(0.02)
    const treated = exposures.filter((body) => body.tags?.variant === 'on').length / exposures.length
    expect(Math.abs(treated - 0.5)).toBeLessThan(0.02)

    const analysis = analyse(bodies)
    expect(analysis.diagnostics.srm.status).toBe('clear')
    expect(analysis.diagnostics.validExposureSubjects).toBe(exposures.length)
    expect(analysis.diagnostics.integrity).toEqual([])
  })

  test('a broken app that leaks held-out exposures is DETECTED, not averaged in', async () => {
    const analysis = analyse((await simulate({ holdoutLeaks: true })).bodies)
    // ~75% control vs ~25% treatment against a declared 50/50.
    expect(analysis.diagnostics.srm.status).toBe('detected')
    expect(analysis.blockers).toContain('srm_detected')
  })

  test('an exposure without the eligibility tags is rejected as eligibility_mismatch (why segments exist)', async () => {
    const analysis = analyse((await simulate({ omitSegments: true })).bodies)
    expect(analysis.diagnostics.validExposureSubjects).toBe(0)
    expect(analysis.blockers).toContain('eligibility_mismatch')
  })
})

test('the old path is byte-identical: experiment passed by hand, no segments, no new keys', async () => {
  const bodies: string[] = []
  const growth = createGrowthEngineClient({
    baseUrl: 'https://engine.test',
    apiKey: 'test',
    userId: 'server',
    fetchImpl: (async (_url: string, init: { body: string }) => {
      bodies.push(init.body)
      return new Response(JSON.stringify({ ok: true, id: '1' }), { status: 200 })
    }) as unknown as typeof fetch,
  })
  const input = {
    flagKey: FLAG_KEY,
    flagVersion: 7,
    variant: 'on',
    reason: 'TARGETING_MATCH',
    snapshotVersion: 40,
    environment: 'production' as const,
    subject: { type: 'merchant', id: 'merchant-1' },
  }
  await growth.trackFlagEvaluation({ ...input, experiment: { key: EXPERIMENT_KEY, definitionVersion: 3 } })
  await growth.trackFlagEvaluation(input)
  // The exact 0.5.0 request bodies, key order included. A change here is a wire-contract change.
  const tags =
    '"flag_key":"growth.founding_merchants_enabled","flag_definition_version":7,"variant":"on","reason":"TARGETING_MATCH","snapshot_version":40,"environment":"production"'
  expect(bodies).toEqual([
    `{"userId":"server","event":"experiment_exposed","tags":{${tags},"experiment_definition_version":3},"context":{"version":1,"subject":{"type":"merchant","id":"merchant-1"},"idempotencyKey":"${bodies[0].match(/"idempotencyKey":"([^"]+)"/)![1]}"},"featureId":"founding_copy_test"}`,
    `{"userId":"server","event":"flag_evaluated","tags":{${tags}},"context":{"version":1,"subject":{"type":"merchant","id":"merchant-1"},"idempotencyKey":"${bodies[1].match(/"idempotencyKey":"([^"]+)"/)![1]}"},"featureId":"growth.founding_merchants_enabled"}`,
  ])
})
