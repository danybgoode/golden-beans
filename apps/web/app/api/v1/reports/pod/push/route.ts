import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { parsePodReportPush, POD_REPORT_SCHEMA_VERSION } from '@/lib/pod-report-schema'

// pod-report · Sprint 2.5a — POST /api/v1/reports/pod/push
//
// The pod_report twin of /api/v1/roadmap/push (Story 1.1): same rail (`push_report_artifact`, one
// row per push, versioned and immutable), different `kind` and a different payload shape. The Pod
// Report is computed from medusa-bonsai but the tenant that OWNS the artifact is whoever's API key
// pushed it, resolved server-side — the two can legitimately differ (see scripts/pod-report.mjs's
// POD_REPORT_API_KEY override), and that is exactly why the tenant is never read from the body.

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

  const parsed = parsePodReportPush(body)
  if (!parsed.ok) {
    // Version mismatch and shape failure are distinguishable to the caller — see parsePodReportPush.
    return NextResponse.json(
      { ok: false, error: parsed.error, ...(parsed.issues ? { issues: parsed.issues } : {}) },
      { status: 400 }
    )
  }

  const { generatedAt, source, payload } = parsed.value
  const supabase = getSupabaseServiceClient()

  // Version allocation happens inside the RPC under an advisory lock — never here. Reading
  // max(version) in the route and inserting version+1 is the lost-update race two concurrent pushes
  // would hit, and the app has no lock to prevent it.
  const { data, error } = await supabase
    .rpc('push_report_artifact', {
      p_project_id: auth.projectId,
      p_kind: 'pod_report',
      p_schema_version: POD_REPORT_SCHEMA_VERSION,
      p_payload: payload,
      p_generated_at: generatedAt.toISOString(),
      p_source_commit: source?.commit ?? null,
      p_source_ref: source?.ref ?? null,
    })
    .single<{ artifact_id: string; artifact_version: number }>()

  if (error) {
    console.error('[reports/pod/push] insert failed:', error)
    return NextResponse.json({ ok: false, error: 'Failed to store pod_report artifact' }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    artifactId: data.artifact_id,
    version: data.artifact_version,
    schemaVersion: POD_REPORT_SCHEMA_VERSION,
  })
}
