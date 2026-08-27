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

const { buildConsoleHeader, getSectionEntryHref, TODAY_HREF } = await import('./console-shell.ts')
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
