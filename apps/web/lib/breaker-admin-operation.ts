import { parseBreakerPolicy, type BreakerPolicyDefinition } from './breaker-policy'

const KEY = /^[a-z][a-z0-9_-]{0,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

type Reasoned = { reason: string }

export type BreakerAdminOperation =
  | (Reasoned & {
      operation: 'create_policy'
      policyKey: string
      definition: BreakerPolicyDefinition
    })
  | (Reasoned & { operation: 'approve_automatic'; policyId: string })
  | (Reasoned & {
      operation: 'prepare_manual'
      policyId: string
      evidenceId: string
      expectedPolicyRevision: number
      expectedSnapshotVersion: number
    })
  | (Reasoned & {
      operation: 'trip_manual'
      policyId: string
      evidenceId: string
      expectedPolicyRevision: number
      expectedSnapshotVersion: number
      confirmationId: string
      confirmationPhrase: string
    })

export type BreakerAutomaticOperation = Reasoned & {
  policyId: string
  evidenceId: string
  expectedPolicyRevision: number
  expectedSnapshotVersion: number
}

function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exact(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function reason(value: unknown): string | null {
  const normalized = typeof value === 'string' ? value.trim() : ''
  return normalized.length >= 1 && normalized.length <= 500 ? normalized : null
}

function positive(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1
}

function snapshot(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 0
}

export function parseBreakerAdminOperation(input: unknown): BreakerAdminOperation | null {
  if (!record(input) || typeof input.operation !== 'string') return null
  const normalizedReason = reason(input.reason)
  if (!normalizedReason) return null
  if (input.operation === 'create_policy') {
    if (
      !exact(input, ['operation', 'policyKey', 'definition', 'reason']) ||
      typeof input.policyKey !== 'string' ||
      !KEY.test(input.policyKey)
    ) return null
    const parsed = parseBreakerPolicy(input.definition)
    return parsed.ok
      ? {
          operation: 'create_policy',
          policyKey: input.policyKey,
          definition: parsed.definition,
          reason: normalizedReason,
        }
      : null
  }
  if (input.operation === 'approve_automatic') {
    return exact(input, ['operation', 'policyId', 'reason']) &&
      typeof input.policyId === 'string' &&
      UUID.test(input.policyId)
      ? { operation: 'approve_automatic', policyId: input.policyId, reason: normalizedReason }
      : null
  }
  if (input.operation === 'prepare_manual') {
    if (
      !exact(input, [
        'operation',
        'policyId',
        'evidenceId',
        'expectedPolicyRevision',
        'expectedSnapshotVersion',
        'reason',
      ]) ||
      typeof input.policyId !== 'string' ||
      !UUID.test(input.policyId) ||
      typeof input.evidenceId !== 'string' ||
      !UUID.test(input.evidenceId) ||
      !positive(input.expectedPolicyRevision) ||
      !snapshot(input.expectedSnapshotVersion)
    ) return null
    return {
      operation: 'prepare_manual',
      policyId: input.policyId,
      evidenceId: input.evidenceId,
      expectedPolicyRevision: input.expectedPolicyRevision,
      expectedSnapshotVersion: input.expectedSnapshotVersion,
      reason: normalizedReason,
    }
  }
  if (input.operation === 'trip_manual') {
    if (
      !exact(input, [
        'operation',
        'policyId',
        'evidenceId',
        'expectedPolicyRevision',
        'expectedSnapshotVersion',
        'confirmationId',
        'confirmationPhrase',
        'reason',
      ]) ||
      typeof input.policyId !== 'string' ||
      !UUID.test(input.policyId) ||
      typeof input.evidenceId !== 'string' ||
      !UUID.test(input.evidenceId) ||
      typeof input.confirmationId !== 'string' ||
      !UUID.test(input.confirmationId) ||
      typeof input.confirmationPhrase !== 'string' ||
      input.confirmationPhrase.length < 16 ||
      input.confirmationPhrase.length > 128 ||
      !positive(input.expectedPolicyRevision) ||
      !snapshot(input.expectedSnapshotVersion)
    ) return null
    return {
      operation: 'trip_manual',
      policyId: input.policyId,
      evidenceId: input.evidenceId,
      expectedPolicyRevision: input.expectedPolicyRevision,
      expectedSnapshotVersion: input.expectedSnapshotVersion,
      confirmationId: input.confirmationId,
      confirmationPhrase: input.confirmationPhrase,
      reason: normalizedReason,
    }
  }
  return null
}

export function parseBreakerAutomaticOperation(input: unknown): BreakerAutomaticOperation | null {
  if (
    !record(input) ||
    !exact(input, [
      'policyId',
      'evidenceId',
      'expectedPolicyRevision',
      'expectedSnapshotVersion',
      'reason',
    ])
  ) return null
  const normalizedReason = reason(input.reason)
  if (
    !normalizedReason ||
    typeof input.policyId !== 'string' ||
    !UUID.test(input.policyId) ||
    typeof input.evidenceId !== 'string' ||
    !UUID.test(input.evidenceId) ||
    !positive(input.expectedPolicyRevision) ||
    !snapshot(input.expectedSnapshotVersion)
  ) return null
  return {
    policyId: input.policyId,
    evidenceId: input.evidenceId,
    expectedPolicyRevision: input.expectedPolicyRevision,
    expectedSnapshotVersion: input.expectedSnapshotVersion,
    reason: normalizedReason,
  }
}
