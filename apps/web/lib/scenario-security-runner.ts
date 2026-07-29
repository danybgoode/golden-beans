import 'server-only'
import { guardedHttpPost } from './guarded-http'
import {
  createScenarioSecurityRequestSignature,
  SCENARIO_SECURITY_REQUEST_HEADER,
  SCENARIO_SECURITY_TARGET_PATH,
  type ScenarioSecurityRequest,
} from './scenario-security-request'
import { getSupabaseServiceClient } from './supabase'

type SecurityTemplate =
  'malformed_payload_v1' | 'rate_limit_v1' | 'invalid_credential_v1' | 'revoked_credential_v1'

type ReserveResult = {
  leaseId: string
  runRevision: number
  expiresAt: string
  targetKey: string
  targetOrigin: string
  template: SecurityTemplate
  requestUnits: number
}

export type ScenarioSecurityResult = {
  id: string
  scenarioId: string
  scenarioVersionId: string
  runId: string
  leaseId: string
  targetId: string
  template: SecurityTemplate
  expectedOutcome:
    'validation_rejected' | 'rate_limited' | 'credential_rejected' | 'revoked_credential_rejected'
  observedOutcome:
    | 'validation_rejected'
    | 'rate_limited'
    | 'credential_rejected'
    | 'revoked_credential_rejected'
    | 'unexpected_response'
    | 'transport_failure'
  observedStatuses: Array<number | null>
  succeeded: boolean
  latencyMs: number
  createdAt: string
}

type RunResult =
  | {
      ok: true
      resultId: string
      runRevision: number
      runStatus: string
      observedOutcome: string
      succeeded: boolean
    }
  | {
      ok: false
      status: 401 | 409 | 429 | 500
      reason?: string
    }

