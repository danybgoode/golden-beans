// Resilience scenario v1 — import-safe, closed contracts plus local fault evaluation.
//
// Scenario delivery is deliberately separate from the ordinary flag snapshot. A scenario carries
// one exact immutable JSON flag definition, but a consumer must opt into this provider and then
// explicitly execute the returned fault at one compiled target. Ordinary boolean `isEnabled()`
// callers can therefore never acquire fault behavior by accident.
import {
  evaluateFlag,
  isFlagEnvironment,
  parseFlagDefinition,
  validateFlagKey,
  type FlagDefinition,
  type FlagEnvironment,
  type FlagEvaluationContext,
} from './flags'

export const SCENARIO_CONTRACT_VERSION = 1 as const
export const MAX_SCENARIO_DEFINITION_BYTES = 64 * 1024
export const MAX_SCENARIO_SNAPSHOT_BYTES = 256 * 1024
export const MAX_SCENARIOS_PER_SNAPSHOT = 50
export const MAX_SCENARIO_DURATION_SECONDS = 60 * 60
export const MAX_SCENARIO_REQUEST_CAP = 100
export const MAX_SCENARIO_CONCURRENCY_CAP = 5
export const MAX_SCENARIO_LEASE_TTL_SECONDS = 30
export const MAX_SCENARIO_ABORT_FAILURES = 10
export const MAX_SCENARIO_DELAY_MS = 2_000
export const MAX_SCENARIO_ERROR_RATE_BASIS_POINTS = 10_000

const SCENARIO_KEY = /^[a-z][a-z0-9_-]{0,63}$/
const TARGET_KEY = /^[a-z][a-z0-9_.-]{0,127}$/
const RUN_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/

export const SCENARIO_COHORTS = ['synthetic', 'internal', 'external'] as const
export const SCENARIO_KINDS = ['resilience', 'security'] as const
export const SCENARIO_FAULT_KINDS = ['none', 'delay', 'synthetic_error'] as const
export const SCENARIO_SECURITY_TEMPLATES = [
  'malformed_payload_v1',
  'rate_limit_v1',
  'invalid_credential_v1',
  'revoked_credential_v1',
] as const
export type ScenarioCohort = (typeof SCENARIO_COHORTS)[number]
export type ScenarioSecurityTemplate = (typeof SCENARIO_SECURITY_TEMPLATES)[number]
export type ScenarioKind = (typeof SCENARIO_KINDS)[number]
export type ScenarioFaultKind = (typeof SCENARIO_FAULT_KINDS)[number]

export type ScenarioFault =
  | { kind: 'none' }
  | { kind: 'delay'; delayMs: number }
  | { kind: 'synthetic_error'; errorCode: 'GB_RESILIENCE_503' }

export type ScenarioLimits = {
  requestCap: number
  concurrencyCap: number
  leaseTtlSeconds: number
}

export type ScenarioGuardrails = {
  abortAfterFailures: number
  maxErrorRateBasisPoints: number
}

export type ScenarioFlagReference = {
  key: string
  definitionVersion: number
}

export type ScenarioExperimentReference = {
  key: string
  definitionVersion: number
}

export type ScenarioDefinition = {
  contractVersion: 1
  kind: ScenarioKind
  targetKey: string
  environment: FlagEnvironment
  cohort: ScenarioCohort
  startAt: string
  expiresAt: string
  limits: ScenarioLimits
  guardrails: ScenarioGuardrails
  flag: ScenarioFlagReference
  experiment?: ScenarioExperimentReference
  securityTemplate?: ScenarioSecurityTemplate
}

export type ScenarioSnapshotEntry = {
  scenarioKey: string
  scenarioVersion: number
  runId: string
  runRevision: number
  targetKey: string
  cohort: ScenarioCohort
  startAt: string
  expiresAt: string
  limits: ScenarioLimits
  guardrails: ScenarioGuardrails
  flag: {
    key: string
    definitionVersion: number
    definition: FlagDefinition
  }
  experiment?: ScenarioExperimentReference
}

