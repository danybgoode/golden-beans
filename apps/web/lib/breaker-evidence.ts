import type { BreakerPolicyDefinition } from './breaker-policy'
import type { ScenarioImpactEvidence } from './scenario-impact'

export type BreakerEvidenceResolution =
  | {
      eligible: true
      reason: 'threshold_crossed'
      observedBasisPoints: number
      metricEvent: string
    }
  | {
      eligible: false
      reason:
        | 'reference_mismatch'
        | 'evidence_expired'
        | 'integrity_blocked'
        | 'sample_blocked'
        | 'metric_missing'
        | 'threshold_not_crossed'
      observedBasisPoints: number | null
      metricEvent: string
    }

function exactReferences(policy: BreakerPolicyDefinition, evidence: ScenarioImpactEvidence): boolean {
  return (
    evidence.scenario.key === policy.evidence.scenario.key &&
    evidence.scenario.definitionVersion === policy.evidence.scenario.definitionVersion &&
    evidence.flag.key === policy.flag.key &&
    evidence.flag.definitionVersion === policy.flag.definitionVersion &&
    evidence.experiment.key === policy.evidence.experiment.key &&
    evidence.experiment.definitionVersion === policy.evidence.experiment.definitionVersion
  )
}

export function resolveBreakerEvidence(
  policy: BreakerPolicyDefinition,
  evidence: ScenarioImpactEvidence,
  nowMs: number
): BreakerEvidenceResolution {
  const metricEvent = policy.evidence.metricEvent
  if (!exactReferences(policy, evidence)) {
    return { eligible: false, reason: 'reference_mismatch', observedBasisPoints: null, metricEvent }
  }
  const generatedAt = Date.parse(evidence.generatedAt)
  if (
    !Number.isFinite(generatedAt) ||
    !Number.isFinite(nowMs) ||
    generatedAt > nowMs ||
    nowMs - generatedAt > policy.windowSeconds * 1_000
  ) {
    return { eligible: false, reason: 'evidence_expired', observedBasisPoints: null, metricEvent }
  }
  if (!evidence.canonicalAnalysis.integrityReady) {
    return { eligible: false, reason: 'integrity_blocked', observedBasisPoints: null, metricEvent }
  }
  if (
    !evidence.canonicalAnalysis.decisionReady ||
    evidence.canonicalAnalysis.sampleStatus !== 'met' ||
    evidence.canonicalAnalysis.variants.some(
      (variant) => variant.observedSubjects < policy.evidence.minimumSamplePerVariant
    )
  ) {
    return { eligible: false, reason: 'sample_blocked', observedBasisPoints: null, metricEvent }
  }

  const metrics =
    policy.evidence.metricRole === 'primary'
      ? [evidence.canonicalAnalysis.primaryMetric]
      : evidence.canonicalAnalysis.guardrailMetrics
  const metric = metrics.find((candidate) => candidate.event === metricEvent)
  if (!metric) {
    return { eligible: false, reason: 'metric_missing', observedBasisPoints: null, metricEvent }
  }
  const observed = metric.variants
    .filter((variant) => variant.absoluteDeltaFromControl !== null)
    .map((variant) => Math.round(variant.absoluteDeltaFromControl! * 10_000))
  if (observed.length === 0) {
    return { eligible: false, reason: 'metric_missing', observedBasisPoints: null, metricEvent }
  }
  const observedBasisPoints =
    policy.evidence.adverseDirection === 'increase' ? Math.max(...observed) : Math.min(...observed)
  const crossed =
    policy.evidence.adverseDirection === 'increase'
      ? observedBasisPoints >= policy.evidence.thresholdBasisPoints
      : observedBasisPoints <= -policy.evidence.thresholdBasisPoints
  return crossed
    ? { eligible: true, reason: 'threshold_crossed', observedBasisPoints, metricEvent }
    : {
        eligible: false,
        reason: 'threshold_not_crossed',
        observedBasisPoints,
        metricEvent,
      }
}
