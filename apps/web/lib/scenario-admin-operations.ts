import 'server-only'
import { guardedHttpOwnershipProofPost } from './guarded-http'
import type { ScenarioAdminOperation } from './scenario-admin-operation'
import {
  SCENARIO_TARGET_REQUEST_HEADER,
  createScenarioTargetRegistrationChallenge,
  createScenarioTargetRequestSignature,
  createScenarioTargetResponseProof,
  hashScenarioTargetChallenge,
  scenarioTargetProofMatches,
} from './scenario-target-proof'
import { getSupabaseServiceClient } from './supabase'

export const SCENARIO_TARGET_OWNERSHIP_PATH = '/api/internal/resilience/ownership'

type Environment = 'development' | 'preview' | 'production'
type ScenarioTarget = {
  id: string
  key: string
  targetKind: 'miyagi_resilience_probe_v1'
  origin: string
  status: 'pending' | 'verified' | 'revoked'
  createdAt: string
  verifiedAt: string | null
  revokedAt: string | null
}
type ScenarioVersion = {
  scenarioId: string
  scenarioVersionId: string
  scenarioKey: string
  version: number
  definition: Record<string, unknown>
  createdAt: string
}
type ScenarioApproval = {
  id: string
  scenarioVersionId: string
  approvalKind: 'external_cohort' | 'production_security'
  actorUserId: string
  externalActorId: string
  reason: string
  createdAt: string
}
type ScenarioRun = {
  id: string
  scenarioId: string
  scenarioVersionId: string
  targetId: string
  status: 'draft' | 'running' | 'stopped' | 'aborted' | 'expired'
  revision: number
  requestCount: number
  activeLeaseCount: number
  successCount: number
  failureCount: number
  createdAt: string
  startedAt: string | null
  stoppedAt: string | null
  stopReason: string | null
}
type ScenarioAuditEntry = {
  id: string
  scenarioId: string | null
  scenarioVersionId: string | null
  runId: string | null
  targetId: string | null
  action:
    | 'target_registered'
    | 'target_verified'
    | 'target_revoked'
    | 'version_created'
    | 'owner_approved'
    | 'run_created'
    | 'run_started'
    | 'run_stopped'
    | 'run_aborted'
    | 'run_expired'
    | 'execution_reserved'
    | 'execution_settled'
    | 'execution_lease_expired'
    | 'security_result_recorded'
  actorUserId: string
  externalActorId: string | null
  reason: string
  metadata: Record<string, unknown>
  createdAt: string
}

export type ScenarioAdminSnapshot = {
  environment: Environment
  snapshotVersion: number
  generatedAt: string
  targets: ScenarioTarget[]
  versions: ScenarioVersion[]
  approvals: ScenarioApproval[]
  runs: ScenarioRun[]
  audit: ScenarioAuditEntry[]
}

type OperationResult<T extends Record<string, unknown>> =
  ({ ok: true } & T) | { ok: false; status: 400 | 401 | 403 | 409 | 502 | 500 }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function isEnvironment(value: unknown): value is Environment {
  return value === 'development' || value === 'preview' || value === 'production'
}

function stringOrNull(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

function validTarget(value: unknown): value is ScenarioTarget {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    typeof value.key === 'string' &&
    value.targetKind === 'miyagi_resilience_probe_v1' &&
    typeof value.origin === 'string' &&
    (value.status === 'pending' || value.status === 'verified' || value.status === 'revoked') &&
    typeof value.createdAt === 'string' &&
    stringOrNull(value.verifiedAt) &&
    stringOrNull(value.revokedAt) &&
    !('ownershipChallengeHash' in value)
  )
}

function validVersion(value: unknown): value is ScenarioVersion {
  return (
    isRecord(value) &&
    typeof value.scenarioId === 'string' &&
    typeof value.scenarioVersionId === 'string' &&
    typeof value.scenarioKey === 'string' &&
    Number.isSafeInteger(value.version) &&
    Number(value.version) >= 1 &&
    isRecord(value.definition) &&
    typeof value.createdAt === 'string'
  )
}

function validApproval(value: unknown): value is ScenarioApproval {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.scenarioVersionId === 'string' &&
    (value.approvalKind === 'external_cohort' || value.approvalKind === 'production_security') &&
    typeof value.actorUserId === 'string' &&
    typeof value.externalActorId === 'string' &&
    typeof value.reason === 'string' &&
    typeof value.createdAt === 'string'
  )
}

