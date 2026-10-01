import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { listNorthStar } from '@/lib/north-star-sync'

// GET /v1/north-star — Story 3.1's "queryable" acceptance: lists every North Star
// metric defined for the authed project, each with its leading inputs nested. The read lives in
// `lib/north-star-sync.ts` (think-skills D6), shared with the CLI route.
export async function GET(req: NextRequest) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }

  const metrics = await listNorthStar(auth.projectId)
  if (metrics === null) {
    return NextResponse.json({ ok: false, error: 'North Star lookup failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, metrics })
}
