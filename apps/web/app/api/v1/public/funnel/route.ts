import { NextRequest, NextResponse } from 'next/server'
import { assertPublicAllowedSlug } from '@/lib/public-demo'
import { getFeatureFunnel } from '@/lib/tars-query'

// Story 1.2 (commercial-shell/sprint-1.md) — GET /v1/public/funnel?project=&feature=. The public,
// unauthenticated twin of /v1/features/:key/funnel, gated to the demo project only. Reuses
// getFeatureFunnel unmodified (the same slug-based getter the unauthed /app/funnel page already
// calls) — no new query logic.
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

  const result = await getFeatureFunnel(project, feature)
  if (!result.ok) {
    if (result.reason === 'query_failed') {
      return NextResponse.json({ ok: false, error: 'Funnel lookup failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: `Unknown feature: ${feature}` }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    project: result.project,
    feature: result.feature,
    tars: result.tars,
    note: 'Targeted/Adopted/Retained are registry-declared, not gateway-observed.',
  })
}