export type ScenarioSnapshot = {
  contractVersion: 1
  environment: FlagEnvironment
  revision: number
  generatedAt: string
  scenarios: ScenarioSnapshotEntry[]
}

export type ScenarioDefinitionResult =
  { ok: true; definition: ScenarioDefinition } | { ok: false; errors: string[] }

export type ScenarioSnapshotResult =
  { ok: true; snapshot: ScenarioSnapshot } | { ok: false; errors: string[] }

export type ScenarioResolution = {
  value: ScenarioFault
  reason:
    | 'MATCH'
    | 'CONTROL'
    | 'TARGET_MISMATCH'
    | 'NOT_STARTED'
    | 'EXPIRED'
    | 'INVALID_CONTEXT'
    | 'INVALID_SCENARIO'
  scenarioKey?: string
  scenarioVersion?: number
  runId?: string
  runRevision?: number
  flagVersion?: number
  variant?: string
  cohort?: ScenarioCohort
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[]
) {
  const accepted = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!accepted.has(key)) errors.push(`${path}.${key} is not allowed`)
  }
}

function byteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function boundedInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= minimum && value <= maximum
}

function validVersion(value: unknown): value is number {
  return boundedInteger(value, 1, Number.MAX_SAFE_INTEGER)
}

function validScenarioKey(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && SCENARIO_KEY.test(value)
}

function validTargetKey(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && TARGET_KEY.test(value)
}

function validRunId(value: unknown): value is string {
  return typeof value === 'string' && RUN_ID.test(value)
}

function parseUtcInstant(value: unknown): number | null {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value) || value.startsWith('0000-')) return null
  const epoch = Date.parse(value)
  if (!Number.isFinite(epoch)) return null
  return new Date(epoch).toISOString() === value ? epoch : null
}

function parseLimits(value: unknown, path: string, errors: string[]): ScenarioLimits | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  rejectUnknownKeys(value, ['requestCap', 'concurrencyCap', 'leaseTtlSeconds'], path, errors)
  if (!boundedInteger(value.requestCap, 1, MAX_SCENARIO_REQUEST_CAP)) {
    errors.push(`${path}.requestCap must be an integer from 1 to ${MAX_SCENARIO_REQUEST_CAP}`)
  }
  if (!boundedInteger(value.concurrencyCap, 1, MAX_SCENARIO_CONCURRENCY_CAP)) {
    errors.push(`${path}.concurrencyCap must be an integer from 1 to ${MAX_SCENARIO_CONCURRENCY_CAP}`)
  }
  if (!boundedInteger(value.leaseTtlSeconds, 1, MAX_SCENARIO_LEASE_TTL_SECONDS)) {
    errors.push(`${path}.leaseTtlSeconds must be an integer from 1 to ${MAX_SCENARIO_LEASE_TTL_SECONDS}`)
  }
  if (
    !boundedInteger(value.requestCap, 1, MAX_SCENARIO_REQUEST_CAP) ||
    !boundedInteger(value.concurrencyCap, 1, MAX_SCENARIO_CONCURRENCY_CAP) ||
    !boundedInteger(value.leaseTtlSeconds, 1, MAX_SCENARIO_LEASE_TTL_SECONDS)
  ) {
    return null
  }
  if (value.concurrencyCap > value.requestCap) {
    errors.push(`${path}.concurrencyCap cannot exceed requestCap`)
    return null
  }
  return {
    requestCap: value.requestCap,
    concurrencyCap: value.concurrencyCap,
    leaseTtlSeconds: value.leaseTtlSeconds,
  }
}

