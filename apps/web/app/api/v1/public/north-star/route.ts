import { NextRequest, NextResponse } from 'next/server'
import { assertPublicAllowedSlug } from '@/lib/public-demo'
import { getFeatureImpact } from '@/lib/north-star-query'

// Story 1.2 (commercial-shell/sprint-1.md) — GET /v1/public/north-star?project=&feature=. The
// public, unauthenticated twin of /v1/features/:key/impact, gated to the demo project only.
// Reuses getFeatureImpact unmodified — no new query logic.
export async function GET(req: NextRequest) {
  const project = req.nextUrl.searchParams.get('project')?.trim()
  const feature = req.nextUrl.searchParams.get('feature')?.trim()
  if (!project || !feature) {
    return NextResponse.json({ ok: false, error: 'project and feature query params are required' }, { status: 400 })
  }

  const allowed = assertPublicAllowedSlug(project)
  if (!allowed.ok) {
    return NextResponse.json({ ok: false, error: allowed.error }, { status: allowed.status })
  }

  const result = await getFeatureImpact(project, feature)
  if (!result.ok) {
    if (result.reason === 'query_failed') {
      return NextResponse.json({ ok: false, error: 'North Star lookup failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: `Unknown feature: ${feature}` }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    project: result.project,
    feature: result.feature,
    inputs: result.inputs,
  })
}
