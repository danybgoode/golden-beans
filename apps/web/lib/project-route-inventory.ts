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

// console-ia-overhaul · Sprint 1, Story 1.2 (epic README, D2) — the four destinations.
//
// A CLOSED union, for exactly the reason `ProjectSurfaceGate` above is one: adding a surface
// without choosing a section must be a compile error at every caller, not a silent default. A
// surface that defaulted into a section would be a page nobody decided where to put — which is the
// condition this epic exists to end.
//
// Why four, and why these four: they are the phases of the loop this engine is for. You look at
// what needs you (`today`), you look at what happened (`measure`), you change what is running
// (`ship`), and you wire the thing up once (`setup`). Every surface in the product answers exactly
// one of those questions, and the one that does not have a home is the one worth arguing about.
export type ConsoleSection = 'today' | 'measure' | 'ship' | 'setup'

/**
 * The sections in nav order, with the words the header renders.
 *
 * ONE list. `ProductShell` does not hold a second copy and neither does the rail — the same D1
 * argument `lib/shell-nav.ts` makes about the inventory, one level up: a hardcoded list in a
 * component is a duplicate source of truth that drifts the first time a section is renamed.
 */
export const CONSOLE_SECTIONS: readonly { id: ConsoleSection; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'measure', label: 'Measure' },
  { id: 'ship', label: 'Ship' },
  { id: 'setup', label: 'Setup' },
]

type ProjectSurface = {
  routeSegment: string
  audience: ProjectSurfaceAudience
  gate: ProjectSurfaceGate
  status: ProjectSurfaceStatus
  /** True when this route has `app/<segment>/[projectSlug]/page.tsx`. */
  topLevelProjectRoute: boolean
  /** Which of the four destinations this surface lives under. Closed union — see ConsoleSection. */
  section: ConsoleSection
  label: string
  // Story 1.2 (D3): `href` used to take a second argument, `featureHint`, so that the two
  // feature-keyed dashboards could be linked with a placeholder the user was expected to edit. Both
  // of those surfaces have left this inventory and the parameter went with them, which is what makes
  // "no navigation entry tells anyone to edit a URL" a property of the TYPE rather than a promise.
  href: (projectSlug: string) => string
  description: (role: string) => string
}

export type ProjectSurfaceGates = Record<Exclude<ProjectSurfaceGate, 'always'>, boolean>

export type ProjectSurfaceLink = Pick<ProjectSurface, 'routeSegment' | 'label' | 'status' | 'section'> & {
  href: string
  description: string
}

// console-ia-overhaul · Sprint 1, Story 1.2 (epic README, D3) — `funnel` and `impact` are GONE from
// this list, and the comment that used to sit here defending them is gone with them.
//
// It read: "The feature-keyed dashboards are deliberately inventory entries despite not having a
// direct `[projectSlug]/page.tsx`: they are still entry points rendered on /app. Their key
// placeholder remains here rather than being reintroduced as a second home-page-only convention."
// That was an honest description of a bad situation. Both surfaces are addressed per FEATURE key,
// so neither could be linked without a placeholder — their own `description` said, out loud, "swap
// the feature key in the URL". A navigation entry that instructs you to edit an address bar is not
// a navigation entry.
//
// **The ROUTES are not deleted.** `/app/funnel/[projectSlug]/[featureKey]` and `/app/impact/...`
// still exist, still render and still keep their URLs — Sprint 3 makes them a feature's tabs, so
// they become reachable by clicking the feature instead of by knowing its key. What is deleted is
// their status as top-level destinations, and with it the last caller of DEFAULT_FEATURE_HINT.
export const PROJECT_ROUTE_INVENTORY: readonly ProjectSurface[] = [
  {
    routeSegment: 'journeys',
    audience: 'member',
    gate: 'journey-projections',
    status: 'gated',
    topLevelProjectRoute: true,
    section: 'measure',
    label: 'Journeys',
    href: (slug: string) => `/app/journeys/${slug}`,
    description: (role) => (role === 'owner' ? 'define and activate' : 'read-only'),
  },
  {
    routeSegment: 'experiments',
    audience: 'member',
    gate: 'experiment-governance',
    status: 'gated',
    topLevelProjectRoute: true,
    section: 'ship',
    label: 'Experiment governance',
    href: (slug: string) => `/app/experiments/${slug}`,
    description: (role) => (role === 'owner' ? 'plan and operate' : 'read-only'),
  },
  {
    routeSegment: 'flags',
    audience: 'member',
    gate: 'flag-serving',
    status: 'gated',
    topLevelProjectRoute: true,
    section: 'ship',
    label: 'Flags',
    href: (slug: string) => `/app/flags/${slug}`,
    description: (role) => (role === 'owner' ? 'define and operate' : 'read-only'),
  },
  {
    routeSegment: 'tasks',
    audience: 'member',
    gate: 'signals',
    status: 'gated',
    topLevelProjectRoute: true,
    section: 'today',
    label: 'Tasks',
    href: (slug: string) => `/app/tasks/${slug}`,
    description: () => 'review your evidence-backed queue',
  },
  {
    routeSegment: 'scenarios',
    audience: 'member',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    section: 'measure',
    label: 'Scenarios & breakers',
    href: (slug: string) => `/app/scenarios/${slug}`,
    description: () => 'read-only drills, impact evidence and protective trips',
  },
  {
    routeSegment: 'keys',
    audience: 'owner',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    section: 'setup',
    label: 'API keys',
    href: (slug: string) => `/app/keys/${slug}`,
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
    section: 'setup',
    label: 'Flag credentials',
    href: (slug: string) => `/app/flag-credentials/${slug}`,
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
    section: 'ship',
    label: 'Flag audit',
    href: (slug: string) => `/app/flag-audit/${slug}`,
    description: () => 'who changed which flag, and why',
  },
  {
    routeSegment: 'destinations',
    audience: 'owner',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    section: 'setup',
    label: 'Destinations',
    href: (slug: string) => `/app/destinations/${slug}`,
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
    section: 'setup',
    label: 'Share links',
    href: (slug: string) => `/app/shares/${slug}`,
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
    section: 'setup',
    label: 'Agent write keys',
    href: (slug: string) => `/app/agent-keys/${slug}`,
    description: () => 'let your own agent claim and resolve tasks',
  },
  {
    routeSegment: 'onboarding',
    audience: 'member',
    gate: 'always',
    status: 'flow-only',
    topLevelProjectRoute: true,
    section: 'setup',
    label: 'Onboarding',
    href: (slug: string) => `/app/onboarding/${slug}`,
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
    section: surface.section,
    href: surface.href(input.projectSlug),
    description: surface.description(input.role),
  }))
}

/**
 * The entitled links of ONE section, in inventory order.
 *
 * Story 1.4's rail is this function and nothing else — a filter over what `getProjectSurfaceLinks`
 * already resolved, never a second read and never a second list. A section whose surfaces are all
 * gated off returns `[]`, and the caller renders no rail at all rather than an empty one: an empty
 * container is a promise that something belongs there.
 */
export function getSectionLinks(
  links: readonly ProjectSurfaceLink[],
  section: ConsoleSection
): ProjectSurfaceLink[] {
  return links.filter((link) => link.section === section)
}
