'use client'

import { useEffect, useRef, type ReactNode } from 'react'

/**
 * app-shell-and-agent-rail · Sprint 2, Story 2.2 — the rail's open/closed behaviour.
 *
 * The rail is a native `<details>`, server-rendered CLOSED, so it works and is dismissable before
 * any JavaScript arrives. This island does exactly one thing: on a wide viewport, open it once.
 *
 * ── Why the initial state cannot be CSS ───────────────────────────────────────────────────────
 * A `<details>` renders open or closed by attribute, and the closed content lives in an unassigned
 * shadow slot that CSS cannot reliably reveal across engines. So "expanded sidebar on desktop,
 * pull-up sheet on a phone" is a one-time attribute decision, not a media query — and rendering it
 * open on the server would put the sheet over the page on the viewport where it matters most.
 *
 * ── Why it only ever runs ONCE ────────────────────────────────────────────────────────────────
 * No listener on the media query, and no dependency on the open state. A component that kept
 * re-asserting "wide means open" would re-open the rail under a user who had just closed it, on
 * every resize — the panel would fight the person using it. One nudge at mount, then it is theirs.
 *
 * Mutating `.open` through a ref rather than rendering `open={...}` from state is deliberate: the
 * server and the first client render agree (closed), so there is no hydration mismatch, and the
 * user's subsequent toggles stay with the DOM element where the browser already manages them.
 */
export function RailDisclosure({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null)

  useEffect(() => {
    // Matches the breakpoint the rail's sidebar layout starts at in globals.css. The two are
    // written down twice — here and there — because a CSS custom property is not readable from
    // matchMedia; if you change one, change the other.
    if (window.matchMedia('(min-width: 1100px)').matches && ref.current) {
      ref.current.open = true
    }
  }, [])

  return (
    <details className="agent-rail__panel" ref={ref}>
      <summary>{summary}</summary>
      <div className="agent-rail__body">{children}</div>
    </details>
  )
}
