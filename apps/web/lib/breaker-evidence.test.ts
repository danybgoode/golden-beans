import assert from 'node:assert/strict'
import { test } from 'node:test'
import type { BreakerPolicyDefinition } from './breaker-policy.ts'
import type { ScenarioImpactEvidence } from './scenario-impact.ts'
import { resolveBreakerEvidence } from './breaker-evidence.ts'

const NOW = Date.parse('2026-07-29T02:00:00.000Z')
const POLICY: BreakerPolicyDefinition = {
  contractVersion: 1,
  flag: {
    key: 'disposable.safe_flag',
    definitionVersion: 2,
    protectiveVariantKey: 'off',
    protectiveDirection: 'disable',
  },
  evidence: {
    resolver: 'scenario_impact_v1',
    scenario: { key: 'probe', definitionVersion: 3 },
    experiment: { key: 'probe_impact', definitionVersion: 1 },
    metricRole: 'guardrail',
    metricEvent: 'checkout_failed',
    adverseDirection: 'increase',
    thresholdBasisPoints: 1_000,
    minimumSamplePerVariant: 10,
    requiredIntegrity: 'valid',
  },
  windowSeconds: 900,
  cooldownSeconds: 3_600,
  maxTrips: 1,
  riskClass: 'standard',
  confirmationMode: 'owner_preapproved_emergency',
}

function evidence(delta = 0.15): ScenarioImpactEvidence {
  return {
    contractVersion: 1,
    generatedAt: '2026-07-29T01:59:00.000Z',
    scenario: {
      key: 'probe',
      definitionVersion: 3,
      runId: '11111111-1111-4111-8111-111111111111',
      runRevision: 5,
    },
    // This is the scenario's closed fault-payload flag, not the business flag the breaker
    // protects. The immutable scenario version binds it independently.
    flag: { key: 'resilience.probe_payload', definitionVersion: 7 },
    experiment: { key: 'probe_impact', definitionVersion: 1 },
    cohort: 'internal',
    technical: {
      control: { attempts: 10, failures: 0, latencyP95Ms: 100 },
      fault: { attempts: 10, failures: 2, latencyP95Ms: 300 },
      nonZeroDifference: true,
      failureRateDelta: 0.2,
      latencyP95DeltaMs: 200,
    },
    canonicalAnalysis: {
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
        {
          key: 'control',
          observedSubjects: 10,
          expectedSubjects: 10,
          minimumSampleStatus: 'met',
        },
        {
          key: 'fault',
          observedSubjects: 10,
          expectedSubjects: 10,
          minimumSampleStatus: 'met',
        },
      ],
      primaryMetric: {
        event: 'checkout_completed',
        direction: 'increase',
        variants: [],
        addressability: {
          candidateEvents: 10,
          addressableEvents: 10,
          joinedEvents: 10,
          attributedSubjects: 10,
          coverage: 1,
        },
      },
      guardrailMetrics: [
        {
          event: 'checkout_failed',
          direction: 'decrease',
          variants: [
            {
              key: 'control',
              exposedSubjects: 10,
              convertedSubjects: 0,
              conversionRate: 0,
              absoluteDeltaFromControl: null,
              liftFromControl: null,
              directionalStatus: 'indeterminate',
            },
            {
              key: 'fault',
              exposedSubjects: 10,
              convertedSubjects: 2,
              conversionRate: 0.2,
              absoluteDeltaFromControl: delta,
              liftFromControl: null,
              directionalStatus: 'unfavorable',
            },
          ],
          addressability: {
            candidateEvents: 2,
            addressableEvents: 2,
            joinedEvents: 2,
            attributedSubjects: 2,
            coverage: 1,
          },
        },
      ],
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
    },
    relatedEvidence: { errorSignalIds: [], frictionSignalIds: [], taskIds: [] },
    claim: { status: 'internal_noncausal', causal: false, blockers: ['internal_cohort'] },
  }
}

test('an exact, fresh, integrity-valid threshold crossing is eligible even when honestly internal', () => {
  assert.deepEqual(resolveBreakerEvidence(POLICY, evidence(), NOW), {
    eligible: true,
    reason: 'threshold_crossed',
    observedBasisPoints: 1_500,
    metricEvent: 'checkout_failed',
  })
})

test('the breaker flag is independent from the scenario fault-payload flag', () => {
  const result = evidence()
  result.flag = { key: 'resilience.another_payload', definitionVersion: 9 }
  assert.equal(resolveBreakerEvidence(POLICY, result, NOW).reason, 'threshold_crossed')
})

test('reference, freshness, integrity, sample and metric checks independently fail closed', () => {
  const mismatched = evidence()
  mismatched.scenario.definitionVersion = 99
  assert.equal(resolveBreakerEvidence(POLICY, mismatched, NOW).reason, 'reference_mismatch')

  assert.equal(resolveBreakerEvidence(POLICY, evidence(), NOW + 901_000).reason, 'evidence_expired')

  const invalid = evidence()
  invalid.canonicalAnalysis.integrityReady = false
  assert.equal(resolveBreakerEvidence(POLICY, invalid, NOW).reason, 'integrity_blocked')

  const small = evidence()
  small.canonicalAnalysis.variants[1].observedSubjects = 9
  assert.equal(resolveBreakerEvidence(POLICY, small, NOW).reason, 'sample_blocked')

  const missing = evidence()
  missing.canonicalAnalysis.guardrailMetrics = []
  assert.equal(resolveBreakerEvidence(POLICY, missing, NOW).reason, 'metric_missing')
})

test('a real but sub-threshold delta does not trip', () => {
  assert.deepEqual(resolveBreakerEvidence(POLICY, evidence(0.0999), NOW), {
    eligible: false,
    reason: 'threshold_not_crossed',
    observedBasisPoints: 999,
    metricEvent: 'checkout_failed',
  })
})
