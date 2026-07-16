import { NextRequest, NextResponse } from 'next/server'
import { assertPublicAllowedSlug } from '@/lib/public-demo'
import { getExperimentComparison } from '@/lib/ab-query'

// Story 1.2 (commercial-shell/sprint-1.md) — GET /v1/public/experiments?project=&experiment=&
// metricEvent=. The public, unauthenticated twin of /v1/experiments/:key/compare, gated to the
// demo project only. Reuses getExperimentComparison unmodified — no new query logic.
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get('project')?.trim()
  const experiment = req.nextUrl.searchParams.get('experiment')?.trim()
  const metricEvent = req.nextUrl.searchParams.get('metricEvent')?.trim()
  if (!project || !experiment || !metricEvent) {
    return NextResponse.json(
      { ok: false, error: 'project, experiment, and metricEvent query params are required' },
      { status: 400 },
    )
  }

  const allowed = assertPublicAllowedSlug(project)
  if (!allowed.ok) {
    return NextResponse.json({ ok: false, error: allowed.error }, { status: allowed.status })
  }

  const result = await getExperimentComparison(project, experiment, metricEvent)
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
