// Flag-serving v1 — a deliberately small, import-safe wire contract and local evaluator.
//
// This module must remain usable in any JavaScript runtime. It contains no fetch, timers, Node
// imports, or database assumptions: snapshot transport belongs in flag-provider.ts and definition
// persistence belongs in Golden Beans. Keeping evaluation pure makes a flag check synchronous even
// when the control plane is unavailable.

export const FLAG_CONTRACT_VERSION = 1 as const
export const FLAG_ENVIRONMENTS = ['development', 'preview', 'production'] as const
export const FLAG_CONTEXT_FIELDS = ['targetingKey', 'source', 'channel', 'campaign', 'plan', 'region'] as const

export const MAX_FLAG_DEFINITION_BYTES = 32 * 1024
export const MAX_FLAG_KEY_LENGTH = 128
export const MAX_FLAG_VARIANTS = 20
export const MAX_FLAG_RULES = 20
export const MAX_FLAG_CLAUSES = 5
export const MAX_FLAG_METADATA_ENTRIES = 16
export const MAX_FLAG_JSON_BYTES = 16 * 1024
export const MAX_FLAG_JSON_DEPTH = 8

const FLAG_KEY = /^[a-z][a-z0-9_.-]{0,127}$/
const VARIANT_KEY = /^[a-z][a-z0-9_-]{0,63}$/
const METADATA_KEY = /^[a-z][a-z0-9_-]{0,63}$/

// This is the exact FNV-1a fraction used by bucketing.ts. The SDK's package deliberately uses
// extensionless source imports (so app code cannot accidentally ship `.ts` imports), while the
// repository's native-Node unit runner can only execute pure modules with no such source import.
// Keep this tiny primitive local and pin parity against bucketing.ts in flags.test.ts; changing one
// without the other breaks that contract test. The tuple—not this function—is the public rollout
// compatibility contract, and includes the immutable definition version to make re-bucketing
// explicit when a definition changes.
function rolloutFraction(input: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0) / 0x100000000
}

export type FlagEnvironment = (typeof FLAG_ENVIRONMENTS)[number]
export type FlagContextField = (typeof FLAG_CONTEXT_FIELDS)[number]
export type FlagValueType = 'boolean' | 'string' | 'number' | 'json'
export type FlagScalar = string | number | boolean
export type FlagMetadataValue = FlagScalar
export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export type FlagVariant = { key: string; value: boolean | string | number | JsonValue }
export type FlagClause =
  | { field: FlagContextField; operator: 'equals'; value: FlagScalar }
  | { field: FlagContextField; operator: 'one_of'; values: FlagScalar[] }
export type FlagRule = {
  priority: number
  clauses: FlagClause[]
  rollout?: { basisPoints: number }
  variantKey: string
}
export type FlagDefinition = {
  valueType: FlagValueType
  description: string
  defaultVariantKey: string
  variants: FlagVariant[]
  rules: FlagRule[]
  metadata?: Record<string, FlagMetadataValue>
}

export type FlagSnapshotFlag = {
  key: string
  definitionVersion: number
  definition: FlagDefinition
}
export type FlagSnapshot = {
  contractVersion: typeof FLAG_CONTRACT_VERSION
  environment: FlagEnvironment
  snapshotVersion: number
  flags: FlagSnapshotFlag[]
}

export type FlagEvaluationContext = Partial<Record<FlagContextField, FlagScalar>>
export type FlagResolutionReason = 'TARGETING_MATCH' | 'STATIC' | 'DEFAULT' | 'ERROR'
export type FlagResolutionDetails<T> = {
  value: T
  variant?: string
  reason: FlagResolutionReason
  flagMetadata: Record<string, FlagMetadataValue>
  flagVersion?: number
  errorCode?: 'FLAG_NOT_FOUND' | 'TYPE_MISMATCH' | 'INVALID_CONTEXT' | 'INVALID_DEFINITION'
}
export type FlagDefinitionResult =
  | { ok: true; definition: FlagDefinition }
  | { ok: false; errors: string[] }
export type FlagSnapshotResult =
  | { ok: true; snapshot: FlagSnapshot }
  | { ok: false; errors: string[] }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function byteLength(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength
  } catch {
    return Number.POSITIVE_INFINITY
  }
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

function validText(value: unknown, max: number, nonBlank = true): value is string {
  return (
    typeof value === 'string' &&
    !value.includes('\0') &&
    codePointLength(value) <= max &&
    (!nonBlank || value.trim().length > 0)
  )
}

function validScalar(value: unknown, maxStringLength = 256): value is FlagScalar {
  return (
    typeof value === 'boolean' ||
    (typeof value === 'string' && validText(value, maxStringLength, false)) ||
    (typeof value === 'number' && Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000_000_000)
  )
}

