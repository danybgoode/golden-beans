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

  // An existing input's value_source must never silently change on re-sync: switching
  // attributed_revenue from external_push to telemetry_event (a typo, a copy-paste
  // mistake) would make north-star-query.ts start computing its series from `events`
  // instead of `input_values` — every previously-pushed real revenue row would go
  // invisible in the report with no error, even though the rows themselves still exist.
  const { data: existingInputs, error: existingInputsError } = await supabase
    .from('leading_inputs')
    .select('key, value_source')
    .eq('project_id', auth.projectId)
    .in(
      'key',
      parsed.data.inputs.map((i) => i.key),
    )
  if (existingInputsError) {
    console.error('[north-star/sync] existing-inputs lookup failed:', existingInputsError)
    return NextResponse.json({ ok: false, error: 'Failed to check existing inputs' }, { status: 500 })
  }
  const valueSourceByKey = new Map(parsed.data.inputs.map((i) => [i.key, i.valueSource]))
  const changedValueSourceKeys = (existingInputs ?? [])
    .filter((existing) => valueSourceByKey.get(existing.key) !== existing.value_source)
    .map((existing) => existing.key)
  if (changedValueSourceKeys.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: `Cannot change value_source of an existing input: ${changedValueSourceKeys.join(', ')}`,
      },
      { status: 400 },
    )
  }

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
