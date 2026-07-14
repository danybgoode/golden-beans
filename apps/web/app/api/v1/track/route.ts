import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { trackEventSchema } from '@/lib/track-schema'

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

  const parsed = trackEventSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed event', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('events')
    .insert({
      project_id: auth.projectId, // resolved from the API key, never from the body — Decision 8
      user_id: parsed.data.userId,
      event: parsed.data.event,
      feature_id: parsed.data.featureId ?? null,
      tags: parsed.data.tags,
      metadata: parsed.data.metadata,
    })
    .select('id')
    .single()

  if (error || !data) {
    return NextResponse.json({ ok: false, error: 'Failed to persist event' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: data.id }, { status: 201 })
}
