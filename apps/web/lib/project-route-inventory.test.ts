import assert from 'node:assert/strict'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
// The component's OWN name list, so this test cannot check against a second copy that drifts.
import { ICON_NAMES } from '../components/ui/icon-names.ts'
import {
  CONSOLE_SECTIONS,
  getProjectSurfaceLinks,
  getSectionLinks,
  PROJECT_ROUTE_INVENTORY,
  type ConsoleSection,
  type ProjectSurfaceGates,
} from './project-route-inventory.ts'

const allGatesOpen: ProjectSurfaceGates = {
  'experiment-governance': true,
  'flag-console': true,
  'flag-serving': true,
  'journey-projections': true,
  signals: true,
  // Console ON ⇒ `legacy-keys` OFF, always. A7 makes them inverses, and a fixture that set both
  // true would be asserting against a state `readGates()` cannot produce.
  'console-shell': true,
}

/**
 * The three routes Story 4.5 retired into permanent redirects.
 *
 * ⚠️ **They still have a `page.tsx`, and they must.** The coverage manifest carries a row for each
 * with `retiresIn: 4`, and `route-manifest.test.ts` asserts every manifest row points at a real
 * file — so deleting them would make the manifest and the repository disagree. `liveRows()` is what
 * takes them out of the coverage denominator.
 *
 * They are named here rather than pattern-matched, because "a page that only redirects" is not
 * something a directory listing can see, and an exemption nobody has to write down is an exemption
 * that grows.
 */
const RETIRED_REDIRECT_ROUTES = ['agent-keys', 'flag-credentials', 'keys']

test('the inventory classifies every direct project route exactly once', () => {
  const appDirectory = fileURLToPath(new URL('../app/app/', import.meta.url))
  const routeSegments = readdirSync(appDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(`${appDirectory}/${entry.name}/[projectSlug]/page.tsx`))
    .map((entry) => entry.name)
    .filter((segment) => !RETIRED_REDIRECT_ROUTES.includes(segment))
    .sort()
  const classified = PROJECT_ROUTE_INVENTORY.filter((surface) => surface.topLevelProjectRoute)
    .map((surface) => surface.routeSegment)
    .sort()

  assert.deepEqual(classified, routeSegments)
  assert.equal(new Set(classified).size, classified.length)
})

test('a retired route is a REDIRECT — not a page that quietly still works', () => {
  // ⚠️ The exemption above lets three routes exist with no inventory row. Left alone, that is a hole:
  // any page dropped into one of those directories would inherit the exemption and be unclassified,
  // which is the "a route nobody has to make look right" state the manifest exists to prevent.
  //
  // So the exemption is EARNED, per file: each of the three must call `permanentRedirect` and must
  // hold no credential control. Asserted on the source, because the property is about what the file
  // IS rather than about what one request returned.
  const appDirectory = fileURLToPath(new URL('../app/app/', import.meta.url))
  for (const segment of RETIRED_REDIRECT_ROUTES) {
    const source = readFileSync(`${appDirectory}/${segment}/[projectSlug]/page.tsx`, 'utf8')
    assert.match(
      source,
      /permanentRedirect\(/,
      `${segment} is exempt from classification but does not redirect — it is a live route with no inventory row`
    )
    assert.match(source, /\/app\/setup\/keys\//, `${segment} redirects somewhere other than Setup › Keys`)
    // And it kept none of what it used to do. A retired route that still renders a mint form is the
    // "two ways to issue a credential" state this story exists to end.
    for (const control of ['issueApiKey', 'mintFlagReadKey', 'mintFlagSyncKey', 'mintAgentWriteKey']) {
      assert.equal(
        source.includes(control),
        false,
        `${segment} still references ${control} — the controls were supposed to move, not be copied`
      )
    }
  }
})

test('members see every live member surface but never owner-only or flow-only routes', () => {
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'member',
    gates: allGatesOpen,
  })

  assert.deepEqual(
    links.map(({ routeSegment }) => routeSegment),
    // `flag-audit` is MEMBER-readable by design (Story 3.2): the audit answers "who changed this",
    // and gating it to owners would take it from exactly the people a change affects. `flag-credentials`
    // is absent here and present in the owner test below — that asymmetry is the assertion.
    // console-ia-overhaul Story 1.2 (D3): `funnel` and `impact` used to lead this list. They are
    // gone — not because the routes were deleted (they still render) but because neither could be
    // linked without a placeholder key. Their absence here IS the acceptance criterion.
    // design-system-rails S4.3: `scheduled` joins them. It is MEMBER-readable for the same reason
    // `flag-audit` is, and then some — the page holds no data at all, so owner-gating a surface
    // whose entire content is "this is not built yet" would tell a member less than it tells
    // everyone else for no boundary in return.
    [
      'journeys',
      // ⚠️ `flags` ahead of `experiments` — Story 4.3. The approved Ship rail is
      // Features · Experiments · Scheduled changes · Activity, and this list had the first two the
      // other way round. The rail renders in inventory order, so that was a visible departure from
      // an approved design that nothing could go red on.
      'flags',
      'experiments',
      'tasks',
      'scenarios',
      'setup/connect',
      'scheduled',
      'flag-audit',
    ]
  )
  assert.deepEqual(
    links.find((link) => link.routeSegment === 'flags'),
    {
      routeSegment: 'flags',
      // design-system-rails S2.4 (epic D4) — the rail's leading icon. This assertion pins the whole
      // link SHAPE, so a field added to `ProjectSurfaceLink` and not carried through
      // `getProjectSurfaceLinks`' mapper fails here rather than rendering as undefined.
      iconKey: 'flag',
      label: 'Flags',
      status: 'gated',
      section: 'ship',
      href: '/app/flags/project-one',
      description: 'read-only',
    }
  )
})