const TEMPLATES = new Set<SecurityTemplate>([
  'malformed_payload_v1',
  'rate_limit_v1',
  'invalid_credential_v1',
  'revoked_credential_v1',
])
const EXPECTED_OUTCOMES = new Set([
  'validation_rejected',
  'rate_limited',
  'credential_rejected',
  'revoked_credential_rejected',
])
const OBSERVED_OUTCOMES = new Set([...EXPECTED_OUTCOMES, 'unexpected_response', 'transport_failure'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function parseReserveRow(
  value: unknown
): { kind: 'admitted'; value: ReserveResult } | { kind: 'rejected'; reason: string } | null {
  if (!isRecord(value) || typeof value.admitted !== 'boolean') return null
  if (!value.admitted) {
    return typeof value.reason === 'string' ? { kind: 'rejected', reason: value.reason } : null
  }
  if (
    typeof value.lease_id !== 'string' ||
    !Number.isSafeInteger(value.run_revision) ||
    typeof value.expires_at !== 'string' ||
    typeof value.target_key !== 'string' ||
    typeof value.target_origin !== 'string' ||
    typeof value.template !== 'string' ||
    !TEMPLATES.has(value.template as SecurityTemplate) ||
    !Number.isSafeInteger(value.request_units) ||
    (value.request_units !== 1 && value.request_units !== 3)
  ) {
    return null
  }
  return {
    kind: 'admitted',
    value: {
      leaseId: value.lease_id,
      runRevision: Number(value.run_revision),
      expiresAt: value.expires_at,
      targetKey: value.target_key,
      targetOrigin: value.target_origin,
      template: value.template as SecurityTemplate,
      requestUnits: Number(value.request_units),
    },
  }
}

function rejectionStatus(reason: string): 409 | 429 {
  return reason === 'REQUEST_CAP' || reason === 'CONCURRENCY_CAP' || reason === 'COOLDOWN' ? 429 : 409
}

async function reserve(input: {
  keyHash: string
  runId: string
  expectedRevision: number
}): Promise<
  { ok: true; reservation: ReserveResult } | { ok: false; status: 401 | 409 | 429 | 500; reason?: string }
> {
  const { data, error } = await getSupabaseServiceClient().rpc('reserve_security_scenario_execution', {
    p_key_hash: input.keyHash,
    p_run_id: input.runId,
    p_expected_run_revision: input.expectedRevision,
  })
  if (error) {
    console.error('[scenario-security] reservation failed', {
      code: error.code ?? 'unknown',
    })
    return { ok: false, status: 500 }
  }
  const row = data?.[0]
  if (!row) return { ok: false, status: 401 }
  const parsed = parseReserveRow(row)
  if (!parsed) return { ok: false, status: 500 }
  if (parsed.kind === 'rejected') {
    return {
      ok: false,
      status: rejectionStatus(parsed.reason),
      reason: parsed.reason,
    }
  }
  return { ok: true, reservation: parsed.value }
}

async function settle(input: {
  keyHash: string
  runId: string
  leaseId: string
  statuses: Array<number | null>
  latencyMs: number
}): Promise<RunResult> {
  const { data, error } = await getSupabaseServiceClient().rpc('settle_security_scenario_execution', {
    p_key_hash: input.keyHash,
    p_run_id: input.runId,
    p_lease_id: input.leaseId,
    p_observed_statuses: input.statuses,
    p_latency_ms: Math.min(15_000, Math.max(0, Math.round(input.latencyMs))),
  })
  if (error) {
    console.error('[scenario-security] settlement failed', {
      code: error.code ?? 'unknown',
    })
    return { ok: false, status: 500 }
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (!row) return { ok: false, status: 401 }
  if (
    typeof row.result_id !== 'string' ||
    !Number.isSafeInteger(row.run_revision) ||
    typeof row.run_status !== 'string' ||
    typeof row.observed_outcome !== 'string' ||
    typeof row.succeeded !== 'boolean'
  ) {
    return { ok: false, status: 500 }
  }
  return {
    ok: true,
    resultId: row.result_id,
    runRevision: Number(row.run_revision),
    runStatus: row.run_status,
    observedOutcome: row.observed_outcome,
    succeeded: row.succeeded,
  }
}

export async function runScenarioSecurityTemplate(input: {
  keyHash: string
  rawKey: string
  runId: string
  expectedRevision: number
}): Promise<RunResult> {
  const reserved = await reserve(input)
  if (!reserved.ok) return reserved
  const { reservation } = reserved
  const startedAt = Date.now()
  const statuses: Array<number | null> = []

  for (let attempt = 1; attempt <= reservation.requestUnits; attempt += 1) {
    const request: ScenarioSecurityRequest = {
      contractVersion: 1,
      runId: input.runId,
      leaseId: reservation.leaseId,
      runRevision: reservation.runRevision,
      targetKey: reservation.targetKey,
      template: reservation.template,
      attempt,
    }
    const signature = createScenarioSecurityRequestSignature({
      secret: input.rawKey,
      origin: reservation.targetOrigin,
      request,
    })
    const response = await guardedHttpPost({
      targetUrl: `${reservation.targetOrigin}${SCENARIO_SECURITY_TARGET_PATH}`,
      headers: {
        'Content-Type': 'application/json',
        [SCENARIO_SECURITY_REQUEST_HEADER]: signature,
      },
      body: JSON.stringify(request),
      timeoutMs: 4_000,
    })
    statuses.push(response.outcome === 'response' ? response.status : null)
  }

  return settle({
    keyHash: input.keyHash,
    runId: input.runId,
    leaseId: reservation.leaseId,
    statuses,
    latencyMs: Date.now() - startedAt,
  })
}

function validSecurityResult(value: unknown): value is ScenarioSecurityResult {
  if (!isRecord(value)) return false
  return (
    ['id', 'scenarioId', 'scenarioVersionId', 'runId', 'leaseId', 'targetId', 'createdAt'].every(
      (key) => typeof value[key] === 'string'
    ) &&
    typeof value.template === 'string' &&
    TEMPLATES.has(value.template as SecurityTemplate) &&
    typeof value.expectedOutcome === 'string' &&
    EXPECTED_OUTCOMES.has(value.expectedOutcome) &&
    typeof value.observedOutcome === 'string' &&
    OBSERVED_OUTCOMES.has(value.observedOutcome) &&
    Array.isArray(value.observedStatuses) &&
    value.observedStatuses.length >= 1 &&
    value.observedStatuses.length <= 3 &&
    value.observedStatuses.every(
      (status) =>
        status === null || (Number.isSafeInteger(status) && Number(status) >= 100 && Number(status) <= 599)
    ) &&
    typeof value.succeeded === 'boolean' &&
    Number.isSafeInteger(value.latencyMs) &&
    Number(value.latencyMs) >= 0 &&
    Number(value.latencyMs) <= 15_000
  )
}

export async function getScenarioSecurityResults(
  keyHash: string
): Promise<{ generatedAt: string; results: ScenarioSecurityResult[] } | null> {
  const { data, error } = await getSupabaseServiceClient().rpc('get_scenario_security_results', {
    p_key_hash: keyHash,
  })
  if (error) {
    console.error('[scenario-security] results lookup failed', {
      code: error.code ?? 'unknown',
    })
    throw new Error('Could not load scenario security results')
  }
  const row = data?.[0] as Record<string, unknown> | undefined
  if (!row) return null
  if (
    typeof row.generated_at !== 'string' ||
    !Array.isArray(row.results) ||
    row.results.length > 100 ||
    !row.results.every(validSecurityResult)
  ) {
    throw new Error('Malformed scenario security results')
  }
  return { generatedAt: row.generated_at, results: row.results }
}
