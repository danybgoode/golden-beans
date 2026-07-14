import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { northStarSyncSchema } from '@/lib/north-star-schema'

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

  const parsed = northStarSyncSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed north-star sync payload', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const inputKeys = parsed.data.inputs.map((i) => i.key)
  const duplicateKeys = [...new Set(inputKeys.filter((key, i) => inputKeys.indexOf(key) !== i))]
  if (duplicateKeys.length > 0) {
    return NextResponse.json(
      { ok: false, error: `Duplicate input key(s) in payload: ${duplicateKeys.join(', ')}` },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServiceClient()

  const { data: metric, error: metricError } = await supabase
    .from('north_star_metrics')
    .upsert(
      {
        project_id: auth.projectId,
        key: parsed.data.metric.key,
        name: parsed.data.metric.name,
        description: parsed.data.metric.description ?? null,
      },
      { onConflict: 'project_id,key' },
    )
    .select('id')
    .single()

  if (metricError || !metric) {
    console.error('[north-star/sync] metric upsert failed:', metricError)
    return NextResponse.json({ ok: false, error: 'Failed to sync North Star metric' }, { status: 500 })
  }

  const inputRows = parsed.data.inputs.map((input) => ({
    project_id: auth.projectId,
    metric_id: metric.id,
    key: input.key,
    name: input.name,
    value_source: input.valueSource,
    source_event: input.sourceEvent ?? null,
  }))

  const { data: inputs, error: inputsError } = await supabase
    .from('leading_inputs')
    .upsert(inputRows, { onConflict: 'project_id,key' })
    .select('key')

  if (inputsError) {
    console.error('[north-star/sync] inputs upsert failed:', inputsError)
    return NextResponse.json({ ok: false, error: 'Failed to sync leading inputs' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, metric: parsed.data.metric.key, inputsSynced: inputs?.length ?? 0 })
}