test('every surface carries an icon, and it is one the Icon component knows', () => {
  // ⚠️ The rail is one line per item with an icon and no description (contract Do-not #2), so a
  // surface with no icon renders a hole.
  //
  // ⚠️ **This comment used to justify the test with two claims that are both FALSE for this code**
  // (fresh reviewer, Minor, verified with `tsc`): it said the compiler would not catch "a
  // plausible-looking string" — it does, `iconKey: 'webhooks'` is TS2820 with a did-you-mean — and
  // that TypeScript misses a dropped key in an inferred literal — `getProjectSurfaceLinks` is
  // ANNOTATED `: ProjectSurfaceLink[]`, so that is TS2322.
  //
  // The test still earns its place, for a reason the compiler cannot cover: `ICON_NAMES` is read
  // from the COMPONENT, so this fails when the icon set and the inventory disagree about a name
  // that is valid in the union but absent from the render map — and it fails in the fast unit layer,
  // where a `tsc` error in a route nobody compiles in isolation would not be noticed.
  //
  // The union is closed, so this test cannot import a list of "valid names" that differs from the
  // component's: it reads the component's own `ICON_NAMES`.
  const known = new Set<string>(ICON_NAMES)
  for (const surface of PROJECT_ROUTE_INVENTORY) {
    assert.ok(surface.iconKey, `${surface.routeSegment} has no iconKey`)
    assert.ok(
      known.has(surface.iconKey),
      `${surface.routeSegment} uses icon "${surface.iconKey}", which Icon does not define`
    )
  }

  // ...and the mapper carries it. A `Pick<>` that gains a field still needs the mapper to copy it,
  // and TypeScript will not catch a missing key in an object literal that is inferred rather than
  // annotated.
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'owner',
    gates: allGatesOpen,
  })
  for (const link of links) {
    assert.ok(link.iconKey, `${link.routeSegment} lost its iconKey on the way through the mapper`)
  }
})

test('owner-only links stay owner-only while Flags and Tasks follow their independent gates', () => {
  const gates = { ...allGatesOpen, 'flag-serving': false, signals: false }
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'owner',
    gates,
  })

  assert.deepEqual(
    links.map(({ routeSegment }) => routeSegment),
    [
      'journeys',
      'experiments',
      'scenarios',
      // console-ia-overhaul Sprint 2 (A7): with the console ON, `keys`, `flag-credentials` and
      // `agent-keys` are ABSENT and these two are present. `allGatesOpen` sets `console-shell: true`
      // and `legacy-keys: false`, which is the only combination `readGates()` can produce.
      'setup/connect',
      'setup/keys',
      // Both member-readable, so both appear in this list too. `scheduled` sits between them in
      // INVENTORY order, which is what the rail renders — it is the fourth Ship item the approved
      // design has, decided by Daniel 2026-08-29 (epic D13).
      'scheduled',
      'flag-audit',
      'destinations',
      'shares',
    ]
  )
  assert.equal(
    links.some((link) => link.routeSegment === 'onboarding'),
    false
  )
})

