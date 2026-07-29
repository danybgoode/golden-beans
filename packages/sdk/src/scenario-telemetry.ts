// Flag-serving E5 · Sprint 3 — canonical scenario execution telemetry.
//
// This is deliberately a closed scalar-only contract. A resilience executor runs beside a live
// request seam; accepting arbitrary tags or metadata here would make it too easy to persist request
// bodies, credentials, or headers as "diagnostics".

export const SCENARIO_EXECUTED_EVENT = 'scenario_executed'

export type ScenarioExecutionTelemetryInput = {
  scenarioKey: string
  scenarioVersion: number
  runId: string
  runRevision: number
  targetKey: string
  leaseId: string
  cohort: 'synthetic' | 'internal' | 'external'
  environment: 'development' | 'preview' | 'production'
  arm: 'control' | 'fault'
  faultKind: 'none' | 'delay' | 'synthetic_error'
  failed: boolean
  latencyMs: number
  subject: { type: string; id: string }
  flag: {
    key: string
    definitionVersion: number
    variant: string
    reason: string
    snapshotVersion: number
  }
  experiment?: { key: string; definitionVersion: number }
}

const KEY = /^[a-z][a-z0-9_.-]{0,127}$/
const ENTITY_TYPE = /^[a-z][a-z0-9_]{0,63}$/
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const SCALAR_TEXT = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const CONTROL_CHARS = /\p{Cc}/u
const MAX_LATENCY_MS = 300_000

function onlyKeys(value: object, allowed: readonly string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function validText(value: unknown, pattern: RegExp = KEY): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !CONTROL_CHARS.test(value) &&
    pattern.test(value)
  )
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647
}

export function validateScenarioExecutionTelemetry(input: unknown): input is ScenarioExecutionTelemetryInput {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false
  const value = input as Partial<ScenarioExecutionTelemetryInput>
  if (
    !onlyKeys(value, [
      'scenarioKey',
      'scenarioVersion',
      'runId',
      'runRevision',
      'targetKey',
      'leaseId',
      'cohort',
      'environment',
      'arm',
      'faultKind',
      'failed',
      'latencyMs',
      'subject',
      'flag',
      'experiment',
    ])
  )
    return false
  if (
    !validText(value.scenarioKey) ||
    !validVersion(value.scenarioVersion) ||
    !validText(value.runId, UUID) ||
    !validVersion(value.runRevision) ||
    !validText(value.targetKey) ||
    !validText(value.leaseId, UUID) ||
    (value.cohort !== 'synthetic' && value.cohort !== 'internal' && value.cohort !== 'external') ||
    (value.environment !== 'development' &&
      value.environment !== 'preview' &&
      value.environment !== 'production') ||
    (value.arm !== 'control' && value.arm !== 'fault') ||
    (value.faultKind !== 'none' && value.faultKind !== 'delay' && value.faultKind !== 'synthetic_error') ||
    typeof value.failed !== 'boolean' ||
    typeof value.latencyMs !== 'number' ||
    !Number.isInteger(value.latencyMs) ||
    value.latencyMs < 0 ||
    value.latencyMs > MAX_LATENCY_MS
  )
    return false
  if (value.arm === 'control' && value.faultKind !== 'none') return false
  if (value.arm === 'fault' && value.faultKind === 'none') return false

  const subject = value.subject
  if (
    subject === null ||
    typeof subject !== 'object' ||
    Array.isArray(subject) ||
    !onlyKeys(subject, ['type', 'id']) ||
    !validText(subject.type, ENTITY_TYPE) ||
    !validText(subject.id, OPAQUE_ID)
  )
    return false

  const flag = value.flag
  if (
    flag === null ||
    typeof flag !== 'object' ||
    Array.isArray(flag) ||
    !onlyKeys(flag, ['key', 'definitionVersion', 'variant', 'reason', 'snapshotVersion']) ||
    !validText(flag.key) ||
    !validVersion(flag.definitionVersion) ||
    !validText(flag.variant, SCALAR_TEXT) ||
    !validText(flag.reason, SCALAR_TEXT) ||
    !validVersion(flag.snapshotVersion)
  )
    return false

  if (value.experiment === undefined) return true
  const experiment = value.experiment
  return (
    experiment !== null &&
    typeof experiment === 'object' &&
    !Array.isArray(experiment) &&
    onlyKeys(experiment, ['key', 'definitionVersion']) &&
    validText(experiment.key) &&
    validVersion(experiment.definitionVersion)
  )
}
