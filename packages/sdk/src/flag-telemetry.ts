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
  /**
   * experiments-for-humans D2.4 — the evaluation context's segment fields, copied into the event's
   * tags. Pass the SAME values you passed to the flag evaluation.
   *
   * ⚠️ An experiment's eligibility and its breakdowns are joined on the EXPOSURE's tags, so an
   * exposure without them is rejected as `eligibility_mismatch` by any experiment that declares a
   * condition — it looks like a quiet test, not an error. Only the five allow-listed fields, only
   * scalars, strings of at most 64 code points and no NUL: exactly an experiment predicate's bounds.
   */
  segments?: FlagEvaluationSegments
}

export const FLAG_EVALUATION_SEGMENT_FIELDS = ['source', 'channel', 'campaign', 'plan', 'region'] as const
export type FlagEvaluationSegmentField = (typeof FLAG_EVALUATION_SEGMENT_FIELDS)[number]
export type FlagEvaluationSegments = Partial<Record<FlagEvaluationSegmentField, string | number | boolean>>

/**
 * The three `definition.metadata` keys that name the experiment a flag version belongs to
 * (experiments-for-humans D2.1). Written by the Golden Frijoles experiment builder when it saves a
 * draft; removed again when the experiment is rolled out. Named once, here, because the writer (the
 * app's planner) and the reader (`experimentForResolution`) must never disagree about a spelling.
 */
export const EXPERIMENT_METADATA_KEYS = {
  key: 'experiment_key',
  version: 'experiment_version',
  rules: 'experiment_rules',
} as const

type ResolutionLike = {
  reason?: string
  rulePriority?: number
  flagMetadata?: Record<string, string | number | boolean>
}

/**
 * experiments-for-humans D2.3 — which experiment, if any, this resolution is an exposure for.
 *
 * Returns `{ key, definitionVersion }` only when the served flag version names an experiment AND the
 * rule that resolved this person is one of that experiment's rules. Everyone else — held-out people,
 * who fall through to the default, and people served by the feature's own rules — gets `undefined`,
 * and `trackFlagEvaluation` then emits an ordinary `flag_evaluated`. That branch IS the holdout: a
 * held-out person must never enter the experiment's denominator.
 *
 * Pure and total: malformed metadata returns `undefined` rather than throwing, because this runs on a
 * request path, and a bad flag definition must not become an outage.
 */
export function experimentForResolution(
  details: ResolutionLike
): { key: string; definitionVersion: number } | undefined {
  if (details.reason !== 'TARGETING_MATCH' || typeof details.rulePriority !== 'number') return undefined
  const metadata = details.flagMetadata ?? {}
  const key = metadata[EXPERIMENT_METADATA_KEYS.key]
  const version = metadata[EXPERIMENT_METADATA_KEYS.version]
  const rules = metadata[EXPERIMENT_METADATA_KEYS.rules]
  if (typeof key !== 'string' || !EXPERIMENT_KEY.test(key)) return undefined
  if (!validVersion(version) || version < 1) return undefined
  if (typeof rules !== 'string' || !/^\d{1,7}(,\d{1,7})*$/.test(rules)) return undefined
  const priorities = rules.split(',').map(Number)
  return priorities.includes(details.rulePriority) ? { key, definitionVersion: version } : undefined
}

const FLAG_KEY = /^[a-z][a-z0-9_.-]{0,127}$/
const ENTITY_TYPE = /^[a-z][a-z0-9_]{0,63}$/
// Flag telemetry is routinely called beside a request. Unlike the general event
// context (which permits application-defined opaque ids), this convenience API
// must make the privacy boundary structural: accept only conventional generated
// identifiers, never email addresses, paths, prose, or serialized request data.
// An EXPERIMENT key, not a flag key: `apps/web/lib/experiment-definition.ts` (`EXPERIMENT_KEY`) forbids
// the dots a flag key allows, so a dotted `experiment_key` names no experiment that can exist and
// must read as malformed rather than emit an exposure nothing can ever join (Codex, PR #167).
const EXPERIMENT_KEY = /^[a-z][a-z0-9_-]{0,63}$/
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
        'segments',
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
  // `segments` must be an object when present; its individual entries are filtered, not judged —
  // see `segmentTags`.
  if (
    value.segments !== undefined &&
    (value.segments === null || typeof value.segments !== 'object' || Array.isArray(value.segments))
  )
    return false
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

function isSegmentValue(segment: unknown): segment is string | number | boolean {
  return (
    typeof segment === 'boolean' ||
    (typeof segment === 'number' &&
      Number.isSafeInteger(segment) &&
      Math.abs(segment) <= 1_000_000_000_000_000) ||
    // EXACTLY an experiment predicate's scalar domain (`validScalarPredicate` in
    // apps/web/lib/experiment-definition.ts): no NUL, at most 64 code points — the empty string
    // included. Anything narrower here makes a condition that can be SAVED but whose exposures can
    // never carry it (Codex, PR #167: `{ region: "" }`).
    (typeof segment === 'string' && !segment.includes('\0') && Array.from(segment).length <= 64)
  )
}

/**
 * The segment fields that may ride on the event — every OTHER entry is dropped, never fatal.
 *
 * ⚠️ Dropping the FIELD, not the event, is deliberate (fresh reviewer, PR #167). The evaluation
 * context accepts values a segment cannot carry (a 65-character campaign, `targetingKey` when a
 * caller passes the whole context as `segments`), and rejecting the whole payload would silently
 * lose a person who WAS served the experiment — a return value nobody reads. Dropping only the tag
 * keeps the exposure, and the loss surfaces where someone looks: as an `eligibility_mismatch` count
 * in the governed analysis when the experiment declared that field.
 */
export function segmentTags(segments: unknown): FlagEvaluationSegments {
  if (segments === null || typeof segments !== 'object' || Array.isArray(segments)) return {}
  const kept: FlagEvaluationSegments = {}
  for (const field of FLAG_EVALUATION_SEGMENT_FIELDS) {
    const segment = (segments as Record<string, unknown>)[field]
    if (isSegmentValue(segment)) kept[field] = segment
  }
  return kept
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