function parseGuardrails(value: unknown, path: string, errors: string[]): ScenarioGuardrails | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  rejectUnknownKeys(value, ['abortAfterFailures', 'maxErrorRateBasisPoints'], path, errors)
  if (!boundedInteger(value.abortAfterFailures, 1, MAX_SCENARIO_ABORT_FAILURES)) {
    errors.push(`${path}.abortAfterFailures must be an integer from 1 to ${MAX_SCENARIO_ABORT_FAILURES}`)
  }
  if (!boundedInteger(value.maxErrorRateBasisPoints, 1, MAX_SCENARIO_ERROR_RATE_BASIS_POINTS)) {
    errors.push(
      `${path}.maxErrorRateBasisPoints must be an integer from 1 to ${MAX_SCENARIO_ERROR_RATE_BASIS_POINTS}`
    )
  }
  return boundedInteger(value.abortAfterFailures, 1, MAX_SCENARIO_ABORT_FAILURES) &&
    boundedInteger(value.maxErrorRateBasisPoints, 1, MAX_SCENARIO_ERROR_RATE_BASIS_POINTS)
    ? {
        abortAfterFailures: value.abortAfterFailures,
        maxErrorRateBasisPoints: value.maxErrorRateBasisPoints,
      }
    : null
}

function parseFlagReference(value: unknown, path: string, errors: string[]): ScenarioFlagReference | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  rejectUnknownKeys(value, ['key', 'definitionVersion'], path, errors)
  if (!validateFlagKey(value.key)) errors.push(`${path}.key must be a valid flag key`)
  if (!validVersion(value.definitionVersion)) {
    errors.push(`${path}.definitionVersion must be a positive safe integer`)
  }
  return validateFlagKey(value.key) && validVersion(value.definitionVersion)
    ? { key: value.key, definitionVersion: value.definitionVersion }
    : null
}

function parseExperimentReference(
  value: unknown,
  path: string,
  errors: string[]
): ScenarioExperimentReference | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  rejectUnknownKeys(value, ['key', 'definitionVersion'], path, errors)
  if (!validScenarioKey(value.key)) errors.push(`${path}.key must be a valid experiment key`)
  if (!validVersion(value.definitionVersion)) {
    errors.push(`${path}.definitionVersion must be a positive safe integer`)
  }
  return validScenarioKey(value.key) && validVersion(value.definitionVersion)
    ? { key: value.key, definitionVersion: value.definitionVersion }
    : null
}

export function parseScenarioFault(input: unknown): ScenarioFault | null {
  if (!isRecord(input) || typeof input.kind !== 'string') return null
  if (input.kind === 'none') {
    if (Object.keys(input).length !== 1) return null
    return { kind: 'none' }
  }
  if (input.kind === 'delay') {
    if (Object.keys(input).length !== 2 || !boundedInteger(input.delayMs, 1, MAX_SCENARIO_DELAY_MS)) {
      return null
    }
    return { kind: 'delay', delayMs: input.delayMs }
  }
  if (input.kind === 'synthetic_error') {
    if (Object.keys(input).length !== 2 || input.errorCode !== 'GB_RESILIENCE_503') {
      return null
    }
    return { kind: 'synthetic_error', errorCode: 'GB_RESILIENCE_503' }
  }
  return null
}

