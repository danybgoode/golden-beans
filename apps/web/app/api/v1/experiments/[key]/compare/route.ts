import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { getExperimentComparisonByProjectId } from '@/lib/ab-query'

// Growth Engine v1 · Sprint 4, Story 4.3 — GET /v1/experiments/:key/compare?metricEvent=<event>.
// `metricEvent` is caller-supplied (no experiments registry to look it up from — Sprint 4's design
// decision, see sprint-4.md) — the caller names whichever event should count as a conversion.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  const { key } = await params

  const metricEvent = req.nextUrl.searchParams.get('metricEvent')?.trim()
  if (!metricEvent) {
    return NextResponse.json({ ok: false, error: 'metricEvent query param is required' }, { status: 400 })
  }

  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase.from('projects').select('slug').eq('id', auth.projectId).single()
  if (error || !project) {
    console.error('[experiments/compare] project lookup failed:', error)
    return NextResponse.json({ ok: false, error: 'Project lookup failed' }, { status: 500 })
  }

  const result = await getExperimentComparisonByProjectId(auth.projectId, project.slug, key, metricEvent)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: 'Experiment comparison lookup failed' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    project: result.project,
    experimentKey: result.experimentKey,
    metricEvent: result.metricEvent,
    comparison: result.comparison,
    note: 'Basic lift only — % difference in conversion rate vs a baseline variant. No statistical-significance engine.',
  })
}
