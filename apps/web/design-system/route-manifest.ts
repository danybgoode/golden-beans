// The coverage manifest — one generated number for how much of the product is on the design system.
//
// ── Why this exists ───────────────────────────────────────────────────────────────────────────
// The previous epic's visual gate was born covering ONE route of twenty-nine, with five deferred
// rows and no way to see that from the outside. An XXL redesign with no finish line is a redesign
// that stops when someone gets tired, and an off-system page is a debt nobody can point at. This
// module is the finish line: every in-scope route, what it must look like, and whether it does.
//
// ── "No second list" — what that actually means here (epic README, D5-b) ──────────────────────
// The scaffolded plan said the manifest "extends `lib/project-route-inventory.ts`". It cannot,
// literally: that list holds **14** surfaces and this epic covers **29** routes. The two answer
// different questions — the inventory answers *"what may this member navigate to"* (so `/login` is
// correctly absent from it), and this answers *"is this route on the design system"* (so `/login`
// is correctly present here). Folding one into the other would put the sign-in page in a member's
// navigation.
//
// So the inventory stays the single source of truth for the 14 nav surfaces, this is the single
// source of truth for design coverage, and `route-manifest.test.ts` WELDS them: every inventory
// surface must have a row here, so a new nav surface with no reference state turns the manifest red
// rather than silently reducing the percentage.
//
// ── The rows are checked against the filesystem, not trusted ──────────────────────────────────
// `route-manifest.test.ts` walks `apps/web/app` for real `page.tsx` files and asserts the manifest
// and the repository agree about which routes exist. A hand-maintained list of routes is a list
// that goes stale the first time someone adds a page; this one cannot.
//
// ── Zero imports, deliberately ────────────────────────────────────────────────────────────────
// This module imports NOTHING, including `lib/project-route-inventory.ts`. Two reasons, and the
// second is the load-bearing one:
//
//   1. `@/` is a TypeScript path alias that Node does not resolve, and the unit layer runs these
//      files under bare `node --test`. A runtime import would have to be relative AND carry a `.ts`
//      extension, which the app's own tsconfig rejects (TS5097).
//   2. The weld belongs in the TEST, not in the data. `route-manifest.test.ts` imports both lists
//      and asserts they agree. A data module that pulls in a second list to check itself is a
//      module that can only be read by loading half the app — and this one is read by a Playwright
//      spec, a CI script and a unit test.

/** Which of DD3's three frames a route renders in. `hub` is `public`'s peer, per DD2. */
export type DesignFrame = 'console' | 'door' | 'public' | 'hub'

/** Which seam's kill-switch covers this route (epic README, D6). */
export type DesignSeam = 'product-shell' | 'frame'

export type Sprint = 1 | 2 | 3 | 4 | 5 | 6

/**
 * A deferred row's owner and decay date.
 *
 * The last epic shipped five deferred rows at birth, each with a reason and none with an owner or a
 * date — so there was nothing to expire and nobody to ask. `until` is an ISO date and the gate fails
 * once it passes: a deferral with no end is just an exemption wearing an apology.
 */
export type Deferral = {
  owner: string
  /** ISO `YYYY-MM-DD`. The gate fails when this date is in the past. */
  until: string
  why: string
}

