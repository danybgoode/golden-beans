// Story 1.4 (commercial-shell/sprint-1.md) — the section↔epic registry. Each landing section
// declares the epic that lights it up + its current status; the landing components read from
// here instead of hardcoding badge text, so "flipping one entry flips the badge" (change
// `status: 'next' -> 'live'` here, then swap the section's teaser for its real component — no
// other JSX changes).
//
// ── Rewritten, not extended, by landing-maker-ops (2026-08-19) ────────────────────────────────
// This is the second rewrite of this file and for the same reason as the first: the page's
// narrative changed, so a registry that kept the old ids alongside the new ones would no longer
// describe the page — precisely the drift it exists to prevent (epic D6). `landing-redesign-v2`
// made the same call in 2026-08-12 and wrote down why; this is that note being honoured rather
// than rediscovered.
//
// Nine section ids retired with the maker-ops repositioning (try, how, infomercial, opinions,
// argument, resilience, principle, leverage, build-it-yourself). Their arguments are absorbed by
// the new spine — see the epic README's D1 — and their components were deleted in the same commit,
// which is what keeps this file a description rather than a wish.
//
// Two more retired in the 2026-08-19 readability pass — `connect` and `sdk` — under the same rule:
// components deleted in the same commit as the entries. Both answered "how do I wire this up", a
// question that belongs after the decision rather than between the proof and the price. /install
// still carries the connector flow and the footer still links it.
//
// ── One section now links OUT of this page (methodology-experience, Story 2.4) ────────────────
// Every id below is still a section of `/`, and the round-trip assertion below still holds. What
// changed is that §methodology's CTA is no longer an in-page action: it goes to `/methodology`, a
// real route with its own six chapter URLs. This registry does not model routes and should not
// start — `lib/methodology-chapters.ts` is the registry for those, and it keeps the same throwing
// lookup this file does, for the same reason.
//
// ── The ids are also DOM ids, and that is load-bearing ────────────────────────────────────────
// Every id below is rendered as the `id` attribute of exactly one section element on `/`. That is
// what `e2e/landing.browser.spec.ts` asserts, and it makes two different rots fail loudly instead
// of silently: a registry entry whose section was deleted, and a nav/CTA anchor pointing at a
// section that no longer exists. Add an entry here and the page must grow the section; delete a
// section and this file must lose the entry.

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
    title: 'Hero — make more, grow what works',
    epic: 'landing-maker-ops',
    status: 'live',
  },
  {
    id: 'loop',
    title: 'The maker loop — consider, operate, exit',
    epic: 'landing-maker-ops',
    status: 'live',
  },
  {
    id: 'product',
    title: 'One operating context',
    epic: 'landing-maker-ops',
    status: 'live',
    note: 'Illustrative figures over the real /app navigation vocabulary — the live read is §proof.',
  },
  {
    id: 'ops',
    title: 'Four operating surfaces — product, delivery, security, spend',
    epic: 'landing-maker-ops',
    status: 'live',
    note: 'Content lives in lib/maker-ops.ts; each surface resolves its own gate per request, so no status is written down here.',
  },
  {
    id: 'authority',
    title: 'Agents move, authority stays put',
    epic: 'signals-loop',
    status: 'live',
    note: 'The staged propose → confirm → apply shape shipped with signals-loop.',
  },
  {
    id: 'finops',
    title: 'AI unit economics',
    epic: 'landing-maker-ops',
    status: 'next',
    note: 'Not built. The only section on this page describing something that does not exist, and it says so on the page (epic D4).',
  },
  {
    id: 'methodology',
    title: 'The way of working behind the product',
    epic: 'methodology-experience',
    status: 'live',
    note: 'The only section that links OUT of this page: its CTA goes to /methodology, and its chapter list is derived from lib/methodology-chapters.ts rather than written here.',
  },
  {
    id: 'proof',
    title: 'Proof — the Pod Report and the live engine',
    epic: 'pod-report',
    status: 'live',
    note: 'Carries BOTH the computed Pod Report and the live demo-tenant engine read.',
  },
  {
    id: 'pricing',
    title: 'Pricing',
    epic: 'multi-tenant-activation',
    status: 'live',
    note: 'Self-serve free tier follows SIGNUP_ENABLED. No payment rail yet — the paid tier says so.',
  },
  {
    id: 'start',
    title: 'Run your first Bet',
    epic: 'landing-maker-ops',
    status: 'live',
  },
  { id: 'footer', title: 'Footer', epic: 'commercial-shell', status: 'live' },
]

export function getSection(id: string): LandingSection {
  const section = LANDING_SECTIONS.find((s) => s.id === id)
  if (!section) throw new Error(`Unknown landing section id: ${id}`)
  return section
}
