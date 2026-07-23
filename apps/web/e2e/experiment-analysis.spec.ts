import { expect, test } from '@playwright/test'
import {
  computeExperimentAnalysis,
  type ExperimentAnalysisFact,
  type ExperimentAnalysisInput,
} from '@/lib/experiment-analysis'
import type { ExperimentDefinition } from '@/lib/experiment-definition'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'

const at = (second: number, fraction = '000') => {
  const whole = new Date(Date.UTC(2026, 6, 1, 0, 0, second)).toISOString().slice(0, 19)
  return `${whole}.${fraction}Z`
}

const definition: ExperimentDefinition = {
  hypothesis: 'A clearer CTA increases activation.',
  assignmentEntityType: 'merchant',
  eligibility: { description: 'Mexico pro merchants', tags: { region: 'mx' } },
  variants: [{ key: 'control', weight: 1 }, { key: 'treatment', weight: 1 }],
  controlVariantKey: 'control',
  primaryMetric: { event: 'activated', direction: 'increase' },
  guardrailMetrics: [{ event: 'support_ticket', direction: 'decrease' }],
  segmentFields: ['region', 'plan'],
  plannedWindow: { startAt: at(1), endAt: at(50) },
  minimumSamplePerVariant: 5,
}

function exposure(subjectId: string, variant: string, second: number, tags: Record<string, unknown> = {}): ExperimentAnalysisFact {
  return {
    id: `exposure-${subjectId}-${variant}-${second}`,
    event: 'experiment_exposed', featureId: 'cta-v2',
    tags: { variant, experiment_definition_version: 7, region: 'mx', ...tags },
    subjectType: 'merchant', subjectId, occurredAt: at(second), createdAt: at(second),
  }
}

function metric(subjectId: string | null, event: string, second: number, subjectType = 'merchant'): ExperimentAnalysisFact {
  return {
    id: `metric-${subjectId ?? 'none'}-${event}-${second}`,
    event, featureId: null, tags: null, subjectType, subjectId, occurredAt: at(second), createdAt: at(second),
  }
}

function input(facts: ExperimentAnalysisFact[], extras: Partial<ExperimentAnalysisInput> = {}): ExperimentAnalysisInput {
  return {
    experimentKey: 'cta-v2', definitionVersion: 7, definition,
    lifecycle: { status: 'running', startedAt: at(1), endedAt: null },
    asOf: at(60), facts, ...extras,
  }
}

function balancedFacts(): ExperimentAnalysisFact[] {
  const facts: ExperimentAnalysisFact[] = []
  for (let n = 0; n < 5; n += 1) {
    facts.push(exposure(`c${n}`, 'control', 2 + n))
    facts.push(exposure(`t${n}`, 'treatment', 12 + n))
  }
  return facts
}

test('joins untagged metrics after the first valid exposure, preserves exact boundaries, and uses semantic control lift', () => {
  const facts = balancedFacts()
  facts.push(
    metric('c0', 'activated', 2), // inclusive first-exposure boundary
    metric('t0', 'activated', 13),
    metric('t1', 'activated', 14),
    metric('t1', 'activated', 15), // still one converted subject
    metric('t2', 'activated', 11), // before exposure: never attributed
    metric('t3', 'activated', 50), // exclusive window end
    metric('t4', 'support_ticket', 16),
  )
  const result = computeExperimentAnalysis(input(facts))
  expect(result.window).toMatchObject({ startAt: at(1), endAt: at(50) })
  expect(result.primaryMetric.variants).toEqual([
    expect.objectContaining({ key: 'control', exposedSubjects: 5, convertedSubjects: 1, conversionRate: 0.2, liftFromControl: null }),
    expect.objectContaining({ key: 'treatment', exposedSubjects: 5, convertedSubjects: 2, conversionRate: 0.4, liftFromControl: 1 }),
  ])
  expect(result.primaryMetric.addressability).toEqual({
    candidateEvents: 5,
    addressableEvents: 5,
    joinedEvents: 4,
    attributedSubjects: 3,
    coverage: 1,
  })
  expect(result.guardrailMetrics[0]).toMatchObject({ event: 'support_ticket', direction: 'decrease' })
  expect(result.variants.map((variant) => variant.minimumSampleStatus)).toEqual(['met', 'met'])
  expect(result.decisionReady).toBe(true)
})

