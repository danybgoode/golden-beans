import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { ExperimentAnalysisResult } from './experiment-analysis.ts'
import { buildScenarioImpactEvidence, type ScenarioImpactInput } from './scenario-impact.ts'

function analysis(overrides: Partial<ExperimentAnalysisResult> = {}): ExperimentAnalysisResult {
  return {
    window: {
      startAt: '2026-07-29T01:00:00.000Z',
      endAt: '2026-07-29T02:00:00.000Z',
      asOf: '2026-07-29T02:00:00.000Z',
    },
    decisionReady: true,
    integrityReady: true,
    sampleStatus: 'met',
    blockers: [],
    variants: [
      { key: 'control', observedSubjects: 10, expectedSubjects: 10, minimumSampleStatus: 'met' },
      { key: 'fault', observedSubjects: 10, expectedSubjects: 10, minimumSampleStatus: 'met' },
    ],
    primaryMetric: {
      event: 'checkout_completed',
      direction: 'increase',
      variants: [
        {
          key: 'control',
          exposedSubjects: 10,
          convertedSubjects: 9,
          conversionRate: 0.9,
          absoluteDeltaFromControl: null,
          liftFromControl: null,
          directionalStatus: 'indeterminate',
        },
        {
          key: 'fault',
          exposedSubjects: 10,
          convertedSubjects: 7,
          conversionRate: 0.7,
          absoluteDeltaFromControl: -0.2,
          liftFromControl: -0.222,
          directionalStatus: 'unfavorable',
        },
      ],
      addressability: {
        candidateEvents: 16,
        addressableEvents: 16,
        joinedEvents: 16,
        attributedSubjects: 16,
        coverage: 1,
      },
    },
    guardrailMetrics: [],
    diagnostics: {
      srm: { status: 'clear', alpha: 0.01, chiSquare: 0, pValue: 1 },
      integrity: [],
      validExposureSubjects: 20,
    },
    freshness: {
      latestEffectiveFactAt: '2026-07-29T01:59:00.000Z',
      latestReceiptAt: '2026-07-29T01:59:00.000Z',
      staleAfterHours: 24,
      isStale: false,
    },
    segment: { status: 'not_requested' },
    ...overrides,
  }
}

function input(cohort: 'synthetic' | 'internal' | 'external' = 'internal'): ScenarioImpactInput {
  return {
    generatedAt: '2026-07-29T02:00:00.000Z',
    scenario: {
      key: 'checkout_probe',
      definitionVersion: 2,
      runId: '11111111-1111-4111-8111-111111111111',
      runRevision: 4,
    },
    flag: { key: 'resilience.checkout_probe', definitionVersion: 3 },
    experiment: { key: 'checkout_probe_impact', definitionVersion: 1 },
    cohort,
    technical: {
      control: { attempts: 10, failures: 0, latencyP95Ms: 100 },
      fault: { attempts: 10, failures: 2, latencyP95Ms: 350 },
    },
    canonicalAnalysis: analysis(),
    relatedEvidence: {
      errorSignalIds: ['signal-error'],
      frictionSignalIds: ['signal-friction'],
      taskIds: ['task-1'],
    },
  }
}

test('internal proof preserves canonical analysis but never becomes a causal customer claim', () => {
  const result = buildScenarioImpactEvidence(input())
  assert.equal(result.technical.nonZeroDifference, true)
  assert.equal(result.technical.failureRateDelta, 0.2)
  assert.equal(result.technical.latencyP95DeltaMs, 250)
  assert.deepEqual(result.canonicalAnalysis, input().canonicalAnalysis)
  assert.deepEqual(result.claim, {
    status: 'internal_noncausal',
    causal: false,
    blockers: ['internal_cohort'],
  })
  assert.deepEqual(result.relatedEvidence.taskIds, ['task-1'])
})

test('missing outcome, integrity and sample blockers fail closed before cohort eligibility', () => {
  const missing = input('external')
  missing.canonicalAnalysis.primaryMetric.addressability.joinedEvents = 0
  assert.equal(buildScenarioImpactEvidence(missing).claim.status, 'blocked_missing_outcome')

  const invalid = { ...input('external'), canonicalAnalysis: analysis({ integrityReady: false }) }
  assert.equal(buildScenarioImpactEvidence(invalid).claim.status, 'blocked_integrity')

  const small = {
    ...input('external'),
    canonicalAnalysis: analysis({ decisionReady: false, sampleStatus: 'below' }),
  }
  assert.equal(buildScenarioImpactEvidence(small).claim.status, 'blocked_sample')
})

test('only a ready external cohort can be marked causal-eligible', () => {
  const result = buildScenarioImpactEvidence(input('external'))
  assert.equal(result.claim.status, 'causal_eligible')
  assert.equal(result.claim.causal, true)
})

test('invalid technical counters are rejected rather than laundered into zero difference', () => {
  const invalid = input()
  invalid.technical.fault.failures = 11
  assert.throws(() => buildScenarioImpactEvidence(invalid))
})
