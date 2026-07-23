import {
  EXACT_SEGMENT_TAG_FIELDS,
  MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS,
  type ExactSegmentScalar,
  type ExactSegmentTagField,
} from './entity-contract'
import {
  compareJourneyTimestamps,
  parseJourneyTimestamp,
  type JourneyTimestamp,
} from './journey-timestamp'

// Experiment governance v2 · Sprint 1, Story 1.1 — import-safe, closed plan contract.

export const MAX_EXPERIMENT_DEFINITION_BYTES = 32 * 1024
export const MAX_EXPERIMENT_VARIANTS = 10
export const MAX_EXPERIMENT_GUARDRAILS = 10
export const MAX_EXPERIMENT_WEIGHT = 1_000_000
export const MAX_EXPERIMENT_SAMPLE_PER_VARIANT = 1_000_000
export const MAX_EXPERIMENT_DESCRIPTION_LENGTH = 500
export const MAX_EXPERIMENT_EVENT_LENGTH = 128
export const MAX_EXPERIMENT_PREDICATE_STRING_LENGTH = 64

const EXPERIMENT_KEY = /^[a-z][a-z0-9_-]{0,63}$/
const ENTITY_TYPE = /^[a-z][a-z0-9_]{0,63}$/
const ALLOWED_SEGMENTS = new Set<string>(EXACT_SEGMENT_TAG_FIELDS)
const CONTROL_CHARS = /\p{Cc}/u

export type ExperimentDirection = 'increase' | 'decrease'
export type ExperimentVariant = { key: string; weight: number }
export type ExperimentMetric = { event: string; direction: ExperimentDirection }

export type ExperimentDefinition = {
  hypothesis: string
  assignmentEntityType: string
  eligibility: {
    description: string
    tags?: Partial<Record<ExactSegmentTagField, ExactSegmentScalar>>
  }
  variants: ExperimentVariant[]
  controlVariantKey: string
  primaryMetric: ExperimentMetric
  guardrailMetrics: ExperimentMetric[]
  segmentFields: ExactSegmentTagField[]
  plannedWindow: { startAt: string; endAt: string }
  minimumSamplePerVariant: number
}