// ── console-ia-overhaul · Sprint 1, Story 1.2 (epic README, D2) ────────────────────────────────

test('every surface declares a section, and every section is one of the four', () => {
  const valid = new Set<ConsoleSection>(CONSOLE_SECTIONS.map((section) => section.id))
  assert.equal(valid.size, 4)

  for (const surface of PROJECT_ROUTE_INVENTORY) {
    assert.ok(
      valid.has(surface.section),
      `${surface.routeSegment} declares section ${JSON.stringify(surface.section)}, which is not one of the four`
    )
  }
})

// The union being closed is a COMPILE-time property, so this test cannot assert it — a test that
// tried would be asserting something TypeScript already made unrepresentable, which is the shape of
// guard that passes forever while proving nothing. What it CAN assert is the runtime half the
// compiler does not see: that no section is declared and then never used, which is how a four-item
// nav quietly becomes a three-item nav with a dead tab.
test('no section is declared without at least one surface in it', () => {
  const used = new Set(PROJECT_ROUTE_INVENTORY.map((surface) => surface.section))
  const empty = CONSOLE_SECTIONS.filter((section) => !used.has(section.id)).map((s) => s.id)
  assert.deepEqual(
    empty,
    [],
    `these sections would render as a header tab leading to an empty rail: ${empty.join(', ')}`
  )
})

test('getSectionLinks partitions the entitled links — every link in exactly one section', () => {
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'owner',
    gates: allGatesOpen,
  })

  const partitioned = CONSOLE_SECTIONS.flatMap((section) => getSectionLinks(links, section.id))
  assert.equal(partitioned.length, links.length, 'a link was dropped or double-counted')
  assert.deepEqual(
    [...partitioned].map((l) => l.routeSegment).sort(),
    [...links].map((l) => l.routeSegment).sort()
  )
})

test('Ship holds the feature-operating surfaces and Setup holds every credential surface', () => {
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'owner',
    gates: allGatesOpen,
  })

  // ⚠️ FOUR items, which is what the approved Ship rail has. `scheduled` is the one the product had
  // no route for at all — Daniel decided (2026-08-29) to ship the designed empty-state route rather
  // than drop the rail item, and this list is where "the rail has four items" stops being a claim
  // about a mockup and becomes a property of the code.
  assert.deepEqual(
    getSectionLinks(links, 'ship').map((l) => l.routeSegment),
    ['flags', 'experiments', 'scheduled', 'flag-audit']
  )
  // Named rather than counted: every surface that mints or reveals a credential belongs to Setup,
  // and a credential surface appearing anywhere else is the finding this assertion exists to make.
  assert.deepEqual(
    getSectionLinks(links, 'setup').map((l) => l.routeSegment),
    ['setup/connect', 'setup/keys', 'destinations', 'shares']
  )
  assert.deepEqual(
    getSectionLinks(links, 'measure').map((l) => l.routeSegment),
    ['journeys', 'scenarios']
  )
  assert.deepEqual(
    getSectionLinks(links, 'today').map((l) => l.routeSegment),
    ['tasks']
  )
})

test('a section whose surfaces are all gated off returns no links, so the rail renders nothing', () => {
  // Ship is entirely gate-dependent: experiments, flags and flag-audit each ride a different gate.
  // With all three closed the section is empty — and Story 1.4 renders no rail rather than an empty
  // one, because an empty container promises that something belongs there.
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'owner',
    gates: {
      ...allGatesOpen,
      'experiment-governance': false,
      'flag-serving': false,
      'flag-console': false,
    },
  })
  assert.deepEqual(getSectionLinks(links, 'ship'), [])
  // ...while the other three are unaffected, which is what makes the emptiness specific rather than
  // a symptom of the links read having failed altogether.
  assert.ok(getSectionLinks(links, 'setup').length > 0)
})

