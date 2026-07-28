// Flag-serving E5 · Sprint 2, Story 2.5 — the pure, import-free half of
// evaluation telemetry. It deliberately accepts a closed scalar-only shape:
// a flag check must never turn a request body, credential, or arbitrary object
// into an analytical fact just because somebody adds a convenience parameter.

export const FLAG_EVALUATED_EVENT = 'flag_evaluated'

export type FlagEvaluationTelemetryInput = {
  flagKey: string
  flagVersion: number
  variant: string
  reason: string
  snapshotVersion: number
  environment: 'development' | 'preview' | 'production'
  /** A stable opaque identifier owned by the caller; never put a name, email, or request body here. */
  subject: { type: string; id: string }
  /** When set, this evaluation is emitted through the existing experiment_exposed denominator. */
  experiment?: { key: string; definitionVersion: number }
}

const FLAG_KEY = /^[a-z][a-z0-9_.-]{0,127}$/
const ENTITY_TYPE = /^[a-z][a-z0-9_]{0,63}$/
// Flag telemetry is routinely called beside a request. Unlike the general event
// context (which permits application-defined opaque ids), this convenience API
// must make the privacy boundary structural: accept only conventional generated
// identifiers, never email addresses, paths, prose, or serialized request data.
const OPAQUE_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/
const CONTROL_CHARS = /\p{Cc}/u
const ENVIRONMENTS = new Set(['development', 'preview', 'production'])

export function normalizeFlagEvaluationSampleRate(rate: number | undefined): number {
  if (typeof rate !== 'number' || !Number.isFinite(rate)) return 1
  return Math.min(1, Math.max(0, rate))
}

/**
 * One stable hash drives both sampling and idempotency. That makes all retries of
 * one subject/flag/version decision agree: sampled-out requests stay out, and an
 * accepted decision cannot become hot-path noise after a process restart.
 */
export function flagEvaluationFingerprint(input: FlagEvaluationTelemetryInput): string {
  const material = [
    input.subject.type,
    input.subject.id,
    input.flagKey,
    input.flagVersion,
    input.variant,
    input.reason,
    input.snapshotVersion,
    input.environment,
    input.experiment?.key ?? '',
    input.experiment?.definitionVersion ?? '',
  ].join('\u001f')
  // A single 32-bit hash would make a long-lived event idempotency namespace
  // collision-prone. Two independent lanes keep this synchronous and runtime-
  // agnostic without treating a telemetry call as a cryptographic operation.
  return `${fnv1a(material, 0x811c9dc5)}${fnv1a(material, 0x9e3779b9)}`
}

export function shouldSampleFlagEvaluation(input: FlagEvaluationTelemetryInput, sampleRate: number): boolean {
  if (sampleRate <= 0) return false
  if (sampleRate >= 1) return true
  return parseInt(flagEvaluationFingerprint(input).slice(0, 8), 16) / 0x1_0000_0000 < sampleRate
}

export function validateFlagEvaluationTelemetry(input: unknown): input is FlagEvaluationTelemetryInput {
  if (input === null || typeof input !== 'object' || Array.isArray(input)) return false
  const value = input as Partial<FlagEvaluationTelemetryInput>
  for (const key of Object.keys(value)) {
    if (
      ![
        'flagKey',
        'flagVersion',
        'variant',
        'reason',
        'snapshotVersion',
        'environment',
        'subject',
        'experiment',
      ].includes(key)
    )
      return false
  }
  const subject = value.subject
  if (!validText(value.flagKey, FLAG_KEY) || !validVersion(value.flagVersion) || !validText(value.variant))
    return false
  if (
    !validText(value.reason) ||
    !validVersion(value.snapshotVersion) ||
    !ENVIRONMENTS.has(value.environment ?? '')
  )
    return false
  if (subject === null || typeof subject !== 'object' || Array.isArray(subject)) return false
  if (!onlyKeys(subject, ['type', 'id'])) return false
  if (!validText(subject.type, ENTITY_TYPE) || !validOpaqueId(subject.id)) return false
  if (value.experiment === undefined) return true
  return (
    value.experiment !== null &&
    typeof value.experiment === 'object' &&
    !Array.isArray(value.experiment) &&
    onlyKeys(value.experiment, ['key', 'definitionVersion']) &&
    validText(value.experiment.key, FLAG_KEY) &&
    validVersion(value.experiment.definitionVersion)
  )
}

function onlyKeys(value: object, allowed: string[]): boolean {
  return Object.keys(value).every((key) => allowed.includes(key))
}

function validText(value: unknown, pattern?: RegExp): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !CONTROL_CHARS.test(value) &&
    (!pattern || pattern.test(value))
  )
}

function validOpaqueId(value: unknown): value is string {
  return validText(value, OPAQUE_ID)
}

function validVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 2_147_483_647
}

function fnv1a(value: string, seed: number): string {
  let hash = seed
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}
