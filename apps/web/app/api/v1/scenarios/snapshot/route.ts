import { NextRequest, NextResponse } from 'next/server'
import { hashCredential } from '@/lib/credential-hash'
import { isResilienceScenariosEnabled } from '@/lib/flags'
import { parseScenarioSnapshot } from '@/lib/scenario-definition'
import { getSupabaseServiceClient } from '@/lib/supabase'

function unauthorized() {
  // Unknown, expired, revoked and wrong-scope credentials remain indistinguishable.
  return NextResponse.json({ ok: false, error: 'Invalid flag read credential' }, { status: 401 })
}

function snapshotHeaders(etag: string): HeadersInit {
  return { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' }
}

function ifNoneMatchIncludes(header: string | null, etag: string): boolean {
  if (!header) return false
  return header
    .split(',')
    .map((value) => value.trim())
    .some((value) => value === etag || value === '*')
}

/**
 * Operational resilience snapshot. Project/environment are welded to the revocable flag_read
 * credential inside the RPC; request query/body data cannot select either. Target origins and
 * ownership challenges are never part of this contract.
 */
export async function GET(req: NextRequest) {
  // Gate before credential work so OFF cannot become a credential-validity oracle.
  if (!isResilienceScenariosEnabled()) return new NextResponse(null, { status: 404 })

  const authorization = req.headers.get('authorization')
  if (!authorization?.startsWith('Bearer ')) return unauthorized()
  const rawKey = authorization.slice('Bearer '.length).trim()
  if (!rawKey) return unauthorized()

  const { data, error } = await getSupabaseServiceClient().rpc('get_scenario_read_snapshot', {
    p_key_hash: hashCredential(rawKey),
  })
  if (error) {
    console.error('[scenarios/snapshot] lookup failed', { code: error.code ?? 'unknown' })
    return NextResponse.json({ ok: false, error: 'Could not load scenario snapshot' }, { status: 500 })
  }
  const row = data?.[0] as
    | {
        environment?: unknown
        snapshot_version?: unknown
        generated_at?: unknown
        scenarios?: unknown
      }
    | undefined
  if (!row) return unauthorized()

  const parsed = parseScenarioSnapshot({
    contractVersion: 1,
    environment: row.environment,
    revision: row.snapshot_version,
    generatedAt: row.generated_at,
    scenarios: row.scenarios,
  })
  if (!parsed.ok) {
    // A malformed database snapshot is a server defect, never an empty/control-looking success.
    console.error('[scenarios/snapshot] malformed result', { errorCount: parsed.errors.length })
    return NextResponse.json({ ok: false, error: 'Could not load scenario snapshot' }, { status: 500 })
  }

  const etag = `"gbsc-${parsed.snapshot.revision}"`
  if (ifNoneMatchIncludes(req.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers: snapshotHeaders(etag) })
  }
  return NextResponse.json(parsed.snapshot, { headers: snapshotHeaders(etag) })
}
