// console-ia-overhaul · Sprint 1, Story 1.3. The header's arithmetic, asserted directly.
//
// Every surface this decides is credential-gated, so the `api` Playwright project can only ever
// observe a login redirect — identical with the console gate on or off. `flags-console-parity`
// Sprint 1 corrected exactly this mistake once already. The assertions that matter therefore live
// here, against the pure module, where a role and a gate combination can simply be handed in.

import assert from 'node:assert/strict'
import { test } from 'node:test'
import * as Module from 'node:module'
import {
  getProjectSurfaceLinks,
  getSectionLinks,
  type ProjectSurfaceGates,
} from './project-route-inventory.ts'

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
  // Console ON, so `legacy-keys` is its inverse (A7). These two are never independently true: the
  // merged Setup route and the three it replaces are never in the nav at the same time.
  'console-shell': true,
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
  // `CONSOLE_SHELL_ENABLED` is created disabled in every scope, preview included — so a preview
  // shows the LEGACY credential routes, which is what makes this fixture the real preview state.
  'console-shell': false,
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
  // ⚠️ `flags`, not `experiments` — design-system-rails Story 4.3. The approved Ship rail is
  // Features · Experiments · Scheduled changes · Activity, and the inventory had the first two the
  // other way round; the tab points at the section's FIRST entitled surface, so correcting the rail
  // order corrected where the tab lands. Features is also the right destination on its own terms:
  // it is the surface an operator opens Ship to reach.
  assert.equal(href('ship'), '/app/flags/miyagisanchez')
  // Sprint 2 (A7): Setup now opens onto `Connect your agent`, not API keys — the two new routes are
  // listed ahead of the legacy ones, and with the console gate open the legacy three are absent.
  assert.equal(href('setup'), '/app/setup/connect/miyagisanchez')
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