test('reports every exposure-integrity defect without assigning the invalid row, and duplicate is only a warning', () => {
  const facts = balancedFacts()
  facts.push(
    exposure('c0', 'control', 20),
    exposure('c0', 'treatment', 21),
    exposure('bad-version', 'control', 22, { experiment_definition_version: 6 }),
    exposure('unknown', 'does-not-exist', 23),
    { ...exposure('missing', 'control', 24), subjectId: null },
    { ...exposure('wrong', 'control', 25), subjectType: 'user' },
    exposure('ineligible', 'control', 26, { region: 'us' }),
    exposure('late', 'control', 50),
  )
  const result = computeExperimentAnalysis(input(facts))
  expect(result.diagnostics.integrity).toEqual(expect.arrayContaining([
    { code: 'duplicate_exposure', severity: 'warning', count: 1 },
    { code: 'cross_variant_exposure', severity: 'blocker', count: 1 },
    { code: 'version_mismatch', severity: 'blocker', count: 1 },
    { code: 'unknown_variant', severity: 'blocker', count: 1 },
    { code: 'missing_or_wrong_subject', severity: 'blocker', count: 2 },
    { code: 'eligibility_mismatch', severity: 'blocker', count: 1 },
    { code: 'out_of_window_exposure', severity: 'warning', count: 1 },
  ]))
  expect(result.variants.map((variant) => variant.observedSubjects)).toEqual([5, 5])
  expect(result.decisionReady).toBe(false)
  expect(result.blockers).toContain('cross_variant_exposure')
})

test('uses Pearson SRM, blocks detected and low-expected distributions, and freezes at lifecycle end', () => {
  const skewed: ExperimentAnalysisFact[] = []
  for (let n = 0; n < 19; n += 1) skewed.push(exposure(`t${n}`, 'treatment', 2 + n))
  skewed.push(exposure('c', 'control', 30))
  const skew = computeExperimentAnalysis(input(skewed))
  expect(skew.diagnostics.srm).toMatchObject({ status: 'detected', alpha: 0.01 })
  expect(skew.diagnostics.srm.pValue).toBeLessThan(0.01)
  expect(skew.blockers).toContain('srm_detected')

  const tiny = computeExperimentAnalysis(input([exposure('c', 'control', 2), exposure('t', 'treatment', 3)]))
  expect(tiny.diagnostics.srm).toMatchObject({ status: 'not_evaluable', chiSquare: null, pValue: null })
  expect(tiny.blockers).toContain('srm_not_evaluable')

  const stopped = computeExperimentAnalysis(input([
    ...balancedFacts(), exposure('after-stop', 'control', 25),
  ], { lifecycle: { status: 'stopped', startedAt: at(1), endedAt: at(20) } }))
  expect(stopped.window.endAt).toBe(at(20))
  expect(stopped.diagnostics.integrity).toContainEqual({ code: 'out_of_window_exposure', severity: 'warning', count: 1 })
})

test('bounds segments, redacts unsafe cuts, and reports freshness/addressability without identifiers or raw tags', () => {
  const facts = balancedFacts().map((fact, index) => ({ ...fact, tags: { ...fact.tags, plan: index % 2 === 0 ? 'pro' : 'starter' } }))
  const safe = computeExperimentAnalysis(input(facts, { segment: { field: 'plan', value: 'pro' } }))
  expect(safe.segment).toMatchObject({ status: 'suppressed_small_cell' })
  expect(JSON.stringify(safe)).not.toContain('c0')
  expect(JSON.stringify(safe)).not.toContain('mx')

  const cardinalFacts = Array.from({ length: 21 }, (_, n) => exposure(`card-${n}`, n % 2 === 0 ? 'control' : 'treatment', 2, { plan: `p${n}` }))
  const cardinal = computeExperimentAnalysis(input(cardinalFacts, { segment: { field: 'plan', value: 'p0' } }))
  expect(cardinal.segment).toEqual({ status: 'suppressed_cardinality' })
  const undeclared = computeExperimentAnalysis(input(facts, { segment: { field: 'source', value: 'email' } }))
  expect(undeclared.segment).toEqual({ status: 'undeclared' })

  const staleFacts = [{ ...exposure('old', 'control', 2), createdAt: at(2), occurredAt: at(2) }]
  const stale = computeExperimentAnalysis(input(staleFacts, { asOf: '2026-07-03T00:00:00.000000Z' }))
  expect(stale.freshness).toMatchObject({ latestReceiptAt: at(2), staleAfterHours: 24, isStale: true })
  expect(stale.primaryMetric.addressability).toEqual({
    candidateEvents: 0,
    addressableEvents: 0,
    joinedEvents: 0,
    attributedSubjects: 0,
    coverage: null,
  })
})

test('analysis request parser captures a bounded immutable version, snapshot and exact scalar segment', () => {
  expect(parseExperimentAnalysisRequest({
    version: '7',
    asOf: '2026-07-01T00:00:50.000000Z',
    segmentField: 'plan',
    segmentValue: 'true',
  }, at(60))).toEqual({
    ok: true,
    request: {
      version: 7,
      asOf: at(50),
      segment: { field: 'plan', value: true },
    },
  })
  expect(parseExperimentAnalysisRequest({
    version: 7,
    segmentField: 'plan',
    segmentValue: '"true"',
  }, at(60))).toMatchObject({
    ok: true,
    request: { segment: { field: 'plan', value: 'true' } },
  })
  for (const request of [
    { version: '0' },
    { version: '7', asOf: at(61) },
    { version: '7', segmentField: 'email', segmentValue: 'person@example.test' },
    { version: '7', segmentField: 'plan' },
    { version: '7', segmentField: 'plan', segmentValue: '1.5' },
  ]) expect(parseExperimentAnalysisRequest(request, at(60)).ok).toBe(false)
})
