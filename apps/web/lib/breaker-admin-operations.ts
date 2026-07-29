import 'server-only'
import { createHash, randomBytes } from 'node:crypto'
import type { BreakerAdminOperation, BreakerAutomaticOperation } from './breaker-admin-operation'
import { getSupabaseServiceClient } from './supabase'

type OperationResult =
  ({ ok: true } & Record<string, unknown>) | { ok: false; status: 400 | 401 | 403 | 409 | 500 }

function status(code: string | undefined): 400 | 403 | 409 | 500 {
  if (code === '22023') return 400
  if (code === '42501') return 403
  if (code === '55000' || code === 'P0001' || code === '23505') return 409
  return 500
}

function hash(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

async function rpc(name: string, args: Record<string, unknown>): Promise<OperationResult> {
  const { data, error } = await getSupabaseServiceClient().rpc(name, args)
  if (error) {
    const mapped = status(error.code)
    if (mapped === 500)
      console.error('[breaker-admin] operation failed', {
        operation: name,
        code: error.code,
        message: error.message,
      })
    return { ok: false, status: mapped }
  }
  const row = data?.[0]
  if (row === null || typeof row !== 'object' || Array.isArray(row)) {
    return { ok: false, status: row ? 500 : 401 }
  }
  return { ok: true, ...row }
}

export async function executeBreakerAdminOperation(input: {
  keyHash: string
  actor: string
  operation: BreakerAdminOperation
}): Promise<OperationResult> {
  const common = {
    p_key_hash: input.keyHash,
    p_reason: input.operation.reason,
    p_external_actor_id: input.actor,
  }
  switch (input.operation.operation) {
    case 'create_policy':
      return rpc('create_breaker_policy', {
        ...common,
        p_policy_key: input.operation.policyKey,
        p_definition: input.operation.definition,
      })
    case 'approve_automatic':
      return rpc('approve_breaker_automatic', {
        ...common,
        p_policy_id: input.operation.policyId,
      })
    case 'prepare_manual': {
      const phrase = `TRIP-${randomBytes(24).toString('base64url')}`
      const result = await rpc('prepare_breaker_confirmation', {
        ...common,
        p_policy_id: input.operation.policyId,
        p_evidence_id: input.operation.evidenceId,
        p_expected_policy_revision: input.operation.expectedPolicyRevision,
        p_expected_snapshot_version: input.operation.expectedSnapshotVersion,
        p_phrase_hash: hash(phrase),
      })
      return result.ok ? { ...result, confirmationPhrase: phrase } : result
    }
    case 'trip_manual':
      return rpc('trip_breaker_policy', {
        ...common,
        p_policy_id: input.operation.policyId,
        p_evidence_id: input.operation.evidenceId,
        p_expected_policy_revision: input.operation.expectedPolicyRevision,
        p_expected_snapshot_version: input.operation.expectedSnapshotVersion,
        p_mode: 'manual',
        p_confirmation_id: input.operation.confirmationId,
        p_phrase_hash: hash(input.operation.confirmationPhrase),
      })
  }
}

export async function executeAutomaticBreaker(input: {
  keyHash: string
  operation: BreakerAutomaticOperation
}): Promise<OperationResult> {
  return rpc('trip_breaker_policy', {
    p_key_hash: input.keyHash,
    p_policy_id: input.operation.policyId,
    p_evidence_id: input.operation.evidenceId,
    p_expected_policy_revision: input.operation.expectedPolicyRevision,
    p_expected_snapshot_version: input.operation.expectedSnapshotVersion,
    p_mode: 'automatic',
    p_confirmation_id: null,
    p_phrase_hash: null,
    p_reason: input.operation.reason,
    p_external_actor_id: 'system:automatic_breaker',
  })
}

export async function getBreakerAdminSnapshot(keyHash: string): Promise<Record<string, unknown> | null> {
  const { data, error } = await getSupabaseServiceClient().rpc('get_breaker_admin_snapshot', {
    p_key_hash: keyHash,
  })
  if (error) {
    console.error('[breaker-admin] snapshot failed', { code: error.code })
    throw new Error('Could not load breaker snapshot')
  }
  const row = data?.[0]
  if (row === null || typeof row !== 'object' || Array.isArray(row)) return null
  if (
    typeof row.environment !== 'string' ||
    !Number.isSafeInteger(row.snapshot_version) ||
    typeof row.generated_at !== 'string' ||
    !Array.isArray(row.policies) ||
    !Array.isArray(row.approvals) ||
    !Array.isArray(row.trips) ||
    row.trips.length > 100 ||
    !Array.isArray(row.audit) ||
    row.audit.length > 100
  )
    throw new Error('Malformed breaker snapshot')
  return {
    environment: row.environment,
    snapshotVersion: row.snapshot_version,
    generatedAt: row.generated_at,
    policies: row.policies,
    approvals: row.approvals,
    trips: row.trips,
    audit: row.audit,
  }
}
