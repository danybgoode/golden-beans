import { NextRequest, NextResponse, after } from 'next/server'
import { randomUUID } from 'node:crypto'
import {
  trackSelfEvent,
  LANDING_VISITED_EVENT,
  METHODOLOGY_VISITED_EVENT,
  METHODOLOGY_CHAPTER_OPENED_EVENT,
  VISITOR_COOKIE,
  type SelfTrackEvent,
} from '@/lib/self-track'
import { METHODOLOGY_CHAPTER_IDS } from '@/lib/methodology-chapters'
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
// methodology-experience · Sprint 4, Story 4.1 — this route serves the methodology too.
//
// ── Why the surface is a closed allow-list and NOT an event name ──────────────────────────────
// The story says "no second beacon, no new endpoint", which means this route has to fire more than
// one event. The obvious shape — take the event name from the body — would let any anonymous caller
// POST any event into the self tenant's funnels: `waitlist_joined` without a waitlist join,
// `first_event_ingested` without an ingest. This route is unauthenticated by design, so the body is
// attacker-controlled input, and an event name is a WRITE into the numbers the product owner reads
// as status.
//
// So the body names a SURFACE from a fixed set, and the event is chosen here. The worst a caller
// can do is inflate a page-view count they could already inflate by loading the page — which is
// what the existing IP rate limit is for.
//
// The chapter rides as a tag and is validated against the module's own ids, so an arbitrary string
// cannot become a dimension in the query layer.
const SURFACE_EVENT: Record<string, SelfTrackEvent> = {
  landing: LANDING_VISITED_EVENT,
  methodology: METHODOLOGY_VISITED_EVENT,
  'methodology-chapter': METHODOLOGY_CHAPTER_OPENED_EVENT,
}

/** Parse the optional body. Anything unrecognised falls back to the landing — never an error, and
 *  never a caller-chosen event. A malformed body must not break a beacon on a page that renders
 *  fine, and must not 500 a route whose entire contract is "always 200". */
async function resolveBeacon(
  req: NextRequest
): Promise<{ event: SelfTrackEvent; tags?: Record<string, string> }> {
  let body: unknown = null
  try {
    body = await req.json()
  } catch {
    // No body, or not JSON: the original landing beacon posts nothing at all.
    return { event: LANDING_VISITED_EVENT }
  }

  const surface =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).surface : undefined
  const event = typeof surface === 'string' ? SURFACE_EVENT[surface] : undefined
  if (!event) return { event: LANDING_VISITED_EVENT }

  if (event !== METHODOLOGY_CHAPTER_OPENED_EVENT) return { event }

  const chapter =
    typeof body === 'object' && body !== null ? (body as Record<string, unknown>).chapter : undefined
  // Validated against the module, not merely type-checked: an unknown id would become a permanent
  // tag value in the query layer that corresponds to no page.
  if (typeof chapter !== 'string' || !METHODOLOGY_CHAPTER_IDS.includes(chapter)) {
    return { event: METHODOLOGY_VISITED_EVENT }
  }
  return { event, tags: { chapter } }
}

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
  // Read the body BEFORE `after()`: the request stream is not guaranteed readable once the
  // response has been returned, and a beacon that silently fell back to `landing_visited` for every
  // methodology page would be indistinguishable from one that worked.
  const { event, tags } = await resolveBeacon(req)
  after(() => trackSelfEvent(event, visitorId, tags))
  return res
}