export type CoverageRow = {
  /** The Next.js route pattern, as a user would type it. */
  route: string
  /** `page.tsx` path relative to `apps/web/app`, so the test can check the file really exists. */
  page: string
  label: string
  frame: DesignFrame
  seam: DesignSeam
  /** `routeSegment` in `PROJECT_ROUTE_INVENTORY`, or `null` for a route that is not a nav surface. */
  surface: string | null
  /** An id from `approved-states.mjs`, or `null` while the route has no approved state. */
  referenceState: string | null
  /**
   * Does this route's own PAGE BODY render from `apps/web/design-system/`?
   *
   * ⚠️ **The page, not the chrome, and the distinction is the whole value of the number.** Sprint 3
   * puts every console route inside the design system's shell in one commit. If this boolean meant
   * "is wrapped by a design-system frame", coverage would leap from 0 to 21 that day while
   * twenty-one page bodies were still the old design — a number measuring the wrapper it was
   * supposed to be measuring through.
   *
   * So the gate asserts a `ds-`-prefixed class **inside `<main>`**, which only the page's own markup
   * can put there, plus the two geometry promises that hold for any dataset — no vertical page
   * scroll at 1440×960, and no horizontal page scroll ever.
   *
   * ⚠️ **It does NOT yet assert the route against its reference state's rendered geometry**, and an
   * earlier version of this comment said it did (fresh reviewer). `referenceState` is read by
   * nothing in `console-visual.authed.spec.ts` today. The per-state assertion arrives with the
   * sprint that builds each page, because there is nothing to compare a reference state against
   * until the page renders from the system — Sprint 4 for Ship and Setup, 5 for Measure and Today,
   * 6 for the doors and the hub. Written down here rather than implied, because a comment claiming
   * an assertion that does not exist is the defect class this epic is named after.
   *
   * This is a DECLARATION the gate VERIFIES, never a claim it takes on trust: a row that says `true`
   * and renders without it fails. That is the only thing standing between this number and whatever
   * the last person hoped.
   *
   * ── And the third boolean? ────────────────────────────────────────────────────────────────
   * Story 1.5 asks for three: has a reference state · renders from `design-system/` · passes the
   * visual gate. The third is deliberately NOT a field here. It is the gate's RESULT, and the gate
   * is blocking — so a field for it would be `true` on `main` by construction and would be storing a
   * fact that cannot be false, which is this epic's own definition of a guard that cannot fail.
   * `coverage().complete` counts the two that are properties of the code; CI being green is what
   * makes the third true, and merging is what asserts it.
   */
  rendersFromDesignSystem: boolean
  /** The sprint that puts this route on the system. */
  landsIn: Sprint
  /**
   * `true` while this route's `page.tsx` does not exist yet.
   *
   * ⚠️ **This replaced a sprint-number comparison, and the reason is this epic's own subject**
   * (cross-family review, vibe). The test used to permit a missing file when `landsIn > 1` — which
   * is true today and rots on the day Sprint 2 opens: after Sprint 4 merges, a row with
   * `landsIn: 4` and no page would still have been permitted, so the assertion would quietly stop
   * asserting. An env var was suggested; that just moves the clock somewhere a test cannot check.
   *
   * A flag is self-correcting instead: the test asserts BOTH directions — a row with this set must
   * have no file, and a row without it must have one. So a builder who creates the page and forgets
   * to clear the flag fails, and a row that quietly loses its page fails. Neither needs to know what
   * day it is.
   */
  notYetBuilt?: true
  /** The sprint that removes this route, for the three credential routes Story 4.5 retires. */
  retiresIn: Sprint | null
  /** Set only when a row is knowingly short. Never `null` *and* off-system after `landsIn`. */
  deferred: Deferral | null
}

/**
 * Every route this epic is measured on.
 *
 * ⚠️ **THE DENOMINATOR MOVES, AND THE LEDGER IS HERE** (epic README, D13). The plan said "29 in-scope
 * routes", computed as 32 `page.tsx` files minus 3 out of scope. That is right *today* and wrong at
 * epic close, because the epic's own stories change the set:
 *
 *   − 3  `/app/keys`, `/app/flag-credentials`, `/app/agent-keys` are RETIRED by Story 4.5, which
 *        moves minting onto Setup › Keys in the same commit. A redirect has no design.
 *   + 1  `/app/scheduled/[projectSlug]` is ADDED by Story 4.3. The approved Ship rail has four
 *        items and the product had no such route, table or capability — Daniel's call (2026-08-29)
 *        was to ship the designed empty state rather than drop the rail item.
 *
 * So: **29 today → 27 at epic close.** `coverage()` computes the denominator from the rows that are
 * live at the sprint being asked about, rather than from a number typed into a document, because a
 * typed number is exactly what this epic exists to stop.
 *
 * Out of scope, deliberately: `/`, `/methodology` and `/methodology/[chapter]`. They shipped on the
 * brand system in two earlier epics, and putting them behind this epic's kill-switch would mean a
 * rollback here un-ships work this epic never touched (D6).
 */
