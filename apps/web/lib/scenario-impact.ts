import type { ExperimentAnalysisResult } from './experiment-analysis'
import type { ScenarioCohort } from './scenario-definition'

export type ScenarioImpactInput = {
  generatedAt: string
  scenario: { key: string; definitionVersion: number; runId: string; runRevision: number }
  flag: { key: string; definitionVersion: number }
  experiment: { key: string; definitionVersion: number }
  cohort: ScenarioCohort
  technical: {
    control: { attempts: number; failures: number; latencyP95Ms: number | null }
    fault: { attempts: number; failures: number; latencyP95Ms: number | null }
  }
  canonicalAnalysis: ExperimentAnalysisResult
  relatedEvidence: {
    errorSignalIds: string[]
    frictionSignalIds: string[]
    taskIds: string[]
  }
}

export type ScenarioImpactEvidence = ScenarioImpactInput & {
  contractVersion: 1
  technical: ScenarioImpactInput['technical'] & {
    nonZeroDifference: boolean
    failureRateDelta: number | null
    latencyP95DeltaMs: number | null
  }
  claim: {
    status:
      | 'blocked_missing_outcome'
      | 'blocked_integrity'
      | 'blocked_sample'
      | 'internal_noncausal'
      | 'causal_eligible'
    causal: boolean
    blockers: string[]
  }
}

function rate(failures: number, attempts: number): number | null {
  return attempts === 0 ? null : failures / attempts
}

function validCounter(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0
}

function validateArm(arm: ScenarioImpactInput['technical']['control']): void {
  if (
    !validCounter(arm.attempts) ||
    !validCounter(arm.failures) ||
    arm.failures > arm.attempts ||
    (arm.latencyP95Ms !== null && (!Number.isFinite(arm.latencyP95Ms) || arm.latencyP95Ms < 0))
  ) {
    throw new Error('Invalid scenario technical evidence')
  }
}

function missingOutcome(analysis: ExperimentAnalysisResult): boolean {
  return (
    analysis.primaryMetric.addressability.joinedEvents === 0 ||
    analysis.primaryMetric.variants.every((variant) => variant.convertedSubjects === 0)
  )
}

/**
 * Wraps the canonical experiment result; it never recomputes product metrics. The only arithmetic
 * here compares bounded scenario execution outcomes, which are technical drill evidence.
 */
export function buildScenarioImpactEvidence(input: ScenarioImpactInput): ScenarioImpactEvidence {
  validateArm(input.technical.control)
  validateArm(input.technical.fault)
  const controlFailureRate = rate(input.technical.control.failures, input.technical.control.attempts)
  const faultFailureRate = rate(input.technical.fault.failures, input.technical.fault.attempts)
  const failureRateDelta =
    controlFailureRate === null || faultFailureRate === null ? null : faultFailureRate - controlFailureRate
  const latencyP95DeltaMs =
    input.technical.control.latencyP95Ms === null || input.technical.fault.latencyP95Ms === null
      ? null
      : input.technical.fault.latencyP95Ms - input.technical.control.latencyP95Ms
  const nonZeroDifference =
    (failureRateDelta !== null && failureRateDelta !== 0) ||
    (latencyP95DeltaMs !== null && latencyP95DeltaMs !== 0)

  const blockers: string[] = [...input.canonicalAnalysis.blockers]
  let status: ScenarioImpactEvidence['claim']['status']
  if (missingOutcome(input.canonicalAnalysis)) {
    status = 'blocked_missing_outcome'
    blockers.push('missing_outcome')
  } else if (!input.canonicalAnalysis.integrityReady) {
    status = 'blocked_integrity'
  } else if (!input.canonicalAnalysis.decisionReady || input.canonicalAnalysis.sampleStatus !== 'met') {
    status = 'blocked_sample'
    blockers.push('insufficient_sample')
  } else if (input.cohort !== 'external') {
    status = 'internal_noncausal'
    blockers.push(`${input.cohort}_cohort`)
  } else {
    status = 'causal_eligible'
  }

  return {
    contractVersion: 1,
    ...input,
    technical: {
      ...input.technical,
      nonZeroDifference,
      failureRateDelta,
      latencyP95DeltaMs,
    },
    claim: {
      status,
      causal: status === 'causal_eligible',
      blockers: [...new Set(blockers)].sort(),
    },
  }
}
