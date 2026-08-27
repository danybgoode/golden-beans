// console-ia-overhaul · Sprint 1, Story 1.3. The header's arithmetic, asserted directly.
//
// Every surface this decides is credential-gated, so the `api` Playwright project can only ever
// observe a login redirect — identical with the console gate on or off. `flags-console-parity`
// Sprint 1 corrected exactly this mistake once already. The assertions that matter therefore live
// here, against the pure module, where a role and a gate combination can simply be handed in.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Module from 'node:module'
import { getProjectSurfaceLinks, type ProjectSurfaceGates } from './project-route-inventory.ts'

// `console-shell.ts` imports its sibling extensionless, the way every module under lib/ does, and
// node's runner needs the extension. Same resolve hook as flag-environment-view.test.ts and five
// others — copied rather than shared because factoring it out would edit seven test files in the
// sprint that already rewrites the shell, and a shared-surface sprint should touch what it must.
type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown

const registerHooks = (
  Module as typeof Module & {
    registerHooks: (hooks: { resolve: ResolveHook }) => void
  }
).registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/apps/web/lib/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const { buildConsoleHeader, getSectionEntryHref, railLinksFor, shellRendersAccountMenu, TODAY_HREF } =
  await import('./console-shell.ts')
type ShellSection = import('./console-shell.ts').ShellSection

const allGatesOpen: ProjectSurfaceGates = {
  'experiment-governance': true,
  'flag-console': true,
  'flag-serving': true,
  'journey-projections': true,
  signals: true,
}

// What a Vercel PREVIEW actually serves (epic README, A2): four gates are Production-scoped, so a
// preview closes them all. This is not a hypothetical combination — it is the one every branch
// deployment of this epic will render under, and the reason Ship must not appear there.
const previewGates: ProjectSurfaceGates = {
  'experiment-governance': false,
  'flag-console': true,
  'flag-serving': false,
  'journey-projections': false,
  signals: false,
}

const owner = [{ slug: 'miyagisanchez', role: 'owner' }]

function header(section: ShellSection, gates = allGatesOpen, projects = owner, slug = 'miyagisanchez') {
  return buildConsoleHeader({
    activeSection: section,
    activeProjectSlug: slug,
    projects,
    gates,
  })
}

test('with every gate open an owner sees exactly the four sections, in order', () => {
  assert.deepEqual(
    header('home').tabs.map((tab) => tab.label),
    ['Today', 'Measure', 'Ship', 'Setup']
  )
})

test('each tab points at the first entitled surface of its section', () => {
  const tabs = header('home').tabs
  const href = (id: string) => tabs.find((tab) => tab.id === id)?.href
  assert.equal(href('today'), '/app')
  assert.equal(href('measure'), '/app/journeys/miyagisanchez')
  assert.equal(href('ship'), '/app/experiments/miyagisanchez')
  assert.equal(href('setup'), '/app/keys/miyagisanchez')
})

test('the active section is the only one marked current', () => {
  const current = (section: ShellSection) =>
    header(section)
      .tabs.filter((tab) => tab.current)
      .map((tab) => tab.id)

  assert.deepEqual(current('ship'), ['ship'])
  assert.deepEqual(current('setup'), ['setup'])
  assert.deepEqual(current('measure'), ['measure'])
  // `home` and `today` are one destination and must mark one tab — never zero (the header would
  // claim you are nowhere) and never two.
  assert.deepEqual(current('home'), ['today'])
  assert.deepEqual(current('today'), ['today'])
})

test('exactly one tab is current for every section a page can declare', () => {
  const sections: ShellSection[] = ['home', 'today', 'measure', 'ship', 'setup']
  for (const section of sections) {
    const marked = header(section).tabs.filter((tab) => tab.current)
    assert.equal(marked.length, 1, `${section} marked ${marked.length} tabs current`)
  }
})

// ── A tab that leads nowhere is worse than a missing tab ──────────────────────────────────────

