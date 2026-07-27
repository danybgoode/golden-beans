import { NextRequest, NextResponse } from 'next/server'
import { resolveProjectFromAuthHeader } from '@/lib/auth'
import { getTaskLifecycleFacts } from '@/lib/task-lifecycle-facts'
import { isSignalsEnabled } from '@/lib/flags'

// signals-loop · Sprint 3, Story 3.3b — GET /api/v1/reports/pod/lifecycle
//
// The one read `scripts/pod-report.mjs` needs to turn landing §5's adoption-step claim from an
// ASSERTION into a computed figure (Amendment 4.3). The script analyses a git repository and has no
// database access; these facts live in the engine. So it asks, with the credential it already holds
// for pushing the artifact.
//
// ── Why an endpoint rather than enriching the artifact at push time ────────────────────────────
// The push route could add these counts server-side, and it would need no new surface. But the
// maturity lens is computed in the SCRIPT (scripts/lib/maturity-lens.mjs) and arrives at the push
// route already scored — so enriching at push would mean re-scoring server-side, i.e. a second copy
// of the lens. Two implementations of the same scoring rule is one too many, and the second copy is
// the one that drifts. The script fetches, then scores once.
//
// ── Tenancy ───────────────────────────────────────────────────────────────────────────────────
// The project comes from the hashed API key, resolved server-side by lib/auth.ts. There is no
// project parameter on this route and no way to ask about another tenant — the same property every
// authed read here has. A tenant reads its own adoption evidence; that is the whole surface.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const auth = await resolveProjectFromAuthHeader(req.headers.get('authorization'))
  if (!auth.ok) {
    return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status })
  }

  // Rides the signals gate, like every other read of this seam. While dark, the honest answer is
  // "not measured" — which is NOT the same as zero, and the distinction is the entire point of the
  // criterion this feeds: the lens renders `not_instrumented` for an absent reading and `not_met`
  // for a real zero. Returning zeroes here would quietly convert "we have not switched this on yet"
  // into "no agent is doing any work", which is a claim we would be making about ourselves without
  // having measured it.
  if (!isSignalsEnabled()) {
    return NextResponse.json({ ok: true, instrumented: false, taskLifecycle: null })
  }

  const facts = await getTaskLifecycleFacts(auth.projectId)
  if (!facts) {
    // A failed read is also "not measured", for the same reason, and it is reported as such rather
    // than as an error: a pod report must not fail to generate because one optional criterion could
    // not be scored.
    return NextResponse.json({ ok: true, instrumented: false, taskLifecycle: null })
  }

  return NextResponse.json({ ok: true, instrumented: true, taskLifecycle: facts })
}