export type ExperimentDefinitionResult =
  | { ok: true; definition: ExperimentDefinition }
  | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  path: string,
  errors: string[],
) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${path}.${key} is not allowed`)
  }
}

function validBoundedText(value: unknown, max: number, requireNonBlank: boolean): value is string {
  return (
    typeof value === 'string' &&
    !value.includes('\0') &&
    codePointLength(value) <= max &&
    (!requireNonBlank || value.trim().length > 0)
  )
}

function validEventName(value: unknown): value is string {
  return (
    validBoundedText(value, MAX_EXPERIMENT_EVENT_LENGTH, true) &&
    codePointLength(value) >= 1 &&
    value.trim() === value &&
    !CONTROL_CHARS.test(value)
  )
}

function explicitOffsetInstant(value: unknown): JourneyTimestamp | null {
  // PostgreSQL has no ISO year zero (`0000`); reject it here so the import-safe validator and
  // the database CHECK accept exactly the same four-digit timestamp domain.
  if (typeof value !== 'string' || value.includes('\0') || /^0000-/.test(value)) return null
  try {
    return parseJourneyTimestamp(value)
  } catch {
    return null
  }
}

function parseMetric(value: unknown, path: string, errors: string[]): ExperimentMetric | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  rejectUnknownKeys(value, ['event', 'direction'], path, errors)
  if (!validEventName(value.event)) {
    errors.push(`${path}.event must be a non-blank event name up to ${MAX_EXPERIMENT_EVENT_LENGTH} characters`)
  }
  if (value.direction !== 'increase' && value.direction !== 'decrease') {
    errors.push(`${path}.direction must be increase or decrease`)
  }
  return validEventName(value.event) && (value.direction === 'increase' || value.direction === 'decrease')
    ? { event: value.event, direction: value.direction }
    : null
}

export function validateExperimentKey(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && EXPERIMENT_KEY.test(value)
}

export function parseExperimentDefinition(input: unknown): ExperimentDefinitionResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['definition must be an object'] }

  rejectUnknownKeys(input, [
    'hypothesis',
    'assignmentEntityType',
    'eligibility',
    'variants',
    'controlVariantKey',
    'primaryMetric',
    'guardrailMetrics',
    'segmentFields',
    'plannedWindow',
    'minimumSamplePerVariant',
  ], 'definition', errors)

  if (!validBoundedText(input.hypothesis, MAX_EXPERIMENT_DESCRIPTION_LENGTH, true)) {
    errors.push(`definition.hypothesis must be a non-blank string up to ${MAX_EXPERIMENT_DESCRIPTION_LENGTH} characters`)
  }
  if (typeof input.assignmentEntityType !== 'string' ||
      input.assignmentEntityType.includes('\0') ||
      !ENTITY_TYPE.test(input.assignmentEntityType)) {
    errors.push('definition.assignmentEntityType must be 1-64 characters of lower_snake_case')
  }

  let eligibility: ExperimentDefinition['eligibility'] | null = null
  if (!isRecord(input.eligibility)) {
    errors.push('definition.eligibility must be an object')
  } else {
    rejectUnknownKeys(input.eligibility, ['description', 'tags'], 'definition.eligibility', errors)
    if (!validBoundedText(input.eligibility.description, MAX_EXPERIMENT_DESCRIPTION_LENGTH, true)) {
      errors.push(
        `definition.eligibility.description must be a non-blank string up to ${MAX_EXPERIMENT_DESCRIPTION_LENGTH} characters`,
      )
    }
    let tags: Partial<Record<ExactSegmentTagField, ExactSegmentScalar>> | undefined
    if (input.eligibility.tags !== undefined) {
      if (!isRecord(input.eligibility.tags)) {
        errors.push('definition.eligibility.tags must be an object')
      } else {
        const entries = Object.entries(input.eligibility.tags)
        if (entries.length > EXACT_SEGMENT_TAG_FIELDS.length) {
          errors.push(`definition.eligibility.tags may contain at most ${EXACT_SEGMENT_TAG_FIELDS.length} predicates`)
        }
        tags = {}
        for (const [field, value] of entries) {
          const path = `definition.eligibility.tags.${field}`
          if (!ALLOWED_SEGMENTS.has(field)) {
            errors.push(`${path} is not an allow-listed segment field`)
            continue
          }
          const scalar =
            typeof value === 'boolean' ||
            (typeof value === 'string' &&
              !value.includes('\0') &&
              codePointLength(value) <= MAX_EXPERIMENT_PREDICATE_STRING_LENGTH) ||
            (typeof value === 'number' &&
              Number.isSafeInteger(value) &&
              Math.abs(value) <= MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS)
          if (!scalar) {
            errors.push(
              `${path} must be a string up to ${MAX_EXPERIMENT_PREDICATE_STRING_LENGTH} characters, boolean, or safe integer with absolute value <= ${MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS}`,
            )
            continue
          }
          tags[field as ExactSegmentTagField] = value as ExactSegmentScalar
        }
      }
    }
    if (validBoundedText(input.eligibility.description, MAX_EXPERIMENT_DESCRIPTION_LENGTH, true)) {
      eligibility = {
        description: input.eligibility.description,
        ...(tags === undefined ? {} : { tags }),
      }
    }
  }

  const variants: ExperimentVariant[] = []
  const variantKeys = new Set<string>()
  if (!Array.isArray(input.variants) || input.variants.length < 2 || input.variants.length > MAX_EXPERIMENT_VARIANTS) {
    errors.push(`definition.variants must contain 2-${MAX_EXPERIMENT_VARIANTS} variants`)
  } else {
    input.variants.forEach((raw, index) => {
      const path = `definition.variants[${index}]`
      if (!isRecord(raw)) {
        errors.push(`${path} must be an object`)
        return
      }
      rejectUnknownKeys(raw, ['key', 'weight'], path, errors)
      if (!validateExperimentKey(raw.key)) {
        errors.push(`${path}.key must be 1-64 lowercase characters using letters, numbers, hyphen or underscore`)
      } else if (variantKeys.has(raw.key)) {
        errors.push(`${path}.key duplicates ${raw.key}`)
      } else {
        variantKeys.add(raw.key)
      }
      if (
        typeof raw.weight !== 'number' ||
        !Number.isInteger(raw.weight) ||
        raw.weight < 1 ||
        raw.weight > MAX_EXPERIMENT_WEIGHT
      ) {
        errors.push(`${path}.weight must be an integer from 1 to ${MAX_EXPERIMENT_WEIGHT}`)
      }
      if (validateExperimentKey(raw.key) &&
          typeof raw.weight === 'number' &&
          Number.isInteger(raw.weight) &&
          raw.weight >= 1 &&
          raw.weight <= MAX_EXPERIMENT_WEIGHT) {
        variants.push({ key: raw.key, weight: raw.weight })
      }
    })
  }

  if (!validateExperimentKey(input.controlVariantKey) || !variantKeys.has(input.controlVariantKey)) {
    errors.push('definition.controlVariantKey must name exactly one declared variant')
  }

  const primaryMetric = parseMetric(input.primaryMetric, 'definition.primaryMetric', errors)
  const guardrailMetrics: ExperimentMetric[] = []
  if (!Array.isArray(input.guardrailMetrics) || input.guardrailMetrics.length > MAX_EXPERIMENT_GUARDRAILS) {
    errors.push(`definition.guardrailMetrics must contain 0-${MAX_EXPERIMENT_GUARDRAILS} metrics`)
  } else {
    input.guardrailMetrics.forEach((metric, index) => {
      const parsed = parseMetric(metric, `definition.guardrailMetrics[${index}]`, errors)
      if (parsed) guardrailMetrics.push(parsed)
    })
  }
  const metricEvents = [
    ...(primaryMetric ? [primaryMetric.event] : []),
    ...guardrailMetrics.map((metric) => metric.event),
  ]
  if (new Set(metricEvents).size !== metricEvents.length) {
    errors.push('definition primary and guardrail metric events must be unique')
  }

  const segmentFields: ExactSegmentTagField[] = []
  if (!Array.isArray(input.segmentFields)) {
    errors.push('definition.segmentFields must be an array')
  } else {
    const seen = new Set<string>()
    for (const field of input.segmentFields) {
      if (typeof field !== 'string' || !ALLOWED_SEGMENTS.has(field)) {
        errors.push(`definition.segmentFields contains a non-allow-listed field: ${String(field)}`)
      } else if (seen.has(field)) {
        errors.push(`definition.segmentFields duplicates ${field}`)
      } else {
        seen.add(field)
        segmentFields.push(field as ExactSegmentTagField)
      }
    }
  }

  let plannedWindow: ExperimentDefinition['plannedWindow'] | null = null
  if (!isRecord(input.plannedWindow)) {
    errors.push('definition.plannedWindow must be an object')
  } else {
    rejectUnknownKeys(input.plannedWindow, ['startAt', 'endAt'], 'definition.plannedWindow', errors)
    const start = explicitOffsetInstant(input.plannedWindow.startAt)
    const end = explicitOffsetInstant(input.plannedWindow.endAt)
    if (start === null) errors.push('definition.plannedWindow.startAt must be a real timestamp with an explicit offset')
    if (end === null) errors.push('definition.plannedWindow.endAt must be a real timestamp with an explicit offset')
    if (start !== null && end !== null && compareJourneyTimestamps(start, end) >= 0) {
      errors.push('definition.plannedWindow must be a non-empty [startAt, endAt) interval')
    } else if (start !== null && end !== null) {
      plannedWindow = {
        startAt: start.canonical,
        endAt: end.canonical,
      }
    }
  }

  if (
    typeof input.minimumSamplePerVariant !== 'number' ||
    !Number.isInteger(input.minimumSamplePerVariant) ||
    input.minimumSamplePerVariant < 1 ||
    input.minimumSamplePerVariant > MAX_EXPERIMENT_SAMPLE_PER_VARIANT
  ) {
    errors.push(
      `definition.minimumSamplePerVariant must be an integer from 1 to ${MAX_EXPERIMENT_SAMPLE_PER_VARIANT}`,
    )
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    definition: {
      hypothesis: input.hypothesis as string,
      assignmentEntityType: input.assignmentEntityType as string,
      eligibility: eligibility!,
      variants,
      controlVariantKey: input.controlVariantKey as string,
      primaryMetric: primaryMetric!,
      guardrailMetrics,
      segmentFields,
      plannedWindow: plannedWindow!,
      minimumSamplePerVariant: input.minimumSamplePerVariant as number,
    },
  }
}
