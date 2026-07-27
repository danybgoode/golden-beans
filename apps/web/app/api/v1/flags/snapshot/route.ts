import { NextRequest, NextResponse } from 'next/server'
import { hashCredential } from '@/lib/credential-hash'
import { isFlagServingEnabled } from '@/lib/flags'
import { getSupabaseServiceClient } from '@/lib/supabase'

// Operational snapshot route. Its caller cannot supply a project or environment: both are derived
// atomically from the revocable flag_read credential inside get_flag_read_snapshot().
export async function GET(req: NextRequest) {
  // Gate before credential work so OFF is a real whole-surface kill switch and does not become a
  // credential-validity oracle. Definitions/audit are intentionally governed elsewhere, not here.
  if (!isFlagServingEnabled()) return new NextResponse(null, { status: 404 })

  const authHeader = req.headers.get('authorization')
  if (!authHeader?.startsWith('Bearer ')) return unauthorized()
  const rawKey = authHeader.slice('Bearer '.length).trim()
  if (!rawKey) return unauthorized()

  const { data, error } = await getSupabaseServiceClient().rpc('get_flag_read_snapshot', {
    p_key_hash: hashCredential(rawKey),
  })
  if (error) {
    console.error('[flags/snapshot] lookup failed:', error)
    return NextResponse.json({ ok: false, error: 'Could not load flag snapshot' }, { status: 500 })
  }
  const row = data?.[0] as { environment?: string; snapshot_version?: number; flags?: unknown } | undefined
  if (!row || typeof row.environment !== 'string' || typeof row.snapshot_version !== 'number' || !Array.isArray(row.flags)) {
    return unauthorized()
  }

  const etag = `"gbfs-${row.snapshot_version}"`
  if (ifNoneMatchIncludes(req.headers.get('if-none-match'), etag)) {
    return new NextResponse(null, { status: 304, headers: snapshotHeaders(etag) })
  }
  return NextResponse.json(
    {
      contractVersion: 1,
      environment: row.environment,
      snapshotVersion: row.snapshot_version,
      flags: row.flags,
    },
    { headers: snapshotHeaders(etag) },
  )
}

function unauthorized() {
  // Unknown, expired, revoked and every other credential scope are indistinguishable by design.
  return NextResponse.json({ ok: false, error: 'Invalid flag read credential' }, { status: 401 })
}

function snapshotHeaders(etag: string): HeadersInit {
  return { ETag: etag, 'Cache-Control': 'private, max-age=0, must-revalidate' }
}

function ifNoneMatchIncludes(header: string | null, etag: string): boolean {
  if (!header) return false
  return header.split(',').map((value) => value.trim()).includes(etag) || header.trim() === '*'
}
