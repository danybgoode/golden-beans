// The `/app` home is the operating map for a tenant. Keep its links and the classification of
// every top-level project route together so a new page cannot become another URL users must know.
// This module deliberately has no framework or environment imports: the caller supplies the
// already-read gate values, which leaves the inventory directly testable in the fast unit layer.

export type ProjectSurfaceAudience = 'member' | 'owner'
export type ProjectSurfaceGate =
  | 'always'
  | 'experiment-governance'
  // flags-console-parity · Sprint 3 — the credentials and lifecycle-audit routes exist only while
  // the console does. Widening this CLOSED union is deliberately a compile error at every caller
  // that builds a `ProjectSurfaceGates` record (`lib/shell-nav.ts`, `app/app/page.tsx`, and this
  // module's own test): a new gate that silently defaulted to open would put an unfinished route in
  // the nav of every tenant.
  | 'flag-console'
  | 'flag-serving'
  | 'journey-projections'
  | 'signals'
export type ProjectSurfaceStatus = 'linked' | 'gated' | 'flow-only'

type ProjectSurface = {
  routeSegment: string
  audience: ProjectSurfaceAudience
  gate: ProjectSurfaceGate
  status: ProjectSurfaceStatus
  /** True when this route has `app/<segment>/[projectSlug]/page.tsx`. */
  topLevelProjectRoute: boolean
  label: string
  href: (projectSlug: string, featureHint: string) => string
  description: (role: string) => string
}

export type ProjectSurfaceGates = Record<Exclude<ProjectSurfaceGate, 'always'>, boolean>

export type ProjectSurfaceLink = Pick<ProjectSurface, 'routeSegment' | 'label' | 'status'> & {
  href: string
  description: string
}

