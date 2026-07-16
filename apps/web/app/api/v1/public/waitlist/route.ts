import { NextRequest, NextResponse } from 'next/server'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { waitlistSchema } from '@/lib/waitlist-schema'
import { checkRateLimit, hashIp } from '@/lib/rate-limit'

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

  return NextResponse.json({ ok: true })
}