test('on PREVIEW gates all four tabs still render, and Ship lands on a surface a preview can serve', () => {
  // ⚠️ This is the assertion that stops a correct preview being reported as a bug (A2). The first
  // version of this test expected Ship to disappear on a preview; it does not, because `flag-audit`
  // rides `flag-console`, which IS set in the Preview scope while `flag-serving` and
  // `experiment-governance` are not. So Ship renders with exactly one surface behind it.
  //
  // Sprint 1's walkthrough used to promise "Environment picker, Features, Experiments and Activity"
  // on a preview. What a preview actually shows is the `flag-console` surfaces alone — which is why
  // the walkthrough's gate-on steps moved to production.
  //
  // ⚠️ **TWO surfaces now, not one, and the tab lands on the first — design-system-rails S4.3.**
  // `scheduled` also rides `flag-console`, so a preview shows Scheduled changes and Activity. The
  // test's own name says "Ship lands on Activity"; it lands on Scheduled changes, which is the
  // inventory order the approved rail asks for. Renaming the test rather than pinning the old
  // destination: the PROPERTY it exists for — a tab never points somewhere a preview cannot serve —
  // is unchanged and is what the assertion below still says.
  const { tabs } = header('home', previewGates)
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ['today', 'measure', 'ship', 'setup']
  )
  assert.equal(
    tabs.find((tab) => tab.id === 'ship')?.href,
    '/app/scheduled/miyagisanchez',
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
  // Ship's four surfaces ride three independent gates (`scheduled` shares `flag-console` with
  // `flag-audit`). Close all three and the tab must vanish
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

test('a member DOES see Setup now, because Connect your agent is member-readable', () => {
  // ⚠️ This test asserted the opposite until Sprint 2, and the change is a real product decision
  // rather than a fixture update. Every Setup surface used to be owner-only, so a member got no
  // Setup tab at all. `setup/connect` is member-readable — the connector URL is how a project's own
  // operators point an agent at their data, and reading it is not credential administration (minting
  // one is, and that action re-checks ownership).
  //
  // So a member now sees Setup, containing exactly the one surface they are entitled to.
  const links = getProjectSurfaceLinks({
    projectSlug: 'miyagisanchez',
    role: 'member',
    gates: allGatesOpen,
  })
  const tabs = header('home', allGatesOpen, [{ slug: 'miyagisanchez', role: 'member' }]).tabs
  assert.deepEqual(
    tabs.map((tab) => tab.id),
    ['today', 'measure', 'ship', 'setup']
  )
  assert.deepEqual(
    getSectionLinks(links, 'setup').map((link) => link.routeSegment),
    ['setup/connect'],
    'a member was offered a Setup surface they cannot open'
  )
})

test('Today always renders, even when every gate is closed and the viewer owns nothing', () => {
  const closed: ProjectSurfaceGates = {
    'experiment-governance': false,
    'flag-console': false,
    'flag-serving': false,
    'journey-projections': false,
    signals: false,
    'console-shell': false,
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

  assert.equal(href('miyagisanchez'), '/app/setup/connect/miyagisanchez')
  // `acme` DOES entitle a Setup surface for a member now (`setup/connect`), so the switch keeps you
  // in Setup — and lands on the member-readable one, never the owner-only `setup/keys`. That is the
  // assertion: the target's own role decides, not the role you hold in the project you came from.
  assert.equal(href('acme'), '/app/setup/connect/acme')
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
  // A member entitles no SHIP surface once flags/experiments/audit are gated off, which is the
  // unentitled case now that Setup has a member-readable member (Sprint 2).
  const noShip = getProjectSurfaceLinks({
    projectSlug: 'acme',
    role: 'member',
    gates: { ...allGatesOpen, 'experiment-governance': false, 'flag-serving': false, 'flag-console': false },
  })
  assert.equal(getSectionEntryHref(noShip, 'ship'), null)
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
    ['setup/connect', 'setup/keys', 'destinations', 'shares']
  )
  assert.deepEqual(
    railLinksFor('ship', ownerLinks).map((link) => link.routeSegment),
    // ⚠️ FOUR, in the approved rail's order: Features · Experiments · Scheduled changes · Activity
    // (design-system-rails S4.3). Two things changed together — `scheduled` is the item the product
    // had no route for, and `flags`/`experiments` were the wrong way round.
    ['flags', 'experiments', 'scheduled', 'flag-audit']
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

test('the rail and the tab agree about what a member may reach in Setup', () => {
  const memberLinks = getProjectSurfaceLinks({
    projectSlug: 'miyagisanchez',
    role: 'member',
    gates: allGatesOpen,
  })
  // One surface, not five: the member-readable connector page, and none of the credential ones.
  assert.deepEqual(
    railLinksFor('setup', memberLinks).map((link) => link.routeSegment),
    ['setup/connect']
  )
  // Two seams, one answer — the tab exists exactly when the rail has something to put under it.
  assert.equal(
    header('setup', allGatesOpen, [{ slug: 'miyagisanchez', role: 'member' }]).tabs.some(
      (tab) => tab.id === 'setup'
    ),
    true
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

test('the shell renders an account menu only when the console applies AND there is an email', () => {
  const header = buildConsoleHeader({
    activeSection: 'home',
    activeProjectSlug: 'miyagisanchez',
    projects: owner,
    gates: allGatesOpen,
  })
  assert.equal(shellRendersAccountMenu({ header, userEmail: 'a@b.co' }), true)
  // Each half alone is not enough, and each really occurs: `header` is null whenever the gate is
  // off, the viewer is anonymous, or the nav read failed; `userEmail` is null for a session without
  // one.
  assert.equal(shellRendersAccountMenu({ header, userEmail: null }), false)
  assert.equal(shellRendersAccountMenu({ header: null, userEmail: 'a@b.co' }), false)
  assert.equal(shellRendersAccountMenu({ header: null, userEmail: null }), false)
})

// ── DELIBERATELY NOT TESTED HERE: "the predicate's inputs are argument-independent" ──────────
//
// A test claiming that property lived here for one commit and **could not fail** — it passed against
// `return true`. It computed a header per section, never passed it to the predicate, and asserted
// the same literal call five times. The fresh reviewer measured it rather than reading it.
//
// The property is real; the test was the wrong instrument — and then the CORRECTION was wrong too,
// twice, which is the part worth writing down.
//
// Correction #1 said the predicate takes `{ consoleEnabled, userEmail }`, so "a header cannot be
// handed to it" and **TypeScript closes the class**. True when written, false one commit later: the
// SF-3 restructure collapsed the pair and the signature now takes `header`, so a header is exactly
// what is handed to it. The compile-time guarantee this note credited had stopped existing.
//
// Correction #2 (this text) was written, asserted against the wrong anchor, and SILENTLY DID NOT
// APPLY — the edit failed, the gate ran green, and the stale note shipped for another commit until
// the reviewer diffed the file and found it byte-identical. That is LEARNINGS' "an unasserted
// `replace()` is a no-op waiting to happen", except mine DID assert and I read the next green line
// instead of the failure.
//
// So, accurately: what closes this class is a RUNTIME invariant, held by hand at the three `header:`
// assignments in `getShellNav` (the zero-project, foreign-slug and normal returns), each of which
// reads `gateOpen ? <a header> : null`. The other two returns yield `EMPTY`, whose `header` is null
// structurally. Revert the foreign-slug branch to a bare `return EMPTY` and the predicate disagrees
// between two calls again — nothing prevents that, and certainly not the compiler.
//
// It is NOT unit-testable here: `shell-nav.ts` is `import 'server-only'`, so this layer cannot call
// `getShellNav` at all. A weaker guarantee than the note used to claim, stated as what it is.
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
  assert.equal(shellRendersAccountMenu({ header, userEmail: 'a@b.co' }), true)
})

test('with no projects the gates cannot affect the header — EVERY combination gives the same one', () => {
  // Pins what `shell-nav.ts`'s `emptyHeader` asserts in prose: on this path no gate is consulted, so
  // it passes an all-false record rather than reading the real ones. The claim was previously only a
  // comment (cross-review, Mistral Vibe → fresh reviewer N3), and a comment asserting a property is
  // a claim that earns the same proof as the code.
  //
  // Enumerated over ALL 32 gate combinations rather than two, because "gates cannot matter here" is a
  // statement about every one of them.
  const header = (gates: ProjectSurfaceGates) =>
    buildConsoleHeader({
      activeSection: 'home',
      activeProjectSlug: '',
      projects: [],
      gates,
    })
  const allFalse = header({
    'experiment-governance': false,
    'flag-console': false,
    'flag-serving': false,
    'journey-projections': false,
    signals: false,
    'console-shell': false,
  })
  // ANCHORED absolutely, not just relatively. Every comparison below is `header(x)` against
  // `header(allFalse)` — both sides from the same function — so deleting the unconditional Today
  // push in `buildConsoleHeader` would collapse both to `{tabs: [], projects: []}` and all 32
  // comparisons would still pass. The neighbouring test catches that, but this one should not depend
  // on its neighbour surviving (fresh reviewer, PR #122, sixth pass).
  assert.deepEqual(
    allFalse.tabs.map((tab) => tab.id),
    ['today']
  )

  // Derived from the type rather than retyped, so a new gate joins the enumeration automatically —
  // the same reason `singleFlagGates` in flags.test.ts is walked rather than listed. Sprint 2 added
  // two gates and this loop needed no edit beyond the count, which is the point.
  const keys = Object.keys(allGatesOpen) as (keyof ProjectSurfaceGates)[]
  const combinations = 2 ** keys.length
  for (let mask = 0; mask < combinations; mask += 1) {
    const gates = Object.fromEntries(
      keys.map((key, index) => [key, Boolean(mask & (1 << index))])
    ) as ProjectSurfaceGates
    assert.deepEqual(header(gates), allFalse, `gate combination ${mask} produced a different header`)
  }
})
