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

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

function nullableFiniteNumber(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isFinite(value))
}

function storedArm(value: unknown): boolean {
  if (!record(value)) return false
  return (
    typeof value.attempts === 'number' &&
    typeof value.failures === 'number' &&
    validCounter(value.attempts) &&
    validCounter(value.failures) &&
    value.failures <= value.attempts &&
    nullableFiniteNumber(value.latencyP95Ms)
  )
}

/**
 * Stored evidence is JSON and can outlive its writer. Parse every field the dashboard relies on,
 * plus the immutable references and provenance that make the evidence contract meaningful, before
 * allowing a render to dereference it. Unknown additive fields remain forward-compatible.
 */
export function parseScenarioImpactEvidence(value: unknown): ScenarioImpactEvidence | null {
  if (!record(value) || value.contractVersion !== 1 || typeof value.generatedAt !== 'string') return null
  const scenario = record(value.scenario) ? value.scenario : null
  const flag = record(value.flag) ? value.flag : null
  const experiment = record(value.experiment) ? value.experiment : null
  const technical = record(value.technical) ? value.technical : null
  const claim = record(value.claim) ? value.claim : null
  const related = record(value.relatedEvidence) ? value.relatedEvidence : null
  const claimStatuses: ScenarioImpactEvidence['claim']['status'][] = [
    'blocked_missing_outcome',
    'blocked_integrity',
    'blocked_sample',
    'internal_noncausal',
    'causal_eligible',
  ]
  if (
    !scenario ||
    typeof scenario.key !== 'string' ||
    !Number.isSafeInteger(scenario.definitionVersion) ||
    typeof scenario.runId !== 'string' ||
    !Number.isSafeInteger(scenario.runRevision) ||
    !flag ||
    typeof flag.key !== 'string' ||
    !Number.isSafeInteger(flag.definitionVersion) ||
    !experiment ||
    typeof experiment.key !== 'string' ||
    !Number.isSafeInteger(experiment.definitionVersion) ||
    (value.cohort !== 'synthetic' && value.cohort !== 'internal' && value.cohort !== 'external') ||
    !technical ||
    !storedArm(technical.control) ||
    !storedArm(technical.fault) ||
    typeof technical.nonZeroDifference !== 'boolean' ||
    !nullableFiniteNumber(technical.failureRateDelta) ||
    !nullableFiniteNumber(technical.latencyP95DeltaMs) ||
    !record(value.canonicalAnalysis) ||
    !related ||
    !stringArray(related.errorSignalIds) ||
    !stringArray(related.frictionSignalIds) ||
    !stringArray(related.taskIds) ||
    !claim ||
    !claimStatuses.includes(claim.status as ScenarioImpactEvidence['claim']['status']) ||
    typeof claim.causal !== 'boolean' ||
    !stringArray(claim.blockers)
  )
    return null
  return value as ScenarioImpactEvidence
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