export function parseScenarioDefinition(input: unknown): ScenarioDefinitionResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['definition must be an object'] }
  if (byteLength(input) > MAX_SCENARIO_DEFINITION_BYTES) {
    errors.push(`definition exceeds ${MAX_SCENARIO_DEFINITION_BYTES} bytes`)
  }
  rejectUnknownKeys(
    input,
    [
      'contractVersion',
      'kind',
      'targetKey',
      'environment',
      'cohort',
      'startAt',
      'expiresAt',
      'limits',
      'guardrails',
      'flag',
      'experiment',
      'securityTemplate',
    ],
    'definition',
    errors
  )

  if (input.contractVersion !== SCENARIO_CONTRACT_VERSION) {
    errors.push(`definition.contractVersion must be ${SCENARIO_CONTRACT_VERSION}`)
  }
  if (input.kind !== 'resilience' && input.kind !== 'security') {
    errors.push('definition.kind must be resilience or security')
  }
  if (!validTargetKey(input.targetKey)) {
    errors.push('definition.targetKey must be 1-128 lowercase target-key characters')
  }
  if (!isFlagEnvironment(input.environment)) {
    errors.push('definition.environment must be development, preview or production')
  }
  if (!(SCENARIO_COHORTS as readonly unknown[]).includes(input.cohort)) {
    errors.push('definition.cohort must be synthetic, internal or external')
  }

  const start = parseUtcInstant(input.startAt)
  const expiry = parseUtcInstant(input.expiresAt)
  if (start === null) errors.push('definition.startAt must be a canonical UTC timestamp')
  if (expiry === null) errors.push('definition.expiresAt must be a canonical UTC timestamp')
  if (start !== null && expiry !== null) {
    if (expiry <= start) errors.push('definition expiry must be after its start')
    if (expiry - start > MAX_SCENARIO_DURATION_SECONDS * 1_000) {
      errors.push(`definition duration cannot exceed ${MAX_SCENARIO_DURATION_SECONDS} seconds`)
    }
  }

  const limits = parseLimits(input.limits, 'definition.limits', errors)
  const guardrails = parseGuardrails(input.guardrails, 'definition.guardrails', errors)
  const flag = parseFlagReference(input.flag, 'definition.flag', errors)
  const experiment =
    input.experiment === undefined
      ? undefined
      : parseExperimentReference(input.experiment, 'definition.experiment', errors)

  if (input.kind === 'resilience' && input.securityTemplate !== undefined) {
    errors.push('definition.securityTemplate is only valid for security scenarios')
  }
  if (
    input.kind === 'security' &&
    !(SCENARIO_SECURITY_TEMPLATES as readonly unknown[]).includes(input.securityTemplate)
  ) {
    errors.push('definition.securityTemplate must name a closed security template')
  }

  if (
    errors.length > 0 ||
    (input.kind !== 'resilience' && input.kind !== 'security') ||
    !validTargetKey(input.targetKey) ||
    !isFlagEnvironment(input.environment) ||
    !(SCENARIO_COHORTS as readonly unknown[]).includes(input.cohort) ||
    start === null ||
    expiry === null ||
    expiry <= start ||
    expiry - start > MAX_SCENARIO_DURATION_SECONDS * 1_000 ||
    limits === null ||
    guardrails === null ||
    flag === null ||
    experiment === null
  ) {
    return { ok: false, errors }
  }

  return {
    ok: true,
    definition: {
      contractVersion: 1,
      kind: input.kind,
      targetKey: input.targetKey,
      environment: input.environment,
      cohort: input.cohort as ScenarioCohort,
      startAt: input.startAt as string,
      expiresAt: input.expiresAt as string,
      limits,
      guardrails,
      flag,
      ...(experiment === undefined ? {} : { experiment }),
      ...(input.kind === 'security'
        ? {
            securityTemplate: input.securityTemplate as NonNullable<ScenarioDefinition['securityTemplate']>,
          }
        : {}),
    },
  }
}

