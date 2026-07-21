// Story 1.4 (commercial-shell/sprint-1.md) — the section↔epic registry. Each landing section
// declares the epic that lights it up + its current status; the landing components read from
// here instead of hardcoding badge text, so "flipping one entry flips the badge" (change
// `status: 'next' -> 'live'` here, then swap the section's <Teaser/> for its real component —
// no other JSX changes). This is the mechanical surface the WAYS-OF-WORKING backfill DoD line
// checks against (Roadmap/02-commercial/commercial-shell/README.md documents this pointer).
//
// Section ids/order mirror references/landing-end-state.md's 8-section map.

export type SectionStatus = 'live' | 'next'

export interface LandingSection {
  id: string
  title: string
  /** The epic slug that lights this section up (Roadmap/<macro>/<epic-slug>/). */
  epic: string
  status: SectionStatus
  note?: string
}

export const LANDING_SECTIONS: LandingSection[] = [
  { id: 'hero', title: 'Hero', epic: 'commercial-shell', status: 'live' },
  { id: 'live-proof', title: 'Live proof', epic: 'commercial-shell', status: 'live' },
  {
    id: 'operate-routes',
    title: 'Three operate routes',
    epic: 'commercial-shell',
    status: 'live',
    note: '① connector URL and ③ npx wizard only — ② the pod plugin lands with multi-tenant-activation',
  },
  { id: 'inverted-loop', title: 'The inverted loop', epic: 'signals-loop', status: 'next' },
  { id: 'pods-proof', title: 'Pods & proof (ROI)', epic: 'pod-report', status: 'next' },
  { id: 'primitives', title: 'Primitives grid', epic: 'commercial-shell', status: 'live' },
  // multi-tenant-activation · Sprint 3, Story 3.1 — flipped 'next' -> 'live': the section's real
  // component (WaitlistSection.tsx) now renders honest self-serve tiers whenever SIGNUP_ENABLED
  // is on, not just the waitlist teaser. This registry entry is the static "the capability
  // shipped" declaration the backfill DoD checks — the per-request choice of which of the two
  // (tiers vs waitlist) actually renders still lives in the component, keyed off the live flag.
  { id: 'pricing', title: 'Pricing & tenancy', epic: 'multi-tenant-activation', status: 'live' },
  { id: 'footer', title: 'Footer', epic: 'commercial-shell', status: 'live' },
]

export function getSection(id: string): LandingSection {
  const section = LANDING_SECTIONS.find((s) => s.id === id)
  if (!section) throw new Error(`Unknown landing section id: ${id}`)
  return section
}