// D3, stated as a property rather than as a grep in a commit message. `href` takes one argument
// now, so a placeholder has nowhere to live — but a future surface could still hardcode one into
// its template string, and this is the assertion that would catch it.
test('no surface builds a link containing a placeholder for the reader to edit', () => {
  const links = getProjectSurfaceLinks({
    projectSlug: 'project-one',
    role: 'owner',
    gates: allGatesOpen,
  })
  for (const link of links) {
    assert.doesNotMatch(
      link.href,
      /your-|<|\{|placeholder|feature-key/,
      `${link.routeSegment} links to ${link.href}, which asks the reader to edit a URL`
    )
    assert.doesNotMatch(
      link.description,
      /swap|edit the URL|address bar/i,
      `${link.routeSegment}'s description tells the reader to edit a URL: ${link.description}`
    )
  }
})

// ── A7: the swap is atomic, and that is the assertion ─────────────────────────────────────────
//
// The hazard this epic keeps paying for is a control that disappears before its replacement exists.
// Here the two are wired to the same boolean and its inverse, so "both listed" and "neither listed"
// are the two states that must be impossible — not merely unlikely.

// ── design-system-rails · Sprint 4, Story 4.5 — the swap is over, so its tests are too ────────
//
// Three tests lived here and all three described the SWAP: `Setup › Keys and the three routes it
// replaces are NEVER listed together, or both absent`, `every credential surface is reachable in
// BOTH gate states — never zero`, and `flag-credentials is never listed while its own route would
// 404`. Each pinned a real property of a world with two credential surfaces and a derived inverse
// choosing between them.
//
// That world is gone. `/app/keys`, `/app/flag-credentials` and `/app/agent-keys` are permanent
// redirects, their inventory rows are deleted, and `legacy-keys` / `legacy-flag-credentials` no
// longer exist as gates. Keeping the tests would mean keeping the machinery they describe — and a
// test asserting that a gate with one position takes the right position is a guard that cannot fail,
// which is the defect class this whole epic is named after.
//
// What they were PROTECTING is not dropped. It is stated below as the property that outlives the
// swap, and it is stronger than the version that was conditional on a flag.
const mergedCredentialRoute = 'setup/keys'

test('an owner can always reach the one surface that mints credentials — in EVERY gate state', () => {
  // ⚠️ The rule the three retired tests existed for, restated without the flag that used to
  // choose between two surfaces. There is one now, and this is where "one" is checked against
  // "always": if a later change gates Setup › Keys on anything, an operator loses the ability to
  // issue any credential at all in the state that gate closes — including the ingest key without
  // which nothing can send an event.
  //
  // EVERY combination, not a chosen pair. The record's keys are the closed gate union, so a new gate
  // is a compile error here and then a failure the moment somebody points Setup › Keys at it.
  const gateNames = Object.keys(allGatesOpen) as (keyof typeof allGatesOpen)[]
  for (let mask = 0; mask < 2 ** gateNames.length; mask += 1) {
    const gates = Object.fromEntries(
      gateNames.map((name, index) => [name, (mask & (1 << index)) !== 0])
    ) as typeof allGatesOpen
    const setup = getSectionLinks(
      getProjectSurfaceLinks({ projectSlug: 'project-one', role: 'owner', gates }),
      'setup'
    )
    assert.ok(
      setup.some((link) => link.routeSegment === mergedCredentialRoute),
      `Setup › Keys is missing with gates ${JSON.stringify(gates)} — an operator has nowhere to mint a credential`
    )
  }
})

test('the three retired credential routes are gone from the inventory, in every gate state', () => {
  // The other half, and it has to be asserted from this side: a redirect is not a destination, and
  // three nav entries leading to one page is three ways to be told the same thing. Reinstating any
  // of them would pass the test above while quietly restoring the world it describes as over.
  for (const consoleShell of [true, false]) {
    const segments = getProjectSurfaceLinks({
      projectSlug: 'project-one',
      role: 'owner',
      gates: { ...allGatesOpen, 'console-shell': consoleShell },
    }).map((link) => link.routeSegment)
    for (const retired of ['keys', 'flag-credentials', 'agent-keys']) {
      assert.equal(
        segments.includes(retired),
        false,
        `${retired} is listed again (console-shell=${consoleShell}); Story 4.5 retired it into a redirect`
      )
    }
  }
})