test('on PREVIEW gates all four tabs still render, and Ship lands on Activity — not on Features', () => {
  // ⚠️ This is the assertion that stops a correct preview being reported as a bug (A2). The first
  // version of this test expected Ship to disappear on a preview; it does not, because `flag-audit`
  // rides `flag-console`, which IS set in the Preview scope while `flag-serving` and
  // `experiment-governance` are not. So Ship renders with exactly one surface behind it.
  //
  // Sprint 1's walkthrough used to promise "Environment picker, Features, Experiments and Activity"
  // on a preview. What a preview actually shows is Activity, alone — which is why the walkthrough's
  // gate-on steps moved to production.
  const { tabs } = header('home', previewGates)
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ['today', 'measure', 'ship', 'setup']
  )
  assert.equal(
    tabs.find((tab) => tab.id === 'ship')?.href,
    '/app/flag-audit/miyagisanchez',
    'Ship pointed somewhere a preview cannot serve'
  )
  assert.equal(
    tabs.find((tab) => tab.id === 'measure')?.href,
    '/app/scenarios/miyagisanchez',
    'Measure pointed at journeys, which a preview gates off'
  )
  // Stated as the property rather than the instance: no tab may exist without a destination.
  for (const tab of tabs) assert.ok(tab.href.length > 0, `${tab.id} rendered with no href`)
})

test('a section with ZERO entitled surfaces renders no tab at all', () => {
  // Ship's three surfaces ride three independent gates. Close all three and the tab must vanish
  // rather than render pointing at nothing — the property the preview case above cannot show,
  // because a preview happens to leave one of the three open.
  const { tabs } = header('home', { ...previewGates, 'flag-console': false })
  assert.equal(
    tabs.some((tab) => tab.id === 'ship'),
    false,
    'Ship rendered as a tab with no entitled surface behind it'
  )
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ['today', 'measure', 'setup']
  )
})

test('a member sees no Setup tab, because every Setup surface is owner-only', () => {
  const tabs = header('home', allGatesOpen, [{ slug: 'miyagisanchez', role: 'member' }]).tabs
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ['today', 'measure', 'ship']
  )
})

test('Today always renders, even when every gate is closed and the viewer owns nothing', () => {
  const closed: ProjectSurfaceGates = {
    'experiment-governance': false,
    'flag-console': false,
    'flag-serving': false,
    'journey-projections': false,
    signals: false,
  }
  const tabs = header('home', closed, [{ slug: 'miyagisanchez', role: 'member' }]).tabs
  // `scenarios` is `gate: 'always'` and member-readable, so Measure survives — which is the useful
  // part of this assertion: Today's presence is not an artefact of everything else surviving too.
  assert.ok(tabs.some((tab) => tab.id === 'today'))
  assert.equal(tabs.find((tab) => tab.id === 'today')?.href, TODAY_HREF)
})

// ── The switcher (D1) ──────────────────────────────────────────────────────────────────────────

test('the switcher lists every project the viewer belongs to, marking the active one', () => {
  const { projects } = header('ship', allGatesOpen, [
    { slug: 'miyagisanchez', role: 'owner' },
    { slug: 'acme', role: 'member' },
  ])
  assert.deepEqual(
    projects.map((project) => [project.slug, project.current]),
    [
      ['miyagisanchez', true],
      ['acme', false],
    ]
  )
})

test('switching project lands on the SAME section, resolved with THAT project’s role', () => {
  // The assertion that matters: the viewer is an OWNER of one project and a MEMBER of the other.
  // Reading Setup in the first, the switcher must not offer the second project's owner-only Setup
  // landing on the strength of a role held somewhere else. Roles are per project; gates are not.
  const { projects } = header('setup', allGatesOpen, [
    { slug: 'miyagisanchez', role: 'owner' },
    { slug: 'acme', role: 'member' },
  ])
  const href = (slug: string) => projects.find((project) => project.slug === slug)?.href

  assert.equal(href('miyagisanchez'), '/app/keys/miyagisanchez')
  // `acme` entitles NO Setup surface for a member, so the switch degrades to /app rather than
  // linking a member at a route that will 404 them.
  assert.equal(href('acme'), TODAY_HREF)
})

