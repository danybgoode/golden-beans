// Story 1.4 (commercial-shell/sprint-1.md) — the section↔epic registry. Each landing section
// declares the epic that lights it up + its current status; the landing components read from
// here instead of hardcoding badge text, so "flipping one entry flips the badge" (change
// `status: 'next' -> 'live'` here, then swap the section's <Teaser/> for its real component —
// no other JSX changes). This is the mechanical surface the WAYS-OF-WORKING backfill DoD line
// checks against.
//
// ── Rewritten, not extended, by landing-redesign-v2 (2026-08-12) ──────────────────────────────
// The previous map described the eight sections of `references/landing-end-state.md`, written
// against the engine-first pitch ("The growth engine your agent operates"). The v2 page is a
// different narrative with a different section order, so leaving the old ids alongside the new
// ones would leave a registry that no longer describes the page — which is precisely the drift
// this file exists to prevent (epic D6). `landing-end-state.md`'s map was superseded in the same
// commit.
//
// Section ids/order mirror the ten numbered stamps in
// `references/golden-beans-landing-v2.html`, plus the unnumbered hero/try/how opening.

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
  {
    id: 'hero',
    title: 'Hero — your roadmap has enough opinions',
    epic: 'landing-redesign-v2',
    status: 'live',
  },
  {
    id: 'try',
    title: 'Try it before you connect anything',
    epic: 'landing-redesign-v2',
    status: 'live',
    note: 'The handoff prompt + /northstar-self-serve.md — usable with no account and no connector.',
  },
  { id: 'how', title: 'How it grows — plant once', epic: 'landing-redesign-v2', status: 'live' },
  { id: 'opinions', title: '① Everyone has a good reason', epic: 'landing-redesign-v2', status: 'live' },
  { id: 'argument', title: '② Bring an agent to the argument', epic: 'landing-redesign-v2', status: 'live' },
  {
    id: 'product',
    title: '③ From "I think" to "here\'s why"',
    epic: 'landing-redesign-v2',
    status: 'live',
    note: 'Illustrative release list — the real one is behind auth at /app.',
  },
  {
    id: 'principle',
    title: '④ Agnostic about ideas, conservative about actions',
    epic: 'signals-loop',
    status: 'live',
    note: 'The staged propose → confirm → apply shape shipped with signals-loop.',
  },
  {
    id: 'leverage',
    title: '⑤ Less coordination, more product management',
    epic: 'landing-redesign-v2',
    status: 'live',
  },
  {
    id: 'proof',
    title: '⑥ Proof — the Pod Report and the live engine',
    epic: 'pod-report',
    status: 'live',
    note: 'Carries BOTH the computed Pod Report and the live demo-tenant engine read (epic D2).',
  },
  {
    id: 'build-it-yourself',
    title: '⑦ Yes, you can build this yourself',
    epic: 'landing-redesign-v2',
    status: 'live',
  },
  {
    id: 'connect',
    title: '⑧ Bring your agent',
    epic: 'commercial-shell',
    status: 'live',
    note: 'The tokenized MCP connector URL — CONNECTOR_ENABLED is ON in production.',
  },
  {
    id: 'sdk',
    title: '⑨ For the engineers who will inevitably ask',
    epic: 'growth-engine-v1',
    status: 'live',
  },
  {
    id: 'pricing',
    title: '⑩ Pricing',
    epic: 'multi-tenant-activation',
    status: 'live',
    note: 'Self-serve free tier follows SIGNUP_ENABLED. No payment rail yet — the paid tier says so.',
  },
  { id: 'footer', title: 'Footer', epic: 'commercial-shell', status: 'live' },
]

export function getSection(id: string): LandingSection {
  const section = LANDING_SECTIONS.find((s) => s.id === id)
  if (!section) throw new Error(`Unknown landing section id: ${id}`)
  return section
}
