import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { getFeatureImpactByProjectId } from '@/lib/north-star-query'

export async function GET(req: NextRequest, { params }: { params: Promise<{ key: string }> }) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }
  const { key } = await params

  const supabase = getSupabaseServiceClient()
  const { data: project, error } = await supabase.from('projects').select('slug').eq('id', auth.projectId).single()
  if (error || !project) {
    console.error('[features/impact] project lookup failed:', error)
    return NextResponse.json({ ok: false, error: 'Project lookup failed' }, { status: 500 })
  }

  const result = await getFeatureImpactByProjectId(auth.projectId, project.slug, key)
  if (!result.ok) {
    if (result.reason === 'query_failed') {
      return NextResponse.json({ ok: false, error: 'Impact lookup failed' }, { status: 500 })
    }
    return NextResponse.json({ ok: false, error: `No inputs linked to feature: ${key}` }, { status: 404 })
  }

  return NextResponse.json({ ok: true, project: result.project, feature: result.feature, inputs: result.inputs })
}
