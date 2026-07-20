'use client'

import { useEffect } from 'react'

// Story 3.1 (commercial-shell/sprint-3.md) — the entry point of the dogfood funnel. The landing is
// server-rendered and force-dynamic; a Server Component can't set the per-visitor identity cookie,
// so this invisible client beacon POSTs once on mount to /api/v1/public/self-visit (a Route
// Handler, which CAN set cookies), mirroring how WaitlistForm posts the conversion side. The route
// mints/returns the visitor cookie and fires `landing_visited`; the later waitlist join reads the
// same cookie so both events share one visitor identity.
//
// Fire-and-forget: a failed or unconfigured beacon must never affect the page. Renders nothing.
export function SelfTrackBeacon() {
  useEffect(() => {
    // keepalive so an immediate navigation away doesn't cancel the entry beacon.
    fetch('/api/v1/public/self-visit', { method: 'POST', keepalive: true }).catch(() => {})
  }, [])

  return null
}
