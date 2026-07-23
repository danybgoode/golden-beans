import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { getExperimentComparisonByProjectId } from '@/lib/ab-query'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'
import { validateExperimentKey } from '@/lib/experiment-definition'
import { isExperimentGovernanceEnabled } from '@/lib/flags'

// Growth Engine v1 · Sprint 4, Story 4.3 — GET /v1/experiments/:key/compare?metricEvent=<event>.
// `metricEvent` is caller-supplied (no experiments registry to look it up from — Sprint 4's design
// decision, see sprint-4.md) — the caller names whichever event should count as a conversion.
export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const governed = req.nextUrl.searchParams.has('version')
  if (governed && !isExperimentGovernanceEnabled()) {
    return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 })
  }
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  const { key } = await params
  if (governed && !validateExperimentKey(key)) {
    return NextResponse.json({ ok: false, error: 'Invalid experiment key' }, { status: 400 })
  }

  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase.from('projects').select('slug').eq('id', auth.projectId).single()
  if (error || !project) {
    console.error('[experiments/compare] project lookup failed:', error)
    return NextResponse.json({ ok: false, error: 'Project lookup failed' }, { status: 500 })
  }

  if (governed) {
    const parsed = parseExperimentAnalysisRequest({
      version: req.nextUrl.searchParams.get('version'),
      asOf: req.nextUrl.searchParams.get('asOf'),
      segmentField: req.nextUrl.searchParams.get('segmentField'),
      segmentValue: req.nextUrl.searchParams.get('segmentValue'),
    })
    if (!parsed.ok) {
      return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 })
    }
    const analysis = await getExperimentAnalysisByProjectId(
      auth.projectId,
      project.slug,
      key,
      parsed.request,
    )
    if (!analysis.ok) {
      if (analysis.reason === 'query_failed') {
        return NextResponse.json({ ok: false, error: 'Experiment analysis lookup failed' }, { status: 500 })
      }
      if (analysis.reason === 'resource_limit') {
        return NextResponse.json(
          { ok: false, error: 'Experiment analysis exceeds the query-time safety limit' },
          { status: 422 },
        )
      }
      if (analysis.reason === 'invalid_request' || analysis.reason === 'lifecycle_unavailable') {
        return NextResponse.json(
          { ok: false, error: 'Experiment version is not available for analysis at this snapshot' },
          { status: 409 },
        )
      }
      return NextResponse.json(
        {
          ok: false,
          error: analysis.reason === 'experiment_not_found'
            ? `Unknown governed experiment: ${key}`
            : `Unknown experiment version: ${parsed.request.version}`,
        },
        { status: 404 },
      )
    }
    return NextResponse.json(analysis)
  }

  const metricEvent = req.nextUrl.searchParams.get('metricEvent')?.trim()
  if (!metricEvent) {
    return NextResponse.json({ ok: false, error: 'metricEvent query param is required' }, { status: 400 })
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
