import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { getFeatureFunnelByProjectId } from '@/lib/tars-query'

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  const { key } = await params

  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase.from('projects').select('slug').eq('id', auth.projectId).single()
  if (error || !project) {
    console.error('[features/funnel] project lookup failed:', error)
    return NextResponse.json({ ok: false, error: 'Project lookup failed' }, { status: 500 })
  }

  const result = await getFeatureFunnelByProjectId(auth.projectId, project.slug, key)
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: `Unknown feature: ${key}` }, { status: 404 })
  }

  return NextResponse.json({
    ok: true,
    feature: result.feature,
    tars: result.tars,
    // v1's honest boundary (Roadmap/01-growth-engine/growth-engine-v1/sprint-2.md, Story 2.2) —
    // flags are served by Miyagi, not this engine.
    note: 'Targeted/Adopted/Retained are registry-declared, not gateway-observed.',
  })
}