function sameScalar(left: FlagScalar, right: FlagScalar): boolean {
  return typeof left === typeof right && left === right
}

function rejectUnknownKeys(value: Record<string, unknown>, allowed: readonly string[], path: string, errors: string[]) {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value)) {
    if (!allowedSet.has(key)) errors.push(`${path}.${key} is not allowed`)
  }
}

function validJsonContainer(value: unknown, depth = 0): value is JsonValue {
  if (depth > MAX_FLAG_JSON_DEPTH) return false
  if (value === null || typeof value === 'boolean') return true
  if (typeof value === 'string') return validText(value, 4096, false)
  if (typeof value === 'number') return Number.isFinite(value) && Math.abs(value) <= 1_000_000_000_000_000
  if (Array.isArray(value)) return value.length <= 100 && value.every((item) => validJsonContainer(item, depth + 1))
  if (!isRecord(value) || Object.keys(value).length > 100) return false
  return Object.entries(value).every(([key, item]) => validText(key, 128, false) && validJsonContainer(item, depth + 1))
}

function validValueForType(value: unknown, type: FlagValueType): boolean {
  if (type === 'boolean') return typeof value === 'boolean'
  if (type === 'string') return validText(value, 4096, false)
  if (type === 'number') return typeof value === 'number' && Number.isFinite(value)
  return (Array.isArray(value) || isRecord(value)) && validJsonContainer(value) && byteLength(value) <= MAX_FLAG_JSON_BYTES
}

export function validateFlagKey(value: unknown): value is string {
  return typeof value === 'string' && !value.includes('\0') && FLAG_KEY.test(value)
}

export function isFlagEnvironment(value: unknown): value is FlagEnvironment {
  return typeof value === 'string' && (FLAG_ENVIRONMENTS as readonly string[]).includes(value)
}

function parseClause(value: unknown, path: string, errors: string[]): FlagClause | null {
  if (!isRecord(value)) {
    errors.push(`${path} must be an object`)
    return null
  }
  rejectUnknownKeys(value, ['field', 'operator', 'value', 'values'], path, errors)
  if (typeof value.field !== 'string' || !(FLAG_CONTEXT_FIELDS as readonly string[]).includes(value.field)) {
    errors.push(`${path}.field is not an allow-listed evaluation-context field`)
    return null
  }
  if (value.operator === 'equals') {
    if ('values' in value || !validScalar(value.value)) {
      errors.push(`${path}.equals needs one bounded scalar value and no values array`)
      return null
    }
    return { field: value.field as FlagContextField, operator: 'equals', value: value.value }
  }
  if (value.operator === 'one_of') {
    const values = value.values
    if ('value' in value || !Array.isArray(values) || values.length < 1 || values.length > 20 || !values.every((item) => validScalar(item))) {
      errors.push(`${path}.one_of needs 1-20 bounded scalar values and no value`)
      return null
    }
    const scalarValues = values as FlagScalar[]
    if (scalarValues.some((candidate, index) => scalarValues.slice(0, index).some((previous) => sameScalar(previous, candidate)))) {
      errors.push(`${path}.one_of values must be unique`)
      return null
    }
    return { field: value.field as FlagContextField, operator: 'one_of', values: scalarValues }
  }
  errors.push(`${path}.operator must be equals or one_of`)
  return null
}