test('switching from a section both projects entitle keeps you in that section', () => {
  const { projects } = header('measure', allGatesOpen, [
    { slug: 'miyagisanchez', role: 'owner' },
    { slug: 'acme', role: 'member' },
  ])
  assert.equal(projects.find((project) => project.slug === 'acme')?.href, '/app/journeys/acme')
})

test('from Today, every project switches to Today', () => {
  const { projects } = header('home', allGatesOpen, [
    { slug: 'miyagisanchez', role: 'owner' },
    { slug: 'acme', role: 'member' },
  ])
  for (const project of projects) assert.equal(project.href, TODAY_HREF)
})

// ── The seam itself ────────────────────────────────────────────────────────────────────────────

test('getSectionEntryHref returns null rather than an empty string for an unentitled section', () => {
  const memberLinks = getProjectSurfaceLinks({
    projectSlug: 'acme',
    role: 'member',
    gates: allGatesOpen,
  })
  // `null` and `''` are different answers and the caller branches on it. An empty string would be
  // rendered as `href=""`, which navigates to the current page — a tab that silently does nothing.
  assert.equal(getSectionEntryHref(memberLinks, 'setup'), null)
  assert.equal(getSectionEntryHref(memberLinks, 'measure'), '/app/journeys/acme')
})

test('a slug the viewer is not a member of yields no tabs beyond Today', () => {
  // Defence in depth, not the tenancy boundary itself — `lib/shell-nav.ts` already refuses to
  // resolve a foreign slug. This asserts that if one ever reached here, the header would not
  // fabricate another tenant's sections from the viewer's own role.
  const { tabs } = header('home', allGatesOpen, owner, 'someone-elses-project')
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ['today']
  )
})

// ── Story 1.4: which surfaces the rail renders ────────────────────────────────────────────────

const ownerLinks = getProjectSurfaceLinks({
  projectSlug: 'miyagisanchez',
  role: 'owner',
  gates: allGatesOpen,
})

test('the rail lists the active section’s surfaces, in inventory order', () => {
  assert.deepEqual(
    railLinksFor('setup', ownerLinks).map((link) => link.routeSegment),
    ['keys', 'flag-credentials', 'destinations', 'shares', 'agent-keys']
  )
  assert.deepEqual(
    railLinksFor('ship', ownerLinks).map((link) => link.routeSegment),
    ['experiments', 'flags', 'flag-audit']
  )
})

test('the rail’s first entry is where that section’s tab points', () => {
  // Not a coincidence worth leaving to chance: the tab lands you on the top of the list you are
  // about to read, so the two must be derived from the same order rather than agreeing by accident.
  for (const section of ['measure', 'ship', 'setup'] as const) {
    assert.equal(
      railLinksFor(section, ownerLinks)[0]?.href,
      getSectionEntryHref(ownerLinks, section),
      `${section}'s tab and rail disagree about where the section starts`
    )
  }
})

test('Today and home have NO rail — the page renders full width', () => {
  // A11: Today IS /app. A rail listing the single surface classified under it would be a sidebar
  // containing one link, and Story 1.4 says Today renders full width.
  assert.deepEqual(railLinksFor('today', ownerLinks), [])
  assert.deepEqual(railLinksFor('home', ownerLinks), [])
})

test('a section with every surface gated off yields NO rail, not an empty one', () => {
  const links = getProjectSurfaceLinks({
    projectSlug: 'miyagisanchez',
    role: 'owner',
    gates: { ...previewGates, 'flag-console': false },
  })
  assert.deepEqual(railLinksFor('ship', links), [])
  // ...and the emptiness is specific: Measure still has scenarios, so this is not the links read
  // having failed altogether. `ConsoleRail` renders null on [], which is the "no empty rail" half.
  assert.ok(railLinksFor('measure', links).length > 0)
})

