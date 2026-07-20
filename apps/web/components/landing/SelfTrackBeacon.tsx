'use client'

import { useEffect } from 'react'

const VISITOR_COOKIE = 'gb_vid'

// A cross-review catch (Sprint 3 PR, round 2): mint/read the visitor id HERE, synchronously,
// before firing any network request — not by waiting on the self-visit route's Set-Cookie
// response. document.cookie is an in-memory, same-tick write; a network round-trip (even one that
// returns fast, per the after()/rate-limit fixes above) still has real latency, and WaitlistForm's
// submit handler only becomes clickable once this component's sibling has also hydrated in the
// same commit — so a cookie set here beats any user-triggered submit, whereas one set only in the
// route's response cannot. Plain (non-httpOnly) is fine: this is an anonymous correlation id, not a
// credential — nothing sensitive to protect from JS reading its own cookie.
function ensureVisitorId(): string {
  const match = document.cookie.match(new RegExp(`(?:^|; )${VISITOR_COOKIE}=([^;]+)`))
  if (match) return decodeURIComponent(match[1])

  const id = crypto.randomUUID()
  const maxAge = 60 * 60 * 24 * 365 // 1y, matches self-visit/route.ts's fallback cookie lifetime
  document.cookie = `${VISITOR_COOKIE}=${id}; path=/; max-age=${maxAge}; samesite=lax`
  return id
}

// Story 3.1 (commercial-shell/sprint-3.md) — the entry point of the dogfood funnel. Mints the
// per-visitor identity cookie synchronously (see ensureVisitorId above), THEN fires the entry event
// via a beacon POST to /api/v1/public/self-visit — a Route Handler, since a Server Component can't
// set cookies, still sets/refreshes gb_vid server-side too as a fallback for any non-JS caller. The
// later waitlist join reads the same cookie so both events share one visitor identity.
//
// Fire-and-forget: a failed or unconfigured beacon must never affect the page. Renders nothing.
export function SelfTrackBeacon() {
  useEffect(() => {
    ensureVisitorId()
    // keepalive so an immediate navigation away doesn't cancel the entry beacon.
    fetch('/api/v1/public/self-visit', { method: 'POST', keepalive: true }).catch(() => {})
  }, [])

  return null
}
