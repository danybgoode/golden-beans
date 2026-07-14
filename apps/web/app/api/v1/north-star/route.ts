import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'

// GET /v1/north-star — Story 3.1's "queryable" acceptance: lists every North Star
// metric defined for the authed project, each with its leading inputs nested.
export async function GET(req: NextRequest) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }

  const supabase = getSupabaseServiceClient()

  const { data: metrics, error: metricsError } = await supabase
    .from('north_star_metrics')
    .select('id, key, name, description, created_at')
    .eq('project_id', auth.projectId)
  if (metricsError) {
    console.error('[north-star] metrics lookup failed:', metricsError)
    return NextResponse.json({ ok: false, error: 'North Star lookup failed' }, { status: 500 })
  }

  const { data: inputs, error: inputsError } = await supabase
    .from('leading_inputs')
    .select('id, metric_id, key, name, value_source, source_event, created_at')
    .eq('project_id', auth.projectId)
  if (inputsError) {
    console.error('[north-star] inputs lookup failed:', inputsError)
    return NextResponse.json({ ok: false, error: 'North Star lookup failed' }, { status: 500 })
  }

  const result = (metrics ?? []).map((metric) => ({
    key: metric.key,
    name: metric.name,
    description: metric.description,
    createdAt: metric.created_at,
    inputs: (inputs ?? [])
      .filter((input) => input.metric_id === metric.id)
      .map((input) => ({
        key: input.key,
        name: input.name,
        valueSource: input.value_source,
        sourceEvent: input.source_event,
        createdAt: input.created_at,
      })),
  }))

  return NextResponse.json({ ok: true, metrics: result })
}