function parseSnapshotEntry(value: unknown, index: number, errors: string[]): ScenarioSnapshotEntry | null {
  const path = `snapshot.scenarios[${index}]`
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  rejectUnknownKeys(
    value,
    [
      'scenarioKey',
      'scenarioVersion',
      'runId',
      'runRevision',
      'targetKey',
      'cohort',
      'startAt',
      'expiresAt',
      'limits',
      'guardrails',
      'flag',
      'experiment',
    ],
    path,
    errors
  )
  if (!validScenarioKey(value.scenarioKey)) errors.push(`${path}.scenarioKey is invalid`)
  if (!validVersion(value.scenarioVersion)) errors.push(`${path}.scenarioVersion is invalid`)
  if (!validRunId(value.runId)) errors.push(`${path}.runId must be a UUID`)
  if (!validVersion(value.runRevision)) errors.push(`${path}.runRevision is invalid`)
  if (!validTargetKey(value.targetKey)) errors.push(`${path}.targetKey is invalid`)
  if (!(SCENARIO_COHORTS as readonly unknown[]).includes(value.cohort)) {
    errors.push(`${path}.cohort is invalid`)
  }
  const start = parseUtcInstant(value.startAt)
  const expiry = parseUtcInstant(value.expiresAt)
  if (start === null || expiry === null || expiry <= start) {
    errors.push(`${path} has an invalid active window`)
  }
  const limits = parseLimits(value.limits, `${path}.limits`, errors)
  const guardrails = parseGuardrails(value.guardrails, `${path}.guardrails`, errors)

  let flag: ScenarioSnapshotEntry['flag'] | null = null
  if (!isRecord(value.flag)) {
    errors.push(`${path}.flag must be an object`)
  } else {
    rejectUnknownKeys(value.flag, ['key', 'definitionVersion', 'definition'], `${path}.flag`, errors)
    const definition = parseFlagDefinition(value.flag.definition)
    if (!validateFlagKey(value.flag.key)) errors.push(`${path}.flag.key is invalid`)
    if (!validVersion(value.flag.definitionVersion)) {
      errors.push(`${path}.flag.definitionVersion is invalid`)
    }
    if (!definition.ok) {
      errors.push(...definition.errors.map((error) => `${path}.flag.${error}`))
    } else if (definition.definition.valueType !== 'json') {
      errors.push(`${path}.flag.definition.valueType must be json`)
    } else if (definition.definition.variants.some((variant) => parseScenarioFault(variant.value) === null)) {
      errors.push(`${path}.flag.definition variants must use the closed scenario fault union`)
    } else if (validateFlagKey(value.flag.key) && validVersion(value.flag.definitionVersion)) {
      flag = {
        key: value.flag.key,
        definitionVersion: value.flag.definitionVersion,
        definition: definition.definition,
      }
    }
  }

  const experiment =
    value.experiment === undefined
      ? undefined
      : parseExperimentReference(value.experiment, `${path}.experiment`, errors)

  if (
    !validScenarioKey(value.scenarioKey) ||
    !validVersion(value.scenarioVersion) ||
    !validRunId(value.runId) ||
    !validVersion(value.runRevision) ||
    !validTargetKey(value.targetKey) ||
    !(SCENARIO_COHORTS as readonly unknown[]).includes(value.cohort) ||
    start === null ||
    expiry === null ||
    expiry <= start ||
    limits === null ||
    guardrails === null ||
    flag === null ||
    experiment === null
  ) {
    return null
  }
  return {
    scenarioKey: value.scenarioKey,
    scenarioVersion: value.scenarioVersion,
    runId: value.runId,
    runRevision: value.runRevision,
    targetKey: value.targetKey,
    cohort: value.cohort as ScenarioCohort,
    startAt: value.startAt as string,
    expiresAt: value.expiresAt as string,
    limits,
    guardrails,
    flag,
    ...(experiment === undefined ? {} : { experiment }),
  }
}

