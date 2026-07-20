import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import { trackSelfEvent, LANDING_VISITED_EVENT, VISITOR_COOKIE } from '@/lib/self-track'
import { checkRateLimit, hashIp } from '@/lib/rate-limit'

// POST /v1/public/self-visit — Story 3.1 (commercial-shell/sprint-3.md). The visited-side half of
// the dogfood funnel. The landing page is a Server Component and Server Components can't set
// cookies, so the entry event is fired from here (a Route Handler CAN set cookies): a tiny
// client-side beacon (components/landing/SelfTrackBeacon.tsx) POSTs here on mount, exactly as
// WaitlistForm posts the conversion side.
//
// This route mints the per-visitor identity (VISITOR_COOKIE) if absent and returns it via
// Set-Cookie, so the same visitor's later waitlist join (which reads the same cookie) counts as
// the same user advancing through the funnel. It is NOT gated by assertPublicAllowedSlug — it
// touches no project by slug at all; the self tenant is chosen purely by SELF_PROJECT_API_KEY
// inside trackSelfEvent (AGENTS.md rule #2 is about slug-trusting READ paths; this is a write to
// the engine's own ingest under its own key). It IS, like every other unauthenticated public write
// in this app, rate-limited by IP (a cross-review catch) — nothing stops an anonymous caller from
// POSTing here directly otherwise, which would inflate `landing_visited` and skew the Grower
// signal's conversion rate for no real visitor benefit; same primitive and window as the waitlist
// route (lib/rate-limit.ts), just a looser cap since this fires once per real page load, not once
// per human decision.
//
// Always 200s, even with SELF_PROJECT_API_KEY unset (CI): trackSelfEvent no-ops safely and the
// beacon must never surface an error to a visitor just loading the page.
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  const rateLimit = await checkRateLimit(`self-visit:${hashIp(ip)}`, { windowMs: 60 * 1000, max: 20 })
  if (!rateLimit.ok) {
    return NextResponse.json({ ok: false, error: rateLimit.error }, { status: rateLimit.status })
  }

  const existing = req.cookies.get(VISITOR_COOKIE)?.value?.trim()
  const visitorId = existing || randomUUID()

  const res = NextResponse.json({ ok: true })
  if (!existing) {
    res.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24 * 365, // 1y — a stable identity across return visits
    })
  }

  // A cross-review catch (Sprint 3 PR): this MUST run via `after()`, not an inline `await` — an
  // inline await would delay THIS response, including the Set-Cookie above, behind a real network
  // round-trip (self-track's own HTTP call to this app's public URL). A fast follow-up request
  // (e.g. an immediate waitlist join) could then arrive before the browser has even received the
  // visitor cookie, minting a second, disconnected identity and breaking the funnel `after()` fixes.
  after(() => trackSelfEvent(LANDING_VISITED_EVENT, visitorId))
  return res
}
