import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { featureSyncSchema } from '@/lib/feature-schema'

export async function POST(req: NextRequest) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = featureSyncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed sync payload', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // A duplicate key in one payload would upsert-conflict on (project_id, key) twice in the
  // same statement, which Postgres can reject outright — surface it as a clean 400 instead.
  const keys = parsed.data.features.map((f) => f.key)
  const duplicateKeys = [...new Set(keys.filter((key, i) => keys.indexOf(key) !== i))]
  if (duplicateKeys.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Duplicate feature key(s) in payload: ${duplicateKeys.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServiceClient()
  const now = new Date().toISOString()
  const rows = parsed.data.features.map((f) => ({
    project_id: auth.projectId, // resolved from the API key, never from the body — same tenant rule as /v1/track
    key: f.key,
    enabled: f.enabled,
    target_event: f.targetEvent ?? null,
    adopted_event: f.adoptedEvent ?? null,
    retained_event: f.retainedEvent ?? null,
    retention_days: f.retentionDays ?? 7,
    description: f.description ?? null,
    synced_at: now, // always bumped, even when values are unchanged, so a re-sync is visibly fresh
  }))

  const { data, error } = await supabase
    .from('features')
    .upsert(rows, { onConflict: 'project_id,key' })
    .select('key')

  if (error) {
    console.error('[features/sync] upsert failed:', error)
    return NextResponse.json({ ok: false, error: 'Failed to sync features' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, synced: data?.length ?? 0 }, { status: 200 })
}
