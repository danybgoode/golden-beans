// pod-report · Sprint 1, Story 1.3 — the horizon view's destination↔epic registry.
//
// Generalizes lib/landing-sections.ts's id/title/epic/status shape (the section↔epic registry that
// makes "flipping one entry flips the badge" true for the public landing). This is the same
// mechanism applied one level up: instead of ONE epic lighting ONE landing section, a horizon
// DESTINATION is an end-state milestone that can be lit by SEVERAL epics — the portfolio-wide "here
// is where we are going" the sprint doc asks for, not a page section — so its state is a three-way
// LIT / PARTIAL / COMING rather than landing-sections' binary live/next. Destinations are drawn from
// references/landing-end-state.md's section map, generalized to the whole roadmap rather than only
// the public page.
//
// Deliberately ZERO framework/server-only imports (no `server-only`, no `next/*`, no Supabase) — the
// same rule roadmap-artifact-schema.ts documents: a pure module a plain `node --test` run can import
// directly must not share a file with a runtime-only import, or the test throws an opaque, unrelated
// error just loading the file. The DB-touching half (resolving a project slug, reading the latest
// artifact) lives next door in app/hub/[projectSlug]/horizon/page.tsx.

export type DestinationStatus = 'lit' | 'partial' | 'coming'

export interface HorizonDestination {
  id: string
  title: string
  description: string
  /** Epic slugs (Roadmap/<macro>/<epic-slug>/) that light this destination, in display order. */
  epics: string[]
}

// The end-state destinations. Adding/renaming a destination or repointing which epics light it is a
// one-line change here — no other module changes, mirroring landing-sections.ts's stated design
// ("flipping one entry flips the badge").
export const HORIZON_DESTINATIONS: HorizonDestination[] = [
  {
    id: 'byo-agent-frontdoor',
    title: 'The BYO-agent front door',
    description:
      'Copy-your-MCP-URL, a real self-serve signup, and a live TARS/North Star/A-B demo — the ' +
      'front door a technical PM lands on.',
    epics: ['commercial-shell', 'multi-tenant-activation'],
  },
  {
    id: 'inverted-loop',
    title: 'The inverted loop',
    description: 'Signals become structured tasks — and your own agent closes them, not ours.',
    epics: ['event-destination-router', 'signals-loop'],
  },
  {
    id: 'pods-proof',
    title: 'Pods & proof (ROI)',
    description:
      'The cost-center-to-revenue-engine sales artifact: velocity, DORA, cost-per-shipped-point — ' +
      'benchmarked, never claimed.',
    epics: ['pod-report'],
  },
  {
    id: 'primitives-grid',
    title: 'The full primitives grid',
    description:
      'Telemetry, feature registry, TARS, North Star, experiments, and entity journeys as one ' +
      'operable set.',
    epics: ['growth-engine-v1', 'experiment-governance-v2', 'entity-journeys-projections'],
  },
  {
    id: 'self-serve-tenancy',
    title: 'Self-serve tenancy & pricing',
    description: 'Self-serve tiers and hand-provisioned pod engagements, live behind real signup.',
    epics: ['multi-tenant-activation'],
  },
  {
    id: 'agent-legible-surface',
    title: 'An agent-legible surface',
    description: 'Docs, status, and a manifest an agent can read as easily as a human can.',
    epics: ['commercial-shell'],
  },
]

/** The shape the caller supplies per epic — deliberately narrow (no status STRING accepted here). */
export interface HorizonEpicInput {
  slug: string
  name: string
  /**
   * MUST come from the caller's own `summarizeRoadmap(...).epics[].shipped` derivation
   * (roadmap-artifact-schema.ts). This module never re-derives "is it shipped" from a status string
   * itself — that derivation lives in exactly one place on purpose (the poster rule: ✅ means
   * shipped, everywhere, the same way).
   */
  shipped: boolean
}

export interface LitEpic {
  slug: string
  name: string
  shipped: boolean
}

export interface HorizonDestinationView extends HorizonDestination {
  status: DestinationStatus
  /**
   * Epics from the pushed artifact that matched this destination's registered `epics`, in registry
   * order. Only MATCHED epics appear here — an artifact epic whose slug is not registered against
   * any destination never appears anywhere in the output (an un-groomed or renamed epic lights
   * nothing, silently, rather than erroring).
   */
  litBy: LitEpic[]
}

/**
 * Derive every destination's lit/partial/coming state from a pushed artifact's epics.
 *
 * A destination is:
 *   - `lit`     — at least one of its registered epics matched, and EVERY matched epic is shipped.
 *   - `partial` — at least one matched epic is shipped, but not all of them.
 *   - `coming`  — no matched epic is shipped (including the case where none of its registered epics
 *                 appear in the artifact at all — an epic not yet pushed is exactly as "not shipped"
 *                 as one pushed and still in flight).
 *
 * This is the ONLY place a destination's badge is decided — the page renders `status` and `litBy`
 * verbatim rather than re-deriving anything, so "nothing claims ✅ for unshipped work" (the poster
 * rule) holds by construction: `lit` is unreachable unless every contributing epic's own `shipped`
 * flag says so.
 */
export function deriveHorizon(epics: ReadonlyArray<HorizonEpicInput>): HorizonDestinationView[] {
  const bySlug = new Map(epics.map((epic) => [epic.slug, epic]))

  return HORIZON_DESTINATIONS.map((destination) => {
    const litBy: LitEpic[] = destination.epics.flatMap((slug) => {
      const epic = bySlug.get(slug)
      return epic ? [{ slug: epic.slug, name: epic.name, shipped: epic.shipped }] : []
    })

    const shippedCount = litBy.filter((epic) => epic.shipped).length
    const status: DestinationStatus =
      litBy.length > 0 && shippedCount === litBy.length ? 'lit' : shippedCount > 0 ? 'partial' : 'coming'

    return { ...destination, status, litBy }
  })
}
