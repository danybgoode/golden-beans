// Pure form-to-contract seam. The browser never assembles a looser shape than the SDK parser, and
// every numeric ceiling is a direct reference to that public runtime contract.
import {
  MAX_SCENARIO_ABORT_FAILURES,
  MAX_SCENARIO_CONCURRENCY_CAP,
  MAX_SCENARIO_DURATION_SECONDS,
  MAX_SCENARIO_ERROR_RATE_BASIS_POINTS,
  MAX_SCENARIO_LEASE_TTL_SECONDS,
  MAX_SCENARIO_REQUEST_CAP,
  SCENARIO_CONTRACT_VERSION,
  parseScenarioDefinition,
  type ScenarioCohort,
  type ScenarioDefinition,
  type ScenarioKind,
  type ScenarioSecurityTemplate,
} from './scenario-definition'
import { percentToBasisPoints } from './rollout-percent'

export const SCENARIO_AUTHORING_COHORTS = [
  'synthetic',
  'internal',
] as const satisfies readonly ScenarioCohort[]
export const SCENARIO_AUTHORING_LIMITS = {
  durationSeconds: MAX_SCENARIO_DURATION_SECONDS,
  requestCap: MAX_SCENARIO_REQUEST_CAP,
  concurrencyCap: MAX_SCENARIO_CONCURRENCY_CAP,
  leaseTtlSeconds: MAX_SCENARIO_LEASE_TTL_SECONDS,
  abortAfterFailures: MAX_SCENARIO_ABORT_FAILURES,
  errorRateBasisPoints: MAX_SCENARIO_ERROR_RATE_BASIS_POINTS,
} as const

export type ScenarioAuthoringDraft = {
  kind: ScenarioKind
  cohort: (typeof SCENARIO_AUTHORING_COHORTS)[number]
  targetKey: string
  environment: 'development' | 'preview' | 'production'
  startAt: string
  durationSeconds: number
  requestCap: number
  concurrencyCap: number
  leaseTtlSeconds: number
  abortAfterFailures: number
  maxErrorRatePercent: number
  flagKey: string
  flagVersion: number
  securityTemplate?: ScenarioSecurityTemplate
}

export type ScenarioAuthoringResult =
  | { ok: true; definition: ScenarioDefinition }
  | { ok: false; field: keyof ScenarioAuthoringDraft | 'definition'; error: string }

function bounded(value: number, maximum: number): boolean {
  return Number.isSafeInteger(value) && value >= 1 && value <= maximum
}

export function buildScenarioDefinition(draft: ScenarioAuthoringDraft): ScenarioAuthoringResult {
  if (!SCENARIO_AUTHORING_COHORTS.includes(draft.cohort))
    return { ok: false, field: 'cohort', error: 'External cohorts require the credential approval flow.' }
  if (!bounded(draft.durationSeconds, SCENARIO_AUTHORING_LIMITS.durationSeconds))
    return { ok: false, field: 'durationSeconds', error: 'Duration is outside the bounded scenario limit.' }
  if (!bounded(draft.requestCap, SCENARIO_AUTHORING_LIMITS.requestCap))
    return { ok: false, field: 'requestCap', error: 'Request cap is outside the bounded scenario limit.' }
  if (!bounded(draft.concurrencyCap, SCENARIO_AUTHORING_LIMITS.concurrencyCap))
    return { ok: false, field: 'concurrencyCap', error: 'Concurrency is outside the bounded scenario limit.' }
  if (draft.concurrencyCap > draft.requestCap)
    return { ok: false, field: 'concurrencyCap', error: 'Concurrency cannot exceed the request cap.' }
  if (!bounded(draft.leaseTtlSeconds, SCENARIO_AUTHORING_LIMITS.leaseTtlSeconds))
    return { ok: false, field: 'leaseTtlSeconds', error: 'Lease TTL is outside the bounded scenario limit.' }
  if (!bounded(draft.abortAfterFailures, SCENARIO_AUTHORING_LIMITS.abortAfterFailures))
    return {
      ok: false,
      field: 'abortAfterFailures',
      error: 'Failure guardrail is outside the bounded limit.',
    }
  const basisPoints = percentToBasisPoints(draft.maxErrorRatePercent)
  if (basisPoints === null || basisPoints < 1)
    return { ok: false, field: 'maxErrorRatePercent', error: 'Error rate must be from 0.01% to 100%.' }
  const start = Date.parse(draft.startAt)
  if (!Number.isFinite(start)) return { ok: false, field: 'startAt', error: 'Start time is invalid.' }
  const startAt = new Date(start).toISOString()
  const expiresAt = new Date(start + draft.durationSeconds * 1_000).toISOString()
  const candidate = {
    contractVersion: SCENARIO_CONTRACT_VERSION,
    kind: draft.kind,
    targetKey: draft.targetKey,
    environment: draft.environment,
    cohort: draft.cohort,
    startAt,
    expiresAt,
    limits: {
      requestCap: draft.requestCap,
      concurrencyCap: draft.concurrencyCap,
      leaseTtlSeconds: draft.leaseTtlSeconds,
    },
    guardrails: {
      abortAfterFailures: draft.abortAfterFailures,
      maxErrorRateBasisPoints: basisPoints,
    },
    flag: { key: draft.flagKey, definitionVersion: draft.flagVersion },
    ...(draft.kind === 'security' && draft.securityTemplate
      ? { securityTemplate: draft.securityTemplate }
      : {}),
  }
  const parsed = parseScenarioDefinition(candidate)
  return parsed.ok
    ? { ok: true, definition: parsed.definition }
    : { ok: false, field: 'definition', error: parsed.errors[0] ?? 'Scenario definition is invalid.' }
}
