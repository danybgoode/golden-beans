import { NextRequest, NextResponse } from 'next/server'
import { hashCredential } from '@/lib/credential-hash'
import { isResilienceScenariosEnabled } from '@/lib/flags'
import { parseScenarioExecutionOperation } from '@/lib/scenario-execution-operation'
import { getSupabaseServiceClient } from '@/lib/supabase'

function credential(req: NextRequest): string | null {
  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return null
  const value = authorization.slice('Bearer '.length).trim()
  return value || null
}

function unauthorized() {
  // Unknown/revoked credentials, foreign runs and unknown leases remain indistinguishable.
  return NextResponse.json({ ok: false, error: 'Invalid scenario execution credential' }, { status: 401 })
}

export async function POST(req: NextRequest) {
  // Gate before body or credential work so OFF cannot become a validity oracle.
  if (!isResilienceScenariosEnabled()) return new NextResponse(null, { status: 404 })

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid scenario execution command' }, { status: 400 })
  }
  const operation = parseScenarioExecutionOperation(body)
  if (!operation) {
    return NextResponse.json({ ok: false, error: 'Invalid scenario execution command' }, { status: 400 })
  }
  const rawKey = credential(req)
  if (!rawKey) return unauthorized()

  const client = getSupabaseServiceClient()
  if (operation.operation === 'reserve') {
    const { data, error } = await client.rpc('reserve_scenario_execution', {
      p_key_hash: hashCredential(rawKey),
      p_run_id: operation.runId,
      p_expected_run_revision: operation.expectedRunRevision,
    })
    if (error) {
      console.error('[scenarios/execution] reservation failed', { code: error.code ?? 'unknown' })
      return NextResponse.json({ ok: false, error: 'Could not reserve scenario execution' }, { status: 500 })
    }
    const row = data?.[0] as
      | {
          lease_id?: unknown
          run_revision?: unknown
          expires_at?: unknown
          admitted?: unknown
          reason?: unknown
        }
      | undefined
    if (!row) return unauthorized()
    return NextResponse.json(
      {
        operation: 'reserve',
        leaseId: row.lease_id ?? null,
        runRevision: row.run_revision,
        expiresAt: row.expires_at ?? null,
        admitted: row.admitted,
        reason: row.reason,
      },
      { headers: { 'Cache-Control': 'no-store' } }
    )
  }

  const { data, error } = await client.rpc('settle_scenario_execution', {
    p_key_hash: hashCredential(rawKey),
    p_run_id: operation.runId,
    p_lease_id: operation.leaseId,
    p_succeeded: operation.succeeded,
  })
  if (error) {
    console.error('[scenarios/execution] settlement failed', { code: error.code ?? 'unknown' })
    return NextResponse.json({ ok: false, error: 'Could not settle scenario execution' }, { status: 500 })
  }
  const row = data?.[0] as
    | {
        lease_id?: unknown
        run_revision?: unknown
        run_status?: unknown
        active_lease_count?: unknown
        success_count?: unknown
        failure_count?: unknown
        settled?: unknown
        reason?: unknown
      }
    | undefined
  if (!row) return unauthorized()
  return NextResponse.json(
    {
      operation: 'settle',
      leaseId: row.lease_id,
      runRevision: row.run_revision,
      runStatus: row.run_status,
      activeLeaseCount: row.active_lease_count,
      successCount: row.success_count,
      failureCount: row.failure_count,
      settled: row.settled,
      reason: row.reason,
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