test('a member gets no Setup rail, matching the tab they do not get either', () => {
  const memberLinks = getProjectSurfaceLinks({
    projectSlug: 'miyagisanchez',
    role: 'member',
    gates: allGatesOpen,
  })
  assert.deepEqual(railLinksFor('setup', memberLinks), [])
  // The header and the rail must agree about what a member may reach. Two seams, one answer.
  assert.equal(
    header('setup', allGatesOpen, [{ slug: 'miyagisanchez', role: 'member' }]).tabs.some(
      (tab) => tab.id === 'setup'
    ),
    false
  )
})

// ── The account menu, and the reason this predicate exists at all ─────────────────────────────
//
// `/app` drops its own "Signed in as … [Sign out]" line exactly when the shell rendered an account
// menu. That used to be two DIFFERENT questions — the page asked `isConsoleShellEnabled()`, the
// shell asked `header && userEmail` — and a signed-in user with no project answered them opposite
// ways: gate on (page suppresses its line), header null (shell falls back to the legacy chrome,
// which has no account menu). The result was a page with NO sign-out control at all, reachable via
// `/app?provision=failed`. Found by the fresh HIGH-tier reviewer on PR #122.
//
// These assert the predicate itself. The WIRING — that both call sites ask it — is not reachable
// from the unit layer, and the authed fixture always provisions a project, so it cannot reach the
// zero-project case either. Stated in the PR rather than implied.

test('the shell renders an account menu only when the console is on AND there is an email', () => {
  assert.equal(shellRendersAccountMenu({ consoleEnabled: true, userEmail: 'a@b.co' }), true)
  // Each half alone is not enough, and each really occurs: the gate is off by default, and a session
  // can carry no email.
  assert.equal(shellRendersAccountMenu({ consoleEnabled: true, userEmail: null }), false)
  assert.equal(shellRendersAccountMenu({ consoleEnabled: false, userEmail: 'a@b.co' }), false)
  assert.equal(shellRendersAccountMenu({ consoleEnabled: false, userEmail: null }), false)
})

// ── DELIBERATELY NOT TESTED HERE: "the predicate's inputs are argument-independent" ──────────
//
// A test claiming that property lived here for one commit and **could not fail** — it passed against
// `return true`. It computed a header per section, never passed it to the predicate, and asserted
// the same literal call five times. The fresh reviewer measured it rather than reading it.
//
// The property is real; the test was the wrong instrument. `shellRendersAccountMenu` takes
// `{ consoleEnabled: boolean; userEmail: string | null }` — a header cannot be handed to it, because
// the parameter type has no place to put one. **TypeScript is what closes this class**, exactly as
// the comment 240 lines above refuses a runtime test of the closed `ConsoleSection` union for the
// same reason: asserting something the compiler already makes unrepresentable is the shape of guard
// that passes forever while proving nothing.
//
// What IS tested below is the predicate's truth table, which the compiler does NOT give for free.

test('a signed-in user with NO projects still gets a header, holding Today alone', () => {
  // This is the shape `getShellNav` now returns for a zero-project session, and it is what makes the
  // account menu reachable for them. Today must be there — it is the only place they can go — and
  // nothing else must be, because they are entitled to nothing.
  const header = buildConsoleHeader({
    activeSection: 'home',
    activeProjectSlug: '',
    projects: [],
    gates: allGatesOpen,
  })
  assert.deepEqual(
    header.tabs.map((tab) => tab.id),
    ['today']
  )
  assert.deepEqual(header.projects, [])
  assert.equal(shellRendersAccountMenu({ consoleEnabled: true, userEmail: 'a@b.co' }), true)
})