function validRun(value: unknown): value is ScenarioRun {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.scenarioId === 'string' &&
    typeof value.scenarioVersionId === 'string' &&
    typeof value.targetId === 'string' &&
    (value.status === 'draft' ||
      value.status === 'running' ||
      value.status === 'stopped' ||
      value.status === 'aborted' ||
      value.status === 'expired') &&
    Number.isSafeInteger(value.revision) &&
    Number(value.revision) >= 1 &&
    ['requestCount', 'activeLeaseCount', 'successCount', 'failureCount'].every(
      (key) => Number.isSafeInteger(value[key]) && Number(value[key]) >= 0
    ) &&
    typeof value.createdAt === 'string' &&
    stringOrNull(value.startedAt) &&
    stringOrNull(value.stoppedAt) &&
    stringOrNull(value.stopReason)
  )
}

function validAuditEntry(value: unknown): value is ScenarioAuditEntry {
  if (!isRecord(value)) return false
  return (
    typeof value.id === 'string' &&
    stringOrNull(value.scenarioId) &&
    stringOrNull(value.scenarioVersionId) &&
    stringOrNull(value.runId) &&
    stringOrNull(value.targetId) &&
    [
      'target_registered',
      'target_verified',
      'target_revoked',
      'version_created',
      'owner_approved',
      'run_created',
      'run_started',
      'run_stopped',
      'run_aborted',
      'run_expired',
      'execution_reserved',
      'execution_settled',
      'execution_lease_expired',
      'security_result_recorded',
    ].includes(String(value.action)) &&
    typeof value.actorUserId === 'string' &&
    stringOrNull(value.externalActorId) &&
    typeof value.reason === 'string' &&
    isRecord(value.metadata) &&
    typeof value.createdAt === 'string' &&
    !('ownershipChallengeHash' in value) &&
    !('credential' in value) &&
    !('keyHash' in value)
  )
}

function mutationStatus(code: string | undefined): 400 | 403 | 409 | 500 {
  if (code === '22023') return 400
  if (code === '42501') return 403
  if (code === 'P0001' || code === '55000' || code === '23505') return 409
  return 500
}

function logUnexpected(operation: string, error: { code?: string }) {
  console.error(`[scenario-admin] ${operation} failed`, { code: error.code ?? 'unknown' })
}