// The feature-keyed dashboards are deliberately inventory entries despite not having a direct
// `[projectSlug]/page.tsx`: they are still entry points rendered on `/app`. Their key placeholder
// remains here rather than being reintroduced as a second home-page-only convention.
export const PROJECT_ROUTE_INVENTORY: readonly ProjectSurface[] = [
  {
    routeSegment: 'funnel',
    audience: 'member',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: false,
    label: 'Funnel',
    href: (slug, featureHint) => `/app/funnel/${slug}/${featureHint}`,
    description: () => 'swap the feature key in the URL',
  },
  {
    routeSegment: 'impact',
    audience: 'member',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: false,
    label: 'Impact',
    href: (slug, featureHint) => `/app/impact/${slug}/${featureHint}`,
    description: () => 'swap the feature key in the URL',
  },
  {
    routeSegment: 'journeys',
    audience: 'member',
    gate: 'journey-projections',
    status: 'gated',
    topLevelProjectRoute: true,
    label: 'Journeys',
    href: (slug) => `/app/journeys/${slug}`,
    description: (role) => (role === 'owner' ? 'define and activate' : 'read-only'),
  },
  {
    routeSegment: 'experiments',
    audience: 'member',
    gate: 'experiment-governance',
    status: 'gated',
    topLevelProjectRoute: true,
    label: 'Experiment governance',
    href: (slug) => `/app/experiments/${slug}`,
    description: (role) => (role === 'owner' ? 'plan and operate' : 'read-only'),
  },
  {
    routeSegment: 'flags',
    audience: 'member',
    gate: 'flag-serving',
    status: 'gated',
    topLevelProjectRoute: true,
    label: 'Flags',
    href: (slug) => `/app/flags/${slug}`,
    description: (role) => (role === 'owner' ? 'define and operate' : 'read-only'),
  },
  {
    routeSegment: 'tasks',
    audience: 'member',
    gate: 'signals',
    status: 'gated',
    topLevelProjectRoute: true,
    label: 'Tasks',
    href: (slug) => `/app/tasks/${slug}`,
    description: () => 'review your evidence-backed queue',
  },
  {
    routeSegment: 'scenarios',
    audience: 'member',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    label: 'Scenarios & breakers',
    href: (slug) => `/app/scenarios/${slug}`,
    description: () => 'read-only drills, impact evidence and protective trips',
  },
  {
    routeSegment: 'keys',
    audience: 'owner',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    label: 'API keys',
    href: (slug) => `/app/keys/${slug}`,
    description: () => 'issue, rotate, revoke',
  },
  // flags-console-parity · Sprint 3, Stories 3.1 and 3.2. Registered here rather than merely linked,
  // because this file opens with the reason: "so a new page cannot become another URL users must
  // know." An unregistered route is a URL only its author knows.
  //
  // Both are `gate: 'flag-console'` — they hold controls MOVED off the flags page, so while the
  // console is dark those controls are still on that page and these routes 404. Listing them in the
  // nav then would be an invitation to a dead end.
  {
    routeSegment: 'flag-credentials',
    // Owner-only, and TIGHTER than the flags page it moves from: there a member could load the page
    // and simply see no key tables. A standalone credentials route 404s for them — the
    // `/app/keys/[projectSlug]` precedent. The boundary moves only tighter, never looser.
    audience: 'owner',
    gate: 'flag-console',
    status: 'gated',
    topLevelProjectRoute: true,
    label: 'Flag credentials',
    href: (slug) => `/app/flag-credentials/${slug}`,
    description: () => 'snapshot and catalog sync keys',
  },
  {
    routeSegment: 'flag-audit',
    // MEMBER-readable, exactly as the audit is on the flags page today. Moving a table must not
    // quietly make it owner-only, and `audience: 'owner'` here would do precisely that.
    audience: 'member',
    gate: 'flag-console',
    status: 'gated',
    topLevelProjectRoute: true,
    label: 'Flag audit',
    href: (slug) => `/app/flag-audit/${slug}`,
    description: () => 'who changed which flag, and why',
  },
  {
    routeSegment: 'destinations',
    audience: 'owner',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    label: 'Destinations',
    href: (slug) => `/app/destinations/${slug}`,
    description: () => 'signed webhook delivery',
  },
  // The share-link gate controls whether a minted link serves. Owners must still be able to
  // prepare a link before launch, otherwise there is no safe verify-before-send rollout order.
  {
    routeSegment: 'shares',
    audience: 'owner',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    label: 'Share links',
    href: (slug) => `/app/shares/${slug}`,
    description: () => 'scoped, revocable report links',
  },
  // The agent-write gate controls mutations, not credential preparation: an owner needs a key
  // ready before the live task-write surface can be verified.
  {
    routeSegment: 'agent-keys',
    audience: 'owner',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    label: 'Agent write keys',
    href: (slug) => `/app/agent-keys/${slug}`,
    description: () => 'let your own agent claim and resolve tasks',
  },
  {
    routeSegment: 'onboarding',
    audience: 'member',
    gate: 'always',
    status: 'flow-only',
    topLevelProjectRoute: true,
    label: 'Onboarding',
    href: (slug) => `/app/onboarding/${slug}`,
    description: () => 'first-key and starter-feature handoff',
  },
]

function isGateOpen(gate: ProjectSurfaceGate, gates: ProjectSurfaceGates): boolean {
  if (gate === 'always') return true
  return gates[gate]
}

/** Links that should render for this project member. Destination pages still enforce their own auth. */
export function getProjectSurfaceLinks(input: {
  projectSlug: string
  role: string
  featureHint: string
  gates: ProjectSurfaceGates
}): ProjectSurfaceLink[] {
  return PROJECT_ROUTE_INVENTORY.filter((surface) => {
    if (surface.status === 'flow-only') return false
    if (surface.audience === 'owner' && input.role !== 'owner') return false
    return isGateOpen(surface.gate, input.gates)
  }).map((surface) => ({
    routeSegment: surface.routeSegment,
    label: surface.label,
    status: surface.status,
    href: surface.href(input.projectSlug, input.featureHint),
    description: surface.description(input.role),
  }))
}
