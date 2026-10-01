import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { syncNorthStar } from '@/lib/north-star-sync'

// The sync logic lives in `lib/north-star-sync.ts` (think-skills D6), shared with the CLI route. This route keeps its
// own door, a project ingest key, and the exact responses it always gave.
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

  const result = await syncNorthStar(auth.projectId, body)
  if (!result.ok) {
    return NextResponse.json(
      'issues' in result
        ? { ok: false, error: result.error, issues: result.issues }
        : { ok: false, error: result.error },
      { status: result.status }
    )
  }
  return NextResponse.json({ ok: true, metric: result.metric, inputsSynced: result.inputsSynced })
}