export function parseScenarioSnapshot(input: unknown): ScenarioSnapshotResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['snapshot must be an object'] }
  if (byteLength(input) > MAX_SCENARIO_SNAPSHOT_BYTES) {
    errors.push(`snapshot exceeds ${MAX_SCENARIO_SNAPSHOT_BYTES} bytes`)
  }
  rejectUnknownKeys(
    input,
    ['contractVersion', 'environment', 'revision', 'generatedAt', 'scenarios'],
    'snapshot',
    errors
  )
  if (input.contractVersion !== SCENARIO_CONTRACT_VERSION) {
    errors.push(`snapshot.contractVersion must be ${SCENARIO_CONTRACT_VERSION}`)
  }
  if (!isFlagEnvironment(input.environment)) errors.push('snapshot.environment is invalid')
  if (!validVersion(input.revision)) errors.push('snapshot.revision is invalid')
  if (parseUtcInstant(input.generatedAt) === null) errors.push('snapshot.generatedAt is invalid')

  const scenarios: ScenarioSnapshotEntry[] = []
  if (!Array.isArray(input.scenarios) || input.scenarios.length > MAX_SCENARIOS_PER_SNAPSHOT) {
    errors.push(`snapshot.scenarios must contain at most ${MAX_SCENARIOS_PER_SNAPSHOT} entries`)
  } else {
    const keys = new Set<string>()
    const targets = new Set<string>()
    input.scenarios.forEach((entry, index) => {
      const parsed = parseSnapshotEntry(entry, index, errors)
      if (!parsed) return
      if (keys.has(parsed.scenarioKey)) {
        errors.push(`snapshot.scenarios duplicates scenario ${parsed.scenarioKey}`)
      }
      if (targets.has(parsed.targetKey)) {
        errors.push(`snapshot.scenarios contains more than one active run for ${parsed.targetKey}`)
      }
      keys.add(parsed.scenarioKey)
      targets.add(parsed.targetKey)
      scenarios.push(parsed)
    })
  }

  if (
    errors.length > 0 ||
    !isFlagEnvironment(input.environment) ||
    !validVersion(input.revision) ||
    parseUtcInstant(input.generatedAt) === null ||
    !Array.isArray(input.scenarios)
  ) {
    return { ok: false, errors }
  }
  return {
    ok: true,
    snapshot: {
      contractVersion: 1,
      environment: input.environment,
      revision: input.revision,
      generatedAt: input.generatedAt as string,
      scenarios,
    },
  }
}

function control(
  reason: Exclude<ScenarioResolution['reason'], 'MATCH'>,
  entry?: ScenarioSnapshotEntry
): ScenarioResolution {
  return {
    value: { kind: 'none' },
    reason,
    ...(entry
      ? {
          scenarioKey: entry.scenarioKey,
          scenarioVersion: entry.scenarioVersion,
          runId: entry.runId,
          runRevision: entry.runRevision,
          flagVersion: entry.flag.definitionVersion,
          cohort: entry.cohort,
        }
      : {}),
  }
}

/**
 * Resolves one active snapshot entry locally. This function only returns data: callers must pass
 * the result to an explicit target-specific executor before any delay/error can occur.
 */
export function evaluateScenario(
  entry: ScenarioSnapshotEntry | undefined,
  targetKey: string,
  context: FlagEvaluationContext,
  nowMs = Date.now()
): ScenarioResolution {
  try {
    if (!entry) return control('CONTROL')
    if (entry.targetKey !== targetKey) return control('TARGET_MISMATCH', entry)
    const start = parseUtcInstant(entry.startAt)
    const expiry = parseUtcInstant(entry.expiresAt)
    if (start === null || expiry === null || !Number.isFinite(nowMs)) {
      return control('INVALID_SCENARIO', entry)
    }
    if (nowMs < start) return control('NOT_STARTED', entry)
    if (nowMs >= expiry) return control('EXPIRED', entry)

    const details = evaluateFlag({
      flag: {
        key: entry.flag.key,
        definitionVersion: entry.flag.definitionVersion,
        definition: entry.flag.definition,
      },
      defaultValue: { kind: 'none' },
      expectedType: 'json',
      context,
    })
    const fault = parseScenarioFault(details.value)
    if (!fault) return control('INVALID_SCENARIO', entry)
    if (details.errorCode === 'INVALID_CONTEXT') return control('INVALID_CONTEXT', entry)
    if (details.errorCode) return control('INVALID_SCENARIO', entry)
    return {
      value: fault,
      reason: fault.kind === 'none' ? 'CONTROL' : 'MATCH',
      scenarioKey: entry.scenarioKey,
      scenarioVersion: entry.scenarioVersion,
      runId: entry.runId,
      runRevision: entry.runRevision,
      flagVersion: entry.flag.definitionVersion,
      variant: details.variant,
      cohort: entry.cohort,
    }
  } catch {
    return control('INVALID_SCENARIO', entry)
  }
}