export function parseFlagDefinition(input: unknown): FlagDefinitionResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['definition must be an object'] }
  if (byteLength(input) > MAX_FLAG_DEFINITION_BYTES) return { ok: false, errors: ['definition exceeds 32 KiB'] }

  rejectUnknownKeys(input, ['valueType', 'description', 'defaultVariantKey', 'variants', 'rules', 'metadata'], 'definition', errors)
  if (input.valueType !== 'boolean' && input.valueType !== 'string' && input.valueType !== 'number' && input.valueType !== 'json') {
    errors.push('definition.valueType must be boolean, string, number, or json')
  }
  const valueType = input.valueType as FlagValueType
  if (!validText(input.description, 500)) errors.push('definition.description must be a non-blank string up to 500 characters')

  const variants: FlagVariant[] = []
  const variantKeys = new Set<string>()
  if (!Array.isArray(input.variants) || input.variants.length < 1 || input.variants.length > MAX_FLAG_VARIANTS) {
    errors.push(`definition.variants must contain 1-${MAX_FLAG_VARIANTS} variants`)
  } else {
    input.variants.forEach((raw, index) => {
      const path = `definition.variants[${index}]`
      if (!isRecord(raw)) {
        errors.push(`${path} must be an object`)
        return
      }
      rejectUnknownKeys(raw, ['key', 'value'], path, errors)
      if (!validateFlagKey(raw.key) || !VARIANT_KEY.test(raw.key)) {
        errors.push(`${path}.key must be a lowercase 1-64 character variant key`)
        return
      }
      if (variantKeys.has(raw.key)) {
        errors.push(`${path}.key duplicates ${raw.key}`)
        return
      }
      variantKeys.add(raw.key)
      if (!validValueForType(raw.value, valueType)) {
        errors.push(`${path}.value does not match definition.valueType or exceeds its bounds`)
        return
      }
      variants.push({ key: raw.key, value: raw.value as FlagVariant['value'] })
    })
  }

  if (!validateFlagKey(input.defaultVariantKey) || !variantKeys.has(input.defaultVariantKey)) {
    errors.push('definition.defaultVariantKey must name exactly one variant')
  }

  const rules: FlagRule[] = []
  const priorities = new Set<number>()
  if (!Array.isArray(input.rules) || input.rules.length > MAX_FLAG_RULES) {
    errors.push(`definition.rules must contain 0-${MAX_FLAG_RULES} rules`)
  } else {
    input.rules.forEach((raw, index) => {
      const path = `definition.rules[${index}]`
      if (!isRecord(raw)) {
        errors.push(`${path} must be an object`)
        return
      }
      rejectUnknownKeys(raw, ['priority', 'clauses', 'rollout', 'variantKey'], path, errors)
      if (typeof raw.priority !== 'number' || !Number.isInteger(raw.priority) || raw.priority < 0 || raw.priority > 1_000_000) {
        errors.push(`${path}.priority must be an integer from 0 to 1000000`)
      } else if (priorities.has(raw.priority)) {
        errors.push(`${path}.priority duplicates ${raw.priority}`)
      } else {
        priorities.add(raw.priority)
      }
      const clauses: FlagClause[] = []
      if (!Array.isArray(raw.clauses) || raw.clauses.length > MAX_FLAG_CLAUSES) {
        errors.push(`${path}.clauses must contain 0-${MAX_FLAG_CLAUSES} clauses`)
      } else {
        raw.clauses.forEach((clause, clauseIndex) => {
          const parsed = parseClause(clause, `${path}.clauses[${clauseIndex}]`, errors)
          if (parsed) clauses.push(parsed)
        })
      }
      let rollout: FlagRule['rollout']
      if (raw.rollout !== undefined) {
        if (!isRecord(raw.rollout)) {
          errors.push(`${path}.rollout must be an object`)
        } else {
          rejectUnknownKeys(raw.rollout, ['basisPoints'], `${path}.rollout`, errors)
          if (typeof raw.rollout.basisPoints !== 'number' || !Number.isInteger(raw.rollout.basisPoints) || raw.rollout.basisPoints < 0 || raw.rollout.basisPoints > 10_000) {
            errors.push(`${path}.rollout.basisPoints must be an integer from 0 to 10000`)
          } else {
            rollout = { basisPoints: raw.rollout.basisPoints }
          }
        }
      }
      if (!validateFlagKey(raw.variantKey) || !variantKeys.has(raw.variantKey)) {
        errors.push(`${path}.variantKey must name exactly one variant`)
      }
      if (
        typeof raw.priority === 'number' && Number.isInteger(raw.priority) && raw.priority >= 0 && raw.priority <= 1_000_000 &&
        Array.isArray(raw.clauses) && raw.clauses.length <= MAX_FLAG_CLAUSES && clauses.length === raw.clauses.length &&
        validateFlagKey(raw.variantKey) && variantKeys.has(raw.variantKey)
      ) {
        rules.push({ priority: raw.priority, clauses, ...(rollout ? { rollout } : {}), variantKey: raw.variantKey })
      }
    })
  }

  let metadata: Record<string, FlagMetadataValue> | undefined
  if (input.metadata !== undefined) {
    if (!isRecord(input.metadata) || Object.keys(input.metadata).length > MAX_FLAG_METADATA_ENTRIES) {
      errors.push(`definition.metadata must be an object with at most ${MAX_FLAG_METADATA_ENTRIES} entries`)
    } else {
      metadata = {}
      for (const [key, value] of Object.entries(input.metadata)) {
        if (!METADATA_KEY.test(key) || !validScalar(value, 256)) {
          errors.push(`definition.metadata.${key} must use a bounded metadata key and scalar value`)
        } else {
          metadata[key] = value
        }
      }
    }
  }

  if (errors.length > 0) return { ok: false, errors }
  return {
    ok: true,
    definition: {
      valueType,
      description: input.description as string,
      defaultVariantKey: input.defaultVariantKey as string,
      variants,
      rules,
      ...(metadata ? { metadata } : {}),
    },
  }
}

