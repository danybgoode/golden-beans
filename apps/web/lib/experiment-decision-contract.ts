import type { ExperimentAnalysisResult } from './experiment-analysis'
import type { ExperimentDefinition } from './experiment-definition'

export const EXPERIMENT_DECISION_OUTCOMES = [
  'ship_treatment',
  'keep_control',
  'iterate',
  'inconclusive',
  'invalid',
] as const

export const EXPERIMENT_DECISION_RECORD_KINDS = ['decision', 'correction'] as const
export const MAX_DECISION_RATIONALE_LENGTH = 2_000
export const MAX_DECISION_SNAPSHOT_BYTES = 256 * 1024
export const MAX_DECISION_HISTORY_RECORDS = 100
export const MAX_DECISION_HISTORY_BYTES = 4_718_592

export class ExperimentDecisionResourceLimitError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ExperimentDecisionResourceLimitError'
  }
}

export type ExperimentDecisionOutcome = typeof EXPERIMENT_DECISION_OUTCOMES[number]
export type ExperimentDecisionRecordKind = typeof EXPERIMENT_DECISION_RECORD_KINDS[number]

export type ExperimentDecisionRecordView = {
  id: string
  ordinal: number
  definitionVersion: number
  recordKind: ExperimentDecisionRecordKind
  outcome: ExperimentDecisionOutcome
  chosenVariantKey: string | null
  rationale: string
  analysisSnapshot: Record<string, unknown>
  integritySnapshot: Record<string, unknown>
  actorUserId: string
  createdAt: string
  supersedesRecordId: string | null
}

export type ExperimentDecisionHistory = {
  state: 'undecided' | 'decided'
  current: ExperimentDecisionRecordView | null
  history: ExperimentDecisionRecordView[]
}

export type ExperimentDecisionRow = {
  id: unknown
  ordinal: unknown
  definition_version: unknown
  record_kind: unknown
  outcome: unknown
  chosen_variant_key: unknown
  rationale: unknown
  analysis_snapshot: unknown
  integrity_snapshot: unknown
  actor_user_id: unknown
  created_at: unknown
  supersedes_record_id: unknown
}

export type ParsedExperimentDecisionCommand = {
  recordKind: ExperimentDecisionRecordKind
  outcome: ExperimentDecisionOutcome
  chosenVariantKey: string | null
  rationale: string
  supersedesRecordId: string | null
  idempotencyKey: string
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SNAPSHOT_DENIED_KEYS = new Set([
  'tags',
  'metadata',
  'subject',
  'subject_id',
  'subjectId',
  'user_id',
  'userId',
  'email',
  'phone',
])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function codePointLength(value: string): number {
  return Array.from(value).length
}

function isDecisionOutcome(value: unknown): value is ExperimentDecisionOutcome {
  return typeof value === 'string' &&
    (EXPERIMENT_DECISION_OUTCOMES as readonly string[]).includes(value)
}

function isRecordKind(value: unknown): value is ExperimentDecisionRecordKind {
  return typeof value === 'string' &&
    (EXPERIMENT_DECISION_RECORD_KINDS as readonly string[]).includes(value)
}

function assertSafeSnapshotValue(value: unknown, path = 'analysisSnapshot'): void {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  ) return
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertSafeSnapshotValue(entry, `${path}[${index}]`))
    return
  }
  if (!isRecord(value)) throw new Error(`${path} is not JSON-safe`)
  for (const [key, nested] of Object.entries(value)) {
    if (SNAPSHOT_DENIED_KEYS.has(key)) {
      throw new Error(`${path}.${key} contains raw event identity or tags`)
    }
    assertSafeSnapshotValue(nested, `${path}.${key}`)
  }
}

