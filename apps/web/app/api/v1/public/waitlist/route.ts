import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { waitlistSchema } from '@/lib/waitlist-schema'
import { checkRateLimit, hashIp } from '@/lib/rate-limit'
import { trackSelfEvent, WAITLIST_JOINED_EVENT, VISITOR_COOKIE } from '@/lib/self-track'

// POST /v1/public/waitlist — Story 1.3 (commercial-shell/sprint-1.md). Public write, guarded:
// honeypot, rate-limited, dedupe-safe. No third-party form service — email lands directly in
// gb's own Supabase.
export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 })
  }

  const parsed = waitlistSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'Malformed waitlist payload', issues: parsed.error.flatten() },
      { status: 400 },
    )
  }

  // Honeypot: a real visitor never fills this hidden field. Silent success, no insert — the
  // caller (a bot) sees the same 200 a real signup gets, so it learns nothing from the response.
  if (parsed.data.company) {
    return NextResponse.json({ ok: true })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rateLimit = await checkRateLimit(`waitlist:${hashIp(ip)}`, { windowMs: 10 * 60 * 1000, max: 5 })
  if (!rateLimit.ok) {
    return NextResponse.json({ ok: false, error: rateLimit.error }, { status: rateLimit.status })
  }

  const supabase = getSupabaseServiceClient()
  // ON CONFLICT (email) DO NOTHING — a repeat signup is a safe no-op, never a duplicate row or an
  // error; the client can't distinguish "new" from "already on the list," which is the intended
  // confirmation-state UX either way.
  const { error } = await supabase
    .from('waitlist')
    .upsert({ email: parsed.data.email }, { onConflict: 'email', ignoreDuplicates: true })
  if (error) {
    console.error('[public/waitlist] insert failed:', error)
    return NextResponse.json({ ok: false, error: 'Failed to join the waitlist' }, { status: 500 })
  }

  // Story 3.1 (commercial-shell/sprint-3.md) — the conversion half of the dogfood funnel. This is
  // the ONLY successful, non-honeypot join path (the honeypot returned above without inserting, so
  // a bot's silent-success never counts as a real `waitlist_joined`). We reuse the visitor id set
  // by the visited beacon (VISITOR_COOKIE), so this join is the SAME user who fired
  // `landing_visited` advancing through the funnel; if the cookie is somehow absent (JS beacon
  // never ran), we still record the conversion under a fresh id rather than lose it. Fire-and-
  // forget through the real SDK — never blocks or fails the join (trackSelfEvent is total).
  const visitorId = req.cookies.get(VISITOR_COOKIE)?.value?.trim() || randomUUID()
  await trackSelfEvent(WAITLIST_JOINED_EVENT, visitorId)

  return NextResponse.json({ ok: true })
}