export function parseFlagSnapshot(input: unknown): FlagSnapshotResult {
  const errors: string[] = []
  if (!isRecord(input)) return { ok: false, errors: ['snapshot must be an object'] }
  rejectUnknownKeys(input, ['contractVersion', 'environment', 'snapshotVersion', 'flags'], 'snapshot', errors)
  if (input.contractVersion !== FLAG_CONTRACT_VERSION) errors.push('snapshot.contractVersion is unsupported')
  if (!isFlagEnvironment(input.environment)) errors.push('snapshot.environment is invalid')
  if (typeof input.snapshotVersion !== 'number' || !Number.isSafeInteger(input.snapshotVersion) || input.snapshotVersion < 0) {
    errors.push('snapshot.snapshotVersion must be a non-negative safe integer')
  }
  const flags: FlagSnapshotFlag[] = []
  const keys = new Set<string>()
  if (!Array.isArray(input.flags) || input.flags.length > 500) {
    errors.push('snapshot.flags must contain at most 500 flags')
  } else {
    input.flags.forEach((raw, index) => {
      const path = `snapshot.flags[${index}]`
      if (!isRecord(raw)) {
        errors.push(`${path} must be an object`)
        return
      }
      rejectUnknownKeys(raw, ['key', 'definitionVersion', 'definition'], path, errors)
      const rawKey = raw.key
      const validKey = validateFlagKey(rawKey) && !keys.has(rawKey)
      if (!validKey) {
        errors.push(`${path}.key must be unique and valid`)
      } else {
        keys.add(rawKey)
      }
      if (typeof raw.definitionVersion !== 'number' || !Number.isSafeInteger(raw.definitionVersion) || raw.definitionVersion < 1) {
        errors.push(`${path}.definitionVersion must be a positive safe integer`)
      }
      const checked = parseFlagDefinition(raw.definition)
      if (!checked.ok) errors.push(...checked.errors.map((error) => `${path}.${error}`))
      if (validKey && checked.ok && typeof raw.definitionVersion === 'number' && Number.isSafeInteger(raw.definitionVersion) && raw.definitionVersion > 0) {
        flags.push({ key: rawKey, definitionVersion: raw.definitionVersion, definition: checked.definition })
      }
    })
  }
  if (errors.length > 0) return { ok: false, errors }
  return { ok: true, snapshot: { contractVersion: FLAG_CONTRACT_VERSION, environment: input.environment as FlagEnvironment, snapshotVersion: input.snapshotVersion as number, flags } }
}

function matchesRule(rule: FlagRule, flagKey: string, definitionVersion: number, context: FlagEvaluationContext): boolean {
  for (const clause of rule.clauses) {
    const actual = context[clause.field]
    if (!validScalar(actual)) return false
    if (clause.operator === 'equals' && !sameScalar(actual, clause.value)) return false
    if (clause.operator === 'one_of' && !clause.values.some((value) => sameScalar(actual, value))) return false
  }
  if (!rule.rollout) return true
  const targetingKey = context.targetingKey
  if (typeof targetingKey !== 'string' || !validText(targetingKey, 256)) return false
  return rolloutFraction(JSON.stringify([targetingKey, flagKey, definitionVersion, rule.priority])) < rule.rollout.basisPoints / 10_000
}

export function evaluateFlag<T>(input: {
  flag: FlagSnapshotFlag | undefined
  context?: FlagEvaluationContext
  defaultValue: T
  expectedType: FlagValueType
}): FlagResolutionDetails<T> {
  const fallback = (errorCode: NonNullable<FlagResolutionDetails<T>['errorCode']>): FlagResolutionDetails<T> => ({
    value: input.defaultValue,
    reason: 'DEFAULT',
    flagMetadata: {},
    errorCode,
  })
  if (!input.flag) return fallback('FLAG_NOT_FOUND')
  if (!validValueForType(input.defaultValue, input.expectedType)) return fallback('TYPE_MISMATCH')
  const checked = parseFlagDefinition(input.flag.definition)
  if (!checked.ok || checked.definition.valueType !== input.expectedType) return fallback('INVALID_DEFINITION')
  const context = input.context ?? {}
  if (!isRecord(context) || Object.keys(context).some((key) => !(FLAG_CONTEXT_FIELDS as readonly string[]).includes(key)) || Object.values(context).some((value) => !validScalar(value))) {
    return fallback('INVALID_CONTEXT')
  }
  const chosen = [...checked.definition.rules]
    .sort((left, right) => left.priority - right.priority)
    .find((rule) => matchesRule(rule, input.flag!.key, input.flag!.definitionVersion, context as FlagEvaluationContext))
  const variantKey = chosen?.variantKey ?? checked.definition.defaultVariantKey
  const variant = checked.definition.variants.find((candidate) => candidate.key === variantKey)
  if (!variant || !validValueForType(variant.value, input.expectedType)) return fallback('INVALID_DEFINITION')
  return {
    value: variant.value as T,
    variant: variant.key,
    reason: chosen ? 'TARGETING_MATCH' : 'STATIC',
    flagMetadata: checked.definition.metadata ?? {},
    flagVersion: input.flag.definitionVersion,
  }
}
