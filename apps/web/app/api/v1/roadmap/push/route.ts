import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { parseRoadmapPush, ROADMAP_SCHEMA_VERSION } from '@/lib/roadmap-artifact-schema'

// pod-report · Sprint 1, Story 1.1 — POST /api/v1/roadmap/push
//
// The client-pushes rail: a tenant POSTs their own roadmap extract with their own API key and the
// engine stores it as an immutable, versioned artifact. Same shape as the S2 registry seed — the
// engine never reads anyone's git, holds no repo credential, and needs no access to a customer's
// source. They push; we render.
//
// The tenant is resolved from the hashed API key (lib/auth.ts) and NEVER from the body. There is no
// project field in the payload schema at all, so "push into someone else's project" is not a
// vulnerability to guard against — it is an unrepresentable request.

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

  const parsed = parseRoadmapPush(body)
  if (!parsed.ok) {
    // Version mismatch and shape failure are distinguishable to the caller — see parseRoadmapPush.
    return NextResponse.json(
      { ok: false, error: parsed.error, ...(parsed.issues ? { issues: parsed.issues } : {}) },
      { status: 400 }
    )
  }

  const { generatedAt, source, items } = parsed.value
  const supabase = getSupabaseServiceClient()

  // Version allocation happens inside the RPC under an advisory lock — never here. Reading
  // max(version) in the route and inserting version+1 is the lost-update race two concurrent pushes
  // would hit, and the app has no lock to prevent it.
  const { data, error } = await supabase
    .rpc('push_report_artifact', {
      p_project_id: auth.projectId,
      p_kind: 'roadmap',
      p_schema_version: ROADMAP_SCHEMA_VERSION,
      p_payload: { items },
      p_generated_at: generatedAt.toISOString(),
      p_source_commit: source?.commit ?? null,
      p_source_ref: source?.ref ?? null,
    })
    .single<{ artifact_id: string; artifact_version: number }>()

  if (error) {
    console.error('[roadmap/push] insert failed:', error)
    return NextResponse.json({ ok: false, error: 'Failed to store roadmap artifact' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    artifactId: data.artifact_id,
    version: data.artifact_version,
    schemaVersion: ROADMAP_SCHEMA_VERSION,
    items: items.length,
  })
}
