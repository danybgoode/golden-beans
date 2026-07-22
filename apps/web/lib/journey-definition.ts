import {
  EXACT_SEGMENT_TAG_FIELDS,
  MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS,
  type ExactSegmentScalar,
  type ExactSegmentTagField,
} from './entity-contract'

// entity-journeys-projections · Sprint 1, Story 1.1 — the closed, bounded definition contract.
// Pure imports only: management actions and tests call this directly, without loading Next/server.

export const MAX_JOURNEY_STAGES = 20
export const MAX_STAGE_PREDICATES = 5
export const MAX_PREDICATE_STRING_LENGTH = 64
export const MAX_JOURNEY_DESCRIPTION_LENGTH = 500
export const MAX_EVENT_NAME_LENGTH = 128

const LOWER_SNAKE_CASE = /^[a-z][a-z0-9_]{0,63}$/
const ALLOWED_TAGS = new Set<string>(EXACT_SEGMENT_TAG_FIELDS)

export type JourneyStage = {
  key: string
  event: string
  tags?: Partial<Record<ExactSegmentTagField, ExactSegmentScalar>>
}

export type JourneyDefinition = {
  entityType: string
  description?: string
  stages: JourneyStage[]
  cohortEntry?: { stageKey: string }
  retention?: { stageKey: string; anchorStageKey: string; withinDays: number }
}

export type JourneyDefinitionResult =
  | { ok: true; definition: JourneyDefinition }
  | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
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

function validEventName(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length >= 1 &&
    value.length <= MAX_EVENT_NAME_LENGTH &&
    value.trim() === value &&
    !/\p{Cc}/u.test(value)
  )
}

export function validateJourneyKey(value: unknown): value is string {
  return typeof value === 'string' && LOWER_SNAKE_CASE.test(value)
}

export function parseJourneyDefinition(input: unknown): JourneyDefinitionResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['definition must be an object'] }

  rejectUnknownKeys(input, ['entityType', 'description', 'stages', 'cohortEntry', 'retention'], 'definition', errors)

  if (!validateJourneyKey(input.entityType)) {
    errors.push('definition.entityType must be 1-64 characters of lower_snake_case')
  }

  if (
    input.description !== undefined &&
    (typeof input.description !== 'string' || input.description.length > MAX_JOURNEY_DESCRIPTION_LENGTH)
  ) {
    errors.push(`definition.description must be a string up to ${MAX_JOURNEY_DESCRIPTION_LENGTH} characters`)
  }

  const stages: JourneyStage[] = []
  const stageKeys = new Set<string>()
  if (!Array.isArray(input.stages) || input.stages.length < 1 || input.stages.length > MAX_JOURNEY_STAGES) {
    errors.push(`definition.stages must contain 1-${MAX_JOURNEY_STAGES} stages`)
  } else {
    input.stages.forEach((raw, index) => {
      const path = `definition.stages[${index}]`
      if (!isRecord(raw)) {
        errors.push(`${path} must be an object`)
        return
      }
      rejectUnknownKeys(raw, ['key', 'event', 'tags'], path, errors)

      if (!validateJourneyKey(raw.key)) {
        errors.push(`${path}.key must be 1-64 characters of lower_snake_case`)
      } else if (stageKeys.has(raw.key)) {
        errors.push(`${path}.key duplicates ${raw.key}`)
      } else {
        stageKeys.add(raw.key)
      }

      if (!validEventName(raw.event)) {
        errors.push(`${path}.event must be a non-blank event name up to ${MAX_EVENT_NAME_LENGTH} characters`)
      }

      let tags: Partial<Record<ExactSegmentTagField, ExactSegmentScalar>> | undefined
      if (raw.tags !== undefined) {
        if (!isRecord(raw.tags)) {
          errors.push(`${path}.tags must be an object`)
        } else {
          const entries = Object.entries(raw.tags)
          if (entries.length > MAX_STAGE_PREDICATES) {
            errors.push(`${path}.tags may contain at most ${MAX_STAGE_PREDICATES} predicates`)
          }
          tags = {}
          for (const [field, value] of entries) {
            if (!ALLOWED_TAGS.has(field)) {
              errors.push(`${path}.tags.${field} is not an allow-listed segment field`)
              continue
            }
            const scalar =
              typeof value === 'string' || typeof value === 'boolean' ||
              (typeof value === 'number' && Number.isSafeInteger(value) &&
                Math.abs(value) <= MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS)
            if (!scalar) {
              errors.push(
                `${path}.tags.${field} must be a string, boolean, or safe integer with absolute value <= ${MAX_EXACT_SEGMENT_SAFE_INTEGER_ABS}`,
              )
              continue
            }
            if (typeof value === 'string' && value.length > MAX_PREDICATE_STRING_LENGTH) {
              errors.push(`${path}.tags.${field} strings may be at most ${MAX_PREDICATE_STRING_LENGTH} characters`)
              continue
            }
            tags[field as ExactSegmentTagField] = value as ExactSegmentScalar
          }
        }
      }

      if (validateJourneyKey(raw.key) && validEventName(raw.event)) {
        stages.push({ key: raw.key, event: raw.event, ...(tags === undefined ? {} : { tags }) })
      }
    })
  }

  let cohortEntry: JourneyDefinition['cohortEntry']
  if (input.cohortEntry !== undefined) {
    if (!isRecord(input.cohortEntry)) {
      errors.push('definition.cohortEntry must be an object')
    } else {
      rejectUnknownKeys(input.cohortEntry, ['stageKey'], 'definition.cohortEntry', errors)
      const stageKey = input.cohortEntry.stageKey
      if (typeof stageKey !== 'string' || stageKey !== stages[0]?.key) {
        errors.push('definition.cohortEntry.stageKey must name stage 1')
      } else {
        cohortEntry = { stageKey }
      }
    }
  }

  let retention: JourneyDefinition['retention']
  if (input.retention !== undefined) {
    if (!isRecord(input.retention)) {
      errors.push('definition.retention must be an object')
    } else {
      rejectUnknownKeys(input.retention, ['stageKey', 'anchorStageKey', 'withinDays'], 'definition.retention', errors)
      const { stageKey, anchorStageKey, withinDays } = input.retention
      const targetIndex = typeof stageKey === 'string' ? stages.findIndex((stage) => stage.key === stageKey) : -1
      const anchorIndex =
        typeof anchorStageKey === 'string' ? stages.findIndex((stage) => stage.key === anchorStageKey) : -1
      if (targetIndex < 0) errors.push('definition.retention.stageKey must name a stage')
      if (anchorIndex < 0) errors.push('definition.retention.anchorStageKey must name a stage')
      if (targetIndex >= 0 && anchorIndex > targetIndex) {
        errors.push('definition.retention.anchorStageKey must precede or equal stageKey')
      }
      if (typeof withinDays !== 'number' || !Number.isInteger(withinDays) || withinDays < 1 || withinDays > 365) {
        errors.push('definition.retention.withinDays must be an integer from 1 to 365')
      }
      if (targetIndex >= 0 && anchorIndex >= 0 && anchorIndex <= targetIndex &&
          typeof withinDays === 'number' && Number.isInteger(withinDays) && withinDays >= 1 && withinDays <= 365) {
        retention = { stageKey: stageKey as string, anchorStageKey: anchorStageKey as string, withinDays }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    definition: {
      entityType: input.entityType as string,
      ...(input.description === undefined ? {} : { description: input.description as string }),
      stages,
      ...(cohortEntry ? { cohortEntry } : {}),
      ...(retention ? { retention } : {}),
    },
  }
}
