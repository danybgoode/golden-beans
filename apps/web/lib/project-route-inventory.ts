// The `/app` home is the operating map for a tenant. Keep its links and the classification of
// every top-level project route together so a new page cannot become another URL users must know.
// This module deliberately has no framework or environment imports: the caller supplies the
// already-read gate values, which leaves the inventory directly testable in the fast unit layer.

// TYPE-only, deliberately. This module's header promises "no framework or environment imports", and
// a type import is erased at compile time — so the closed icon union reaches the inventory without
// pulling React or lucide into the fast unit layer.
import type { IconName } from '@/components/ui/icon-names'

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
  // console-ia-overhaul · Sprint 2 (epic README, A7) — `console-shell` gates Setup › Connect,
  // exactly as `flag-console` gates its own routes.
  //
  // ⚠️ **`legacy-keys` and `legacy-flag-credentials` are GONE — design-system-rails S4.5.** They
  // were the other half of A7: derived as `!isConsoleShellEnabled()`, they made the three legacy
  // credential routes LEAVE the nav at the exact instant their merged replacement entered it, so the
  // two worlds were never listed together and never both absent. That machinery existed to swap
  // between two ways of minting a key. Story 4.5 leaves one, so the inverse became a switch with a
  // single position — and a gate whose value cannot change is a gate that reads like a decision
  // while making none.
  //
  // The three routes still ANSWER, as permanent redirects, and their manifest rows carry
  // `retiresIn: 4`. What is gone is their status as destinations somebody navigates to.
  | 'console-shell'
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
  /**
   * The rail's leading icon — `design-system-rails` Sprint 2, Story 2.4 (epic D4).
   *
   * ⚠️ **There was nowhere for an icon to come from before this field**, which is half of why the
   * rail never had one. The other half is that `check-design-drift.mjs` bans pictographs inside
   * `/app`, so the prototype's `◧ ◑ ◔ ≡` could not be typed into a component even if there had
   * been a slot. Both halves are closed together: the slot is here, and the values are names from
   * `components/ui/Icon`'s CLOSED union — so an unknown key is a compile error rather than a blank
   * square, and the guard has nothing to catch.
   *
   * A rail item is one line, 36px, with an icon and NO description and NO status badge (contract
   * Do-not #2). The description below still exists because `/app`'s own surface list renders it;
   * the rail does not.
   */
  iconKey: IconName
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

/**
 * Every `routeSegment` the inventory defines, as a literal union.
 *
 * ⚠️ **This exists because `railActive` was `string` and nothing checked that any of its 29 values
 * was the RIGHT one.** Story 3.3 made the prop required, which caught the twenty routes passing
 * nothing — but a wrong segment marks the wrong rail item, which is worse than marking none, and
 * typecheck plus both browser suites stayed green through a mutation that pointed
 * `/app/setup/connect` at `setup/keys` (fresh reviewer, Major, mutation-verified).
 *
 * The prop's own comment claimed "the same reasoning as `iconKey` in Story 2.4" — but `iconKey` is a
 * closed `IconName` union where an unknown key is a compile error, and `railActive` accepted any
 * string. Now it is the same reasoning, in fact rather than by assertion: `PROJECT_ROUTE_INVENTORY`
 * is `as const satisfies`, so this union is DERIVED from the rows and a typo cannot compile.
 */
export type ProjectRouteSegment = (typeof PROJECT_ROUTE_INVENTORY)[number]['routeSegment']

export type ProjectSurfaceGates = Record<Exclude<ProjectSurfaceGate, 'always'>, boolean>

export type ProjectSurfaceLink = Pick<
  ProjectSurface,
  'routeSegment' | 'label' | 'status' | 'section' | 'iconKey'