export async function getScenarioAdminSnapshot(keyHash: string): Promise<ScenarioAdminSnapshot | null> {
  const { data, error } = await getSupabaseServiceClient().rpc('get_scenario_admin_snapshot', {
    p_key_hash: keyHash,
  })
  if (error) {
    logUnexpected('snapshot', error)
    throw new Error('Could not load scenario administration snapshot')
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (!row) return null
  if (
    !isEnvironment(row.environment) ||
    !Number.isSafeInteger(row.snapshot_version) ||
    Number(row.snapshot_version) < 0 ||
    typeof row.generated_at !== 'string' ||
    !Array.isArray(row.targets) ||
    !row.targets.every(validTarget) ||
    !Array.isArray(row.versions) ||
    !row.versions.every(validVersion) ||
    !Array.isArray(row.approvals) ||
    !row.approvals.every(validApproval) ||
    !Array.isArray(row.runs) ||
    !row.runs.every(validRun) ||
    !Array.isArray(row.audit) ||
    row.audit.length > 100 ||
    !row.audit.every(validAuditEntry)
  ) {
    throw new Error('Malformed scenario administration snapshot')
  }
  return {
    environment: row.environment,
    snapshotVersion: Number(row.snapshot_version),
    generatedAt: row.generated_at,
    targets: row.targets,
    versions: row.versions,
    approvals: row.approvals,
    runs: row.runs,
    audit: row.audit,
  }
}

export async function registerScenarioTarget(input: {
  keyHash: string
  rawKey: string
  actor: string
  operation: Extract<ScenarioAdminOperation, { operation: 'register_target' }>
}): Promise<OperationResult<{ targetId: string; status: string; created: boolean; challenge: string }>> {
  const challenge = createScenarioTargetRegistrationChallenge({
    secret: input.rawKey,
    targetKey: input.operation.targetKey,
    origin: input.operation.origin,
  })
  const { data, error } = await getSupabaseServiceClient().rpc('register_scenario_target', {
    p_key_hash: input.keyHash,
    p_target_key: input.operation.targetKey,
    p_target_kind: input.operation.targetKind,
    p_origin: input.operation.origin,
    p_ownership_challenge_hash: hashScenarioTargetChallenge(challenge),
    p_reason: input.operation.reason,
    p_external_actor_id: input.actor,
  })
  if (error) {
    const status = mutationStatus(error.code)
    if (status === 500) logUnexpected('target registration', error)
    return { ok: false, status }
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (
    !row ||
    typeof row.target_id !== 'string' ||
    typeof row.status !== 'string' ||
    typeof row.created !== 'boolean'
  ) {
    return { ok: false, status: row ? 500 : 401 }
  }
  return {
    ok: true,
    targetId: row.target_id,
    status: row.status,
    created: row.created,
    challenge,
  }
}

export async function verifyScenarioTarget(input: {
  keyHash: string
  rawKey: string
  actor: string
  operation: Extract<ScenarioAdminOperation, { operation: 'verify_target' }>
}): Promise<OperationResult<{ targetId: string; status: string; changed: boolean }>> {
  const snapshot = await getScenarioAdminSnapshot(input.keyHash)
  if (!snapshot) return { ok: false, status: 401 }
  const target = snapshot.targets.find((candidate) => candidate.id === input.operation.targetId)
  if (!target) return { ok: false, status: 400 }
  if (target.status === 'verified') {
    return { ok: true, targetId: target.id, status: target.status, changed: false }
  }
  if (target.status !== 'pending') return { ok: false, status: 409 }

  const signature = createScenarioTargetRequestSignature({
    secret: input.rawKey,
    challenge: input.operation.challenge,
    targetKey: target.key,
    origin: target.origin,
  })
  const expected = createScenarioTargetResponseProof({
    secret: input.rawKey,
    challenge: input.operation.challenge,
    targetKey: target.key,
    origin: target.origin,
  })
  const response = await guardedHttpOwnershipProofPost({
    targetUrl: `${target.origin}${SCENARIO_TARGET_OWNERSHIP_PATH}`,
    headers: {
      'Content-Type': 'application/json',
      [SCENARIO_TARGET_REQUEST_HEADER]: signature,
    },
    body: JSON.stringify({
      contractVersion: 1,
      challenge: input.operation.challenge,
      targetKey: target.key,
    }),
    timeoutMs: 5_000,
  })
  if (
    response.outcome !== 'response' ||
    response.status !== 204 ||
    !scenarioTargetProofMatches(expected, response.proof)
  ) {
    return { ok: false, status: 502 }
  }

  const { data, error } = await getSupabaseServiceClient().rpc('verify_scenario_target', {
    p_key_hash: input.keyHash,
    p_target_id: target.id,
    p_expected_challenge_hash: hashScenarioTargetChallenge(input.operation.challenge),
    p_reason: input.operation.reason,
    p_external_actor_id: input.actor,
  })
  if (error) {
    const status = mutationStatus(error.code)
    if (status === 500) logUnexpected('target verification', error)
    return { ok: false, status }
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (
    !row ||
    typeof row.target_id !== 'string' ||
    typeof row.status !== 'string' ||
    typeof row.changed !== 'boolean'
  ) {
    return { ok: false, status: row ? 500 : 400 }
  }
  return {
    ok: true,
    targetId: row.target_id,
    status: row.status,
    changed: row.changed,
  }
}

async function simpleRpc(
  name: string,
  args: Record<string, unknown>
): Promise<OperationResult<Record<string, unknown>>> {
  const { data, error } = await getSupabaseServiceClient().rpc(name, args)
  if (error) {
    const status = mutationStatus(error.code)
    if (status === 500) logUnexpected(name, error)
    return { ok: false, status }
  }
  const row = data?.[0]
  if (!isRecord(row)) return { ok: false, status: row ? 500 : 401 }
  return { ok: true, ...row }
}

export async function executeScenarioAdminOperation(input: {
  keyHash: string
  actor: string
  operation: Exclude<ScenarioAdminOperation, { operation: 'register_target' | 'verify_target' }>
}): Promise<OperationResult<Record<string, unknown>>> {
  const common = {
    p_key_hash: input.keyHash,
    p_reason: input.operation.reason,
    p_external_actor_id: input.actor,
  }
  switch (input.operation.operation) {
    case 'revoke_target':
      return simpleRpc('revoke_scenario_target', {
        ...common,
        p_target_id: input.operation.targetId,
      })
    case 'create_definition':
      return simpleRpc('create_scenario_definition_version', {
        ...common,
        p_scenario_key: input.operation.scenarioKey,
        p_definition: input.operation.definition,
      })
    case 'approve_definition':
      return simpleRpc('approve_scenario_definition', {
        ...common,
        p_scenario_version_id: input.operation.scenarioVersionId,
        p_approval_kind: input.operation.approvalKind,
      })
    case 'create_run':
      return simpleRpc('create_scenario_run', {
        ...common,
        p_scenario_version_id: input.operation.scenarioVersionId,
      })
    case 'start_run':
      return simpleRpc('start_scenario_run', {
        ...common,
        p_run_id: input.operation.runId,
        p_expected_revision: input.operation.expectedRevision,
      })
    case 'transition_run':
      return simpleRpc('transition_scenario_run', {
        ...common,
        p_run_id: input.operation.runId,
        p_expected_revision: input.operation.expectedRevision,
        p_transition: input.operation.transition,
      })
  }
}
