import assert from 'node:assert/strict'
import { existsSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'
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
  'legacy-keys': false,
}

test('the inventory classifies every direct project route exactly once', () => {
  const appDirectory = fileURLToPath(new URL('../app/app/', import.meta.url))
  const routeSegments = readdirSync(appDirectory, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(`${appDirectory}/${entry.name}/[projectSlug]/page.tsx`))
    .map((entry) => entry.name)
    .sort()
  const classified = PROJECT_ROUTE_INVENTORY.filter((surface) => surface.topLevelProjectRoute)
    .map((surface) => surface.routeSegment)
    .sort()

  assert.deepEqual(classified, routeSegments)
  assert.equal(new Set(classified).size, classified.length)
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
    ['journeys', 'experiments', 'flags', 'tasks', 'scenarios', 'setup/connect', 'flag-audit']
  )
  assert.deepEqual(
    links.find((link) => link.routeSegment === 'flags'),
    {
      routeSegment: 'flags',
      label: 'Flags',
      status: 'gated',
      section: 'ship',
      href: '/app/flags/project-one',
      description: 'read-only',
    }
  )
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
      // Story 3.2's audit is member-readable and therefore appears in both lists.
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

  assert.deepEqual(
    getSectionLinks(links, 'ship').map((l) => l.routeSegment),
    ['experiments', 'flags', 'flag-audit']
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

const legacyCredentialRoutes = ['keys', 'flag-credentials', 'agent-keys']
const mergedCredentialRoute = 'setup/keys'

test('Setup › Keys and the three routes it replaces are NEVER listed together, or both absent', () => {
  const segmentsFor = (consoleShell: boolean) =>
    getProjectSurfaceLinks({
      projectSlug: 'project-one',
      role: 'owner',
      gates: {
        ...allGatesOpen,
        'console-shell': consoleShell,
        'legacy-keys': !consoleShell,
      },
    }).map((link) => link.routeSegment)

  const lit = segmentsFor(true)
  assert.ok(lit.includes(mergedCredentialRoute), 'the merged route is missing with the console on')
  for (const legacy of legacyCredentialRoutes) {
    assert.equal(lit.includes(legacy), false, `${legacy} is still listed beside its replacement`)
  }

  const dark = segmentsFor(false)
  assert.equal(dark.includes(mergedCredentialRoute), false, 'the merged route leaked while dark')
  for (const legacy of legacyCredentialRoutes) {
    assert.ok(dark.includes(legacy), `${legacy} vanished before its replacement existed`)
  }
})

test('every credential surface is reachable in BOTH gate states — never zero', () => {
  // The property underneath the swap, stated so it cannot be satisfied by an empty Setup section.
  // An operator must always have somewhere to go for API keys, flag credentials and agent keys.
  for (const consoleShell of [true, false]) {
    const setup = getSectionLinks(
      getProjectSurfaceLinks({
        projectSlug: 'project-one',
        role: 'owner',
        gates: {
          ...allGatesOpen,
          'console-shell': consoleShell,
          'legacy-keys': !consoleShell,
        },
      }),
      'setup'
    )
    assert.ok(
      setup.length > 0,
      `Setup is empty with console-shell=${consoleShell} — an operator has nowhere to manage credentials`
    )
    // And specifically: something in Setup answers "what has access to this project".
    const answersAccess = setup.some((link) =>
      consoleShell
        ? link.routeSegment === mergedCredentialRoute
        : legacyCredentialRoutes.includes(link.routeSegment)
    )
    assert.ok(answersAccess, `no credential surface in Setup with console-shell=${consoleShell}`)
  }
})