> & {
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
// ⚠️ **THE ORDER OF THIS LIST IS THE ORDER OF THE RAIL**, and Story 4.3 corrected Ship's.
//
// `getSectionLinks` is a filter over this array, so a section's rail renders in inventory order.
// The approved Ship rail is **Features · Experiments · Scheduled changes · Activity**; this list had
// Experiments above Features, which is a visible departure from a design the product owner
// approved, and nothing could go red on it — the section-composition test asserted the order the
// code happened to have. Corrected here rather than reported, because WAYS-OF-WORKING now says an
// approved design IS the contract where one has been approved, and `project-route-inventory.test.ts`
// names all four so the correction is a decision somebody can read rather than a silent reshuffle.
//
// Measure (Journeys · Scenarios) and Setup (Connect · Keys · Destinations · Share links) were
// already in approved order; both were checked at the same time rather than assumed.
export const PROJECT_ROUTE_INVENTORY = [
  // ── RETIRED — design-system-rails · Sprint 4, Story 4.5 ──────────────────────────────────────
  //
  // `keys`, `flag-credentials` and `agent-keys` were three nav surfaces here. They are gone, and so
  // are the `legacy-keys` / `legacy-flag-credentials` gates that swapped them in and out against
  // `setup/keys`. Their ROUTES still answer — as permanent redirects to Setup › Keys — but a
  // redirect is not a destination, and three nav entries leading to one page is three ways to be
  // told the same thing.
  //
  // The gate machinery went with them because it had nothing left to decide. `A7` derived
  // `legacy-keys` as `!consoleShell` so that exactly one of the two credential worlds was ever
  // listed; with only one world left, the inverse is a switch with one position. `setup/keys` is
  // `gate: 'always'` for the same reason its page no longer calls `isConsoleShellEnabled()` — it is
  // the ONLY surface that mints, and a rollback that removed it would leave a project unable to
  // issue any credential at all.
  {
    routeSegment: 'journeys',
    iconKey: 'route',
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
    routeSegment: 'flags',
    iconKey: 'flag',
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
    routeSegment: 'experiments',
    iconKey: 'flask',
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
    routeSegment: 'tasks',
    iconKey: 'list-checks',
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
    iconKey: 'shield',
    audience: 'member',
    gate: 'always',
    status: 'linked',
    topLevelProjectRoute: true,
    section: 'measure',
    label: 'Scenarios & breakers',
    href: (slug: string) => `/app/scenarios/${slug}`,
    description: () => 'read-only drills, impact evidence and protective trips',
  },
  // console-ia-overhaul · Sprint 2. The two new Setup destinations, listed BEFORE the routes they
  // replace: inventory order is nav order and rail order, so with the console on these are what
  // Setup opens onto, and with it off they are absent and the legacy three take their place.
  {
    routeSegment: 'setup/connect',
    iconKey: 'cable',
    // MEMBER-readable. The connector URL is how this project's own operators point an agent at their
    // data; minting one is owner-only (the action re-checks), but reading the page is not.
    audience: 'member',
    gate: 'console-shell',
    status: 'gated',
    topLevelProjectRoute: false,
    section: 'setup',
    label: 'Connect your agent',
    href: (slug: string) => `/app/setup/connect/${slug}`,
    description: () => 'your own project’s connector URL',
  },
  {
    routeSegment: 'setup/keys',
    iconKey: 'key',
    // OWNER-only, matching all three routes it merges — the boundary moves tighter or identical,
    // never looser (D5/A5). A member gets a flat 404, exactly as on `/app/keys` today.
    audience: 'owner',
    gate: 'always',
    status: 'gated',
    topLevelProjectRoute: false,
    section: 'setup',
    label: 'Keys',
    href: (slug: string) => `/app/setup/keys/${slug}`,
    description: () => 'everything with access to this project',
  },
  {
    // ── design-system-rails · Story 4.3 — the rail's fourth Ship item, DECIDED not discovered ────
    //
    // ⚠️ **The approved Ship rail has four items and the product had no such route, table or
    // scheduling capability.** Verified by grep across the whole repo at the architecture lock: no
    // `/app/scheduled`, no scheduled-changes table, nothing anywhere that could schedule a flag
    // change. The sprint doc's original sentence ("the rail shows `0` today") described the
    // PROTOTYPE's rail as though it were the product's, and a builder would have gone looking for a
    // page that does not exist.
    //
    // Dropping a rail item is an amendment to an approved design, so it went to Daniel rather than
    // into an architect's judgement. **Decided 2026-08-29: ship the designed empty-state route.**
    // The counter-argument is recorded in the epic README (D13) rather than lost — Story 4.1's own
    // rule is *"a control that goes nowhere is worse than no control"* — and the accepted mitigation
    // is that the empty state says PLAINLY that scheduling is not available yet. It must not read as
    // "you have no scheduled changes", which implies you could have some.
    //
    // `gate: 'flag-console'` rather than `'always'`: this item sits in Ship beside Features and
    // Activity, both of which are console surfaces, and a rail item that survived a console rollback
    // would point at a page rendered by an epic that had been rolled back.
    routeSegment: 'scheduled',
    iconKey: 'calendar-clock',
    // MEMBER-readable. There is nothing here to protect — the page holds no data at all — and
    // owner-gating a page that says "this is not built yet" would tell a member less than it tells
    // everyone else for no boundary in return.
    audience: 'member',
    gate: 'flag-console',
    status: 'gated',
    topLevelProjectRoute: true,
    section: 'ship',
    label: 'Scheduled changes',
    href: (slug: string) => `/app/scheduled/${slug}`,
    description: () => 'changes that will happen on their own — not built yet',
  },
  {
    routeSegment: 'flag-audit',
    iconKey: 'activity',
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
    iconKey: 'webhook',
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
    iconKey: 'link',
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
    routeSegment: 'onboarding',
    iconKey: 'sparkles',
    audience: 'member',
    gate: 'always',
    status: 'flow-only',
    topLevelProjectRoute: true,
    section: 'setup',
    label: 'Onboarding',
    href: (slug: string) => `/app/onboarding/${slug}`,
    description: () => 'first-key and starter-feature handoff',
  },
] as const satisfies readonly ProjectSurface[]

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
    iconKey: surface.iconKey,
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