function boundedSnapshot(value: unknown, field: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${field} must be an object`)
  assertSafeSnapshotValue(value, field)
  const serialized = JSON.stringify(value)
  if (new TextEncoder().encode(serialized).byteLength > MAX_DECISION_SNAPSHOT_BYTES) {
    throw new ExperimentDecisionResourceLimitError(`${field} exceeds the bounded snapshot size`)
  }
  return JSON.parse(serialized) as Record<string, unknown>
}

export function prepareExperimentDecisionSnapshot(
  analysis: ExperimentAnalysisResult,
  capturedAt: string,
): Record<string, unknown> {
  return boundedSnapshot({
    contractVersion: 1,
    capturedAt,
    ...analysis,
  }, 'analysisSnapshot')
}

export function parseExperimentDecisionCommand(
  input: {
    recordKind: unknown
    outcome: unknown
    chosenVariantKey: unknown
    rationale: unknown
    supersedesRecordId: unknown
    idempotencyKey: unknown
  },
  context: {
    definition: ExperimentDefinition
    lifecycle: 'running' | 'stopped' | 'decided'
    currentDecisionId: string | null
  },
): { ok: true; command: ParsedExperimentDecisionCommand } | { ok: false; error: string } {
  if (!isRecordKind(input.recordKind)) return { ok: false, error: 'Invalid decision record kind.' }
  if (!isDecisionOutcome(input.outcome)) return { ok: false, error: 'Invalid decision outcome.' }
  if (typeof input.rationale !== 'string') return { ok: false, error: 'A rationale is required.' }
  const rationale = input.rationale.trim()
  if (rationale.length === 0 || codePointLength(rationale) > MAX_DECISION_RATIONALE_LENGTH) {
    return {
      ok: false,
      error: `Rationale must be 1-${MAX_DECISION_RATIONALE_LENGTH} characters.`,
    }
  }
  if (typeof input.idempotencyKey !== 'string' || !UUID.test(input.idempotencyKey)) {
    return { ok: false, error: 'Invalid idempotency key.' }
  }

  if (input.recordKind === 'decision') {
    if (context.lifecycle !== 'stopped' || context.currentDecisionId !== null) {
      return { ok: false, error: 'An initial decision requires an undecided stopped version.' }
    }
    if (input.supersedesRecordId !== null && input.supersedesRecordId !== '') {
      return { ok: false, error: 'An initial decision cannot supersede another record.' }
    }
  } else {
    if (context.lifecycle !== 'decided' || context.currentDecisionId === null) {
      return { ok: false, error: 'A correction requires a decided version.' }
    }
    if (input.supersedesRecordId !== context.currentDecisionId) {
      return { ok: false, error: 'A correction must supersede the current decision.' }
    }
  }

  const chosen = typeof input.chosenVariantKey === 'string' && input.chosenVariantKey.length > 0
    ? input.chosenVariantKey
    : null
  const variantKeys = new Set(context.definition.variants.map((variant) => variant.key))
  if (input.outcome === 'ship_treatment') {
    if (
      chosen === null ||
      chosen === context.definition.controlVariantKey ||
      !variantKeys.has(chosen)
    ) {
      return { ok: false, error: 'Shipping treatment requires one declared non-control variant.' }
    }
  } else if (input.outcome === 'keep_control') {
    if (chosen !== context.definition.controlVariantKey) {
      return { ok: false, error: 'Keeping control must choose the declared control variant.' }
    }
  } else if (chosen !== null) {
    return { ok: false, error: 'This outcome cannot choose a rollout variant.' }
  }

  return {
    ok: true,
    command: {
      recordKind: input.recordKind,
      outcome: input.outcome,
      chosenVariantKey: chosen,
      rationale,
      supersedesRecordId: input.recordKind === 'correction'
        ? context.currentDecisionId
        : null,
      idempotencyKey: input.idempotencyKey,
    },
  }
}

export function mapExperimentDecisionRows(rows: ExperimentDecisionRow[]): ExperimentDecisionHistory {
  if (rows.length > MAX_DECISION_HISTORY_RECORDS) {
    throw new ExperimentDecisionResourceLimitError('experiment decision history exceeds its read bound')
  }
  let historyBytes = 0
  const history = rows.map((row): ExperimentDecisionRecordView => {
    if (
      typeof row.id !== 'string' ||
      typeof row.ordinal !== 'number' ||
      !Number.isSafeInteger(row.ordinal) ||
      row.ordinal < 1 ||
      typeof row.definition_version !== 'number' ||
      !Number.isSafeInteger(row.definition_version) ||
      row.definition_version < 1 ||
      !isRecordKind(row.record_kind) ||
      !isDecisionOutcome(row.outcome) ||
      (row.chosen_variant_key !== null && typeof row.chosen_variant_key !== 'string') ||
      typeof row.rationale !== 'string' ||
      typeof row.actor_user_id !== 'string' ||
      typeof row.created_at !== 'string' ||
      (row.supersedes_record_id !== null && typeof row.supersedes_record_id !== 'string')
    ) {
      throw new Error('malformed experiment decision record')
    }
    const analysisSnapshot = boundedSnapshot(row.analysis_snapshot, 'analysisSnapshot')
    const integritySnapshot = boundedSnapshot(row.integrity_snapshot, 'integritySnapshot')
    historyBytes += new TextEncoder().encode(JSON.stringify({
      rationale: row.rationale,
      analysisSnapshot,
      integritySnapshot,
    })).byteLength
    if (historyBytes > MAX_DECISION_HISTORY_BYTES) {
      throw new ExperimentDecisionResourceLimitError(
        'experiment decision history exceeds its payload bound',
      )
    }
    return {
      id: row.id,
      ordinal: row.ordinal,
      definitionVersion: row.definition_version,
      recordKind: row.record_kind,
      outcome: row.outcome,
      chosenVariantKey: row.chosen_variant_key,
      rationale: row.rationale,
      analysisSnapshot,
      integritySnapshot,
      actorUserId: row.actor_user_id,
      createdAt: row.created_at,
      supersedesRecordId: row.supersedes_record_id,
    }
  }).sort((a, b) => a.ordinal - b.ordinal)

  return {
    state: history.length === 0 ? 'undecided' : 'decided',
    current: history.at(-1) ?? null,
    history,
  }
}