export const ROUTE_MANIFEST: readonly CoverageRow[] = [
  // ── Today ───────────────────────────────────────────────────────────────────────────────────
  {
    route: '/app',
    page: 'app/page.tsx',
    label: 'Today',
    frame: 'console',
    seam: 'product-shell',
    surface: null,
    referenceState: 'today',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/tasks/[projectSlug]',
    page: 'app/tasks/[projectSlug]/page.tsx',
    label: 'Tasks',
    frame: 'console',
    seam: 'product-shell',
    surface: 'tasks',
    // DD5 — one design, two mounts. Tasks is Today's third band, also mounted as its own page.
    referenceState: 'tasks-standalone',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },

  // ── Measure ─────────────────────────────────────────────────────────────────────────────────
  {
    route: '/app/impact/[projectSlug]/[featureKey]',
    page: 'app/impact/[projectSlug]/[featureKey]/page.tsx',
    label: 'Impact',
    frame: 'console',
    seam: 'product-shell',
    surface: null,
    // ⚠️ An architect mapping, not one the sprint doc made. The approved Measure rail opens on
    // "North Star", and the product has no `/app/north-star` route — but `/app/impact/…` reads
    // `getFeatureImpact` from `lib/north-star-query.ts` and is the only route in the product that
    // renders the North Star and a lift against it. So this route IS that state, feature-scoped,
    // rather than a route left without one.
    referenceState: 'measure-north-star',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/funnel/[projectSlug]/[featureKey]',
    page: 'app/funnel/[projectSlug]/[featureKey]/page.tsx',
    label: 'Funnel',
    frame: 'console',
    seam: 'product-shell',
    surface: null,
    // DD5 again: the same design as the feature page's Funnel tab (`feature-funnel`).
    referenceState: 'funnel-standalone',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/journeys/[projectSlug]',
    page: 'app/journeys/[projectSlug]/page.tsx',
    label: 'Journeys',
    frame: 'console',
    seam: 'product-shell',
    surface: 'journeys',
    referenceState: 'measure-journeys',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/journeys/[projectSlug]/[journeyKey]',
    page: 'app/journeys/[projectSlug]/[journeyKey]/page.tsx',
    label: 'Journey',
    frame: 'console',
    seam: 'product-shell',
    surface: null,
    referenceState: 'measure-journey',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/scenarios/[projectSlug]',
    page: 'app/scenarios/[projectSlug]/page.tsx',
    label: 'Scenarios & breakers',
    frame: 'console',
    seam: 'product-shell',
    surface: 'scenarios',
    referenceState: 'measure-scenarios',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },

  // ── Ship ────────────────────────────────────────────────────────────────────────────────────
  {
    route: '/app/flags/[projectSlug]',
    page: 'app/flags/[projectSlug]/page.tsx',
    label: 'Features',
    frame: 'console',
    seam: 'product-shell',
    surface: 'flags',
    // Also `ship-features-dormant` and `ship-compare`; the gate asserts the default state and the
    // sprint's specs drive the other two. One row, one default — a row per state would make the
    // denominator a count of screenshots rather than of routes.
    referenceState: 'ship-features',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/flags/[projectSlug]/[flagKey]',
    page: 'app/flags/[projectSlug]/[flagKey]/page.tsx',
    label: 'Feature',
    frame: 'console',
    seam: 'product-shell',
    surface: null,
    // Plus `feature-environments` and `feature-funnel` as its tabs.
    referenceState: 'feature-value',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/experiments/[projectSlug]',
    page: 'app/experiments/[projectSlug]/page.tsx',
    label: 'Experiments',
    frame: 'console',
    seam: 'product-shell',
    surface: 'experiments',
    referenceState: 'ship-experiments',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/experiments/[projectSlug]/[experimentKey]',
    page: 'app/experiments/[projectSlug]/[experimentKey]/page.tsx',
    label: 'Experiment',
    frame: 'console',
    seam: 'product-shell',
    surface: null,
    // Plus `experiment-blocked`. ⚠️ Neither is reachable on `miyagisanchez` — both its experiments
    // are `decided` (D10). The populated states are asserted on the specimen and the local fixture.
    referenceState: 'experiment-ready',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/scheduled/[projectSlug]',
    notYetBuilt: true,
    // ⚠️ DOES NOT EXIST YET — added by Story 4.3. See the D13 ledger above: the approved Ship rail
    // has four items and the product has no scheduling route, table or capability. Daniel decided
    // (2026-08-29) to ship the designed EMPTY state rather than drop the rail item.
    page: 'app/scheduled/[projectSlug]/page.tsx',
    label: 'Scheduled changes',
    frame: 'console',
    seam: 'product-shell',
    surface: 'scheduled',
    referenceState: 'ship-activity',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/flag-audit/[projectSlug]',
    page: 'app/flag-audit/[projectSlug]/page.tsx',
    label: 'Activity',
    frame: 'console',
    seam: 'product-shell',
    surface: 'flag-audit',
    referenceState: 'ship-activity',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },

  // ── Setup ───────────────────────────────────────────────────────────────────────────────────
  {
    route: '/app/setup/connect/[projectSlug]',
    page: 'app/setup/connect/[projectSlug]/page.tsx',
    label: 'Connect your agent',
    frame: 'console',
    seam: 'product-shell',
    surface: 'setup/connect',
    referenceState: 'setup-connect',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/setup/keys/[projectSlug]',
    page: 'app/setup/keys/[projectSlug]/page.tsx',
    label: 'Keys',
    frame: 'console',
    seam: 'product-shell',
    surface: 'setup/keys',
    referenceState: 'setup-keys',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/destinations/[projectSlug]',
    page: 'app/destinations/[projectSlug]/page.tsx',
    label: 'Destinations',
    frame: 'console',
    seam: 'product-shell',
    surface: 'destinations',
    referenceState: 'setup-destinations',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/shares/[projectSlug]',
    page: 'app/shares/[projectSlug]/page.tsx',
    label: 'Share links',
    frame: 'console',
    seam: 'product-shell',
    surface: 'shares',
    referenceState: 'setup-shares',
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/app/onboarding/[projectSlug]',
    page: 'app/onboarding/[projectSlug]/page.tsx',
    label: 'Onboarding',
    frame: 'console',
    seam: 'product-shell',
    surface: 'onboarding',
    // `flow-only` in the inventory and gated out of the nav. It gets a state because a person can
    // reach it, not because the nav lists it — and its job (first key, starter feature) is the
    // Connect teaching shape, which is why it renders that language.
    referenceState: 'setup-connect',
    rendersFromDesignSystem: false,
    landsIn: 5,
    retiresIn: null,
    deferred: null,
  },

  // ── The three credential routes Story 4.5 retires ───────────────────────────────────────────
  // They are listed rather than omitted: a route that still serves and is absent from the manifest
  // is a route with no coverage obligation and no visibility, which is how the last epic ended up
  // measuring one route in twenty-nine. `retiresIn` is what removes them from the denominator, on
  // the sprint that actually removes them.
  {
    route: '/app/keys/[projectSlug]',
    page: 'app/keys/[projectSlug]/page.tsx',
    label: 'API keys (legacy)',
    frame: 'console',
    seam: 'product-shell',
    surface: 'keys',
    referenceState: null,
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: 4,
    deferred: null,
  },
  {
    route: '/app/flag-credentials/[projectSlug]',
    page: 'app/flag-credentials/[projectSlug]/page.tsx',
    label: 'Flag credentials (legacy)',
    frame: 'console',
    seam: 'product-shell',
    surface: 'flag-credentials',
    referenceState: null,
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: 4,
    deferred: null,
  },
  {
    route: '/app/agent-keys/[projectSlug]',
    page: 'app/agent-keys/[projectSlug]/page.tsx',
    label: 'Agent write keys (legacy)',
    frame: 'console',
    seam: 'product-shell',
    surface: 'agent-keys',
    referenceState: null,
    rendersFromDesignSystem: false,
    landsIn: 4,
    retiresIn: 4,
    deferred: null,
  },

  // ── The doors (seam B) ──────────────────────────────────────────────────────────────────────
  {
    route: '/login',
    page: 'login/page.tsx',
    label: 'Sign in',
    frame: 'door',
    seam: 'frame',
    surface: null,
    referenceState: 'door-login',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/signup',
    page: 'signup/page.tsx',
    label: 'Start free',
    frame: 'door',
    seam: 'frame',
    surface: null,
    // Plus `door-signup-closed` — the gate asserts whichever `SIGNUP_ENABLED` selects, and both
    // states are approved because both are reachable in production depending on that flag.
    referenceState: 'door-signup-open',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/install',
    page: 'install/page.tsx',
    label: 'Install the connector',
    frame: 'public',
    seam: 'frame',
    surface: null,
    referenceState: 'public-install',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/s/[token]',
    page: 's/[token]/page.tsx',
    label: 'Shared report',
    frame: 'public',
    seam: 'frame',
    surface: null,
    // ⚠️ `public-gone` is its OTHER state and there is deliberately no expired state (finding F2):
    // the route calls `notFound()` for unknown, malformed, expired AND revoked alike, so the page
    // cannot tell an attacker which one a token is. Do not add one to satisfy a doc.
    referenceState: 'public-share',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/talk',
    page: 'talk/page.tsx',
    label: 'Book a Pod',
    frame: 'public',
    seam: 'frame',
    surface: null,
    referenceState: 'public-talk',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },

  // ── The hub (seam B) — a PEER view of the project, not a fifth section (DD2) ─────────────────
  {
    route: '/hub/[projectSlug]',
    page: 'hub/[projectSlug]/page.tsx',
    label: 'Roadmap hub',
    frame: 'hub',
    seam: 'frame',
    surface: null,
    referenceState: 'hub-roadmap',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/hub/[projectSlug]/epic/[epicSlug]',
    page: 'hub/[projectSlug]/epic/[epicSlug]/page.tsx',
    label: 'Epic',
    frame: 'hub',
    seam: 'frame',
    surface: null,
    referenceState: 'hub-epic',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/hub/[projectSlug]/horizon',
    page: 'hub/[projectSlug]/horizon/page.tsx',
    label: 'Horizon',
    frame: 'hub',
    seam: 'frame',
    surface: null,
    referenceState: 'hub-horizon',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
  {
    route: '/hub/[projectSlug]/report',
    page: 'hub/[projectSlug]/report/page.tsx',
    label: 'Pod report',
    frame: 'hub',
    seam: 'frame',
    surface: null,
    referenceState: 'hub-report',
    rendersFromDesignSystem: false,
    landsIn: 6,
    retiresIn: null,
    deferred: null,
  },
]

/**
 * Routes deliberately outside this epic. Listed, not omitted — an omission is indistinguishable
 * from an oversight, and this is the second epic in a row where "it wasn't in the list" was the
 * whole explanation for an unmeasured surface.
 */
export const OUT_OF_SCOPE_PAGES: readonly { page: string; why: string }[] = [
  {
    page: 'page.tsx',
    why: 'the public landing — shipped on the brand system by landing-frijoles-rebrand and landing-maker-ops',
  },
  {
    page: 'methodology/page.tsx',
    why: 'shipped on the brand system by methodology-experience',
  },
  {
    page: 'methodology/[chapter]/page.tsx',
    why: 'shipped on the brand system by methodology-experience',
  },
  {
    page: 'app/design-system/page.tsx',
    why:
      'the design system\u2019s own specimen. It is not product surface and counting it would be ' +
      'circular \u2014 the specimen IS the reference every other route is measured against, so a route ' +
      'that renders the system by definition renders the system. It is still GATED: ' +
      'e2e/design-system-specimen.authed.spec.ts asserts every scale step against scales.ts, the ' +
      'dialog\u2019s position, the keyboard focus pass and both anonymous auth paths \u2014 and Sprint 2\u2019s ' +
      'walkthrough is the screen where Daniel approves or rejects the language. It is simply not a ' +
      'route the product owes a design to.',
  },
]

/** Rows that are still live at the end of `sprint` — the coverage denominator. */
export function liveRows(sprint: Sprint = 6): CoverageRow[] {
  return ROUTE_MANIFEST.filter((row) => row.retiresIn === null || row.retiresIn > sprint)
}

export type Coverage = {
  /** Rows counted — routes live at this sprint. */
  total: number
  hasReferenceState: number
  rendersFromDesignSystem: number
  /** All booleans true. **This is the headline number**, and the one the DoD means. */
  complete: number
  /** The covered routes, so the ratchet can name what REGRESSED instead of inferring it. */
  covered: string[]
  /** Rows that are short of complete, so a report can name them rather than just count them. */
  outstanding: string[]
}

/**
 * The coverage numbers.
 *
 * `complete` requires BOTH booleans, and that is deliberate: a route with an approved reference
 * state that does not render from the design system has a picture of what it should look like and
 * no relationship to it. Counting it would make the number measure intent rather than product —
 * which is precisely the failure the epic is named after.
 */
export function coverage(sprint: Sprint = 6): Coverage {
  const rows = liveRows(sprint)
  const complete = rows.filter((row) => row.referenceState !== null && row.rendersFromDesignSystem)
  return {
    total: rows.length,
    hasReferenceState: rows.filter((row) => row.referenceState !== null).length,
    rendersFromDesignSystem: rows.filter((row) => row.rendersFromDesignSystem).length,
    complete: complete.length,
    covered: complete.map((row) => row.route),
    outstanding: rows.filter((row) => !complete.includes(row)).map((row) => row.route),
  }
}
