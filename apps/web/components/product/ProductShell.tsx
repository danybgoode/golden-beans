import 'server-only'
import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'
import { getShellNav } from '@/lib/shell-nav'
import { railLinksFor, shellRendersAccountMenu, TODAY_HREF, type ShellSection } from '@/lib/console-shell'
import { SignOutButton } from './SignOutButton'
import { AgentRail } from './AgentRail'
import { ConsoleRail } from './ConsoleRail'
import { CommandPalette } from './CommandPalette'
import { ShellErrorBoundary } from './ShellErrorBoundary'

/**
 * Product chrome is rendered inside each page after its auth/flag guard resolves.
 *
 * This must not become an App Router layout: Next may stream a parent layout before a child calls
 * `notFound()`, turning the required dark-route 404 into a 200 with not-found content. Keeping the
 * shell below the guard makes the HTTP status and the visual rail agree.
 *
 * app-shell-and-agent-rail · Sprint 1, Story 1.3 — the section nav.
 * console-ia-overhaul · Sprint 1, Story 1.3 — the four-destination header, behind
 * `CONSOLE_SHELL_ENABLED`.
 *
 * `projectSlug` is the page's own project, passed so the sections point at the project you are
 * actually looking at. It is a HINT, not an authorization input: lib/shell-nav.ts matches it
 * against the membership list it reads server-side and ignores anything that does not match, so a
 * slug in a URL can never make this render another tenant's sections.
 *
 * ── `section` is REQUIRED, and that is the point (epic README, A8) ────────────────────────────
 * Next.js gives a Server Component no pathname, and the alternative — a client island calling
 * `usePathname()` — is the one thing this file's comments forbid twice: the shell wraps every
 * signed-in route including error and gated states, so a client island here would be the single
 * component able to break all of them at once.
 *
 * So each page declares where it lives. Making the prop required rather than optional turns "every
 * page belongs to a section" into a compile error at all 26 render sites (18 files) instead of a convention that
 * decays the first time someone adds a route. `home` is `/app` itself, and it has to be said out
 * loud rather than achieved by leaving the prop off.
 *
 * Deliberately NOT gated by AGENT_RAIL_ENABLED (app-shell-and-agent-rail README, D6). A rail can be
 * born off and flipped on; navigation that vanishes with a flag is a worse failure than no flag.
 */
export async function ProductShell({
  children,
  projectSlug,
  section,
}: {
  children: React.ReactNode
  projectSlug?: string
  section: ShellSection
}) {
  const { activeProject, projects, links, header, userEmail } = await getShellNav(projectSlug, section)

  return (
    <div className="product-shell">
      <header className="product-shell__header">
        {/*
          ── D4: the gate-off branch below is UNTOUCHED, and that is auditable ───────────────────
          `header === null` means the console chrome does not apply to this render — the gate is
          unset, OR there is no session (the two demo dashboards render this shell anonymously), OR
          `getShellNav` degraded. All three want the same public/legacy chrome. It is ONE field, and
          the account menu below reads the same one, so the chrome and the menu cannot disagree about
          whether this is a console render. With the gate unset this
          renders exactly the markup it rendered before this epic — logo, Home, Sections, Connect,
          Agent notes, and the project signal. Not "equivalent"; the same JSX, moved into a branch.
          `git diff` is what checks that, which is strictly stronger than a spec: /app is
          credential-gated, so the `api` Playwright project only ever sees the login redirect and
          could not tell the two branches apart. flags-console-parity Sprint 1 corrected exactly
          this mistake, and its QA note is worth re-reading before adding a spec that cannot fail.

          ⚠️ Story 3.5 deletes `Home` and the `<details>` disclosure from this branch, and NOTHING
          else. `Connect` and `Agent notes` are PERMANENT: this branch is what an anonymous visitor
          to the two demo dashboards gets (they have no session, so no console header), and it is
          their only route to `/install` and `/llms.txt`. `Home` is safe only because its destination
          is duplicated — the logo above links `/app` in both branches — so it loses a link, not a
          route. Pinned by `e2e/console-shell-public.browser.spec.ts`, which asserts both hrefs.
          See A16 in the epic README.

          ── One honest qualification, because "unchanged" was too strong ──────────────────────
          This BRANCH is byte-identical. The DATA it renders is not: Story 1.2 removes `funnel` and
          `impact` from the inventory unconditionally (D3), so with the gate off the Sections
          disclosure lists eleven surfaces where it listed thirteen. That is the intended change —
          both were nav entries whose own description told you to edit the URL — but `git diff` on
          this file cannot show it, and the guarantee was being stated absolutely. Neither dashboard
          loses its only entry: `CommandCenter` still links both with a real feature key. Raised by
          the fresh reviewer on PR #122.
        */}
        {header === null ? (
          <>
            <BrandLockup compact href="/app" />
            <nav aria-label="Product" className="product-shell__nav">
              <a href="/app" className="product-shell__nav-home">
                <Icon name="panels" />
                Home
              </a>

              {/*
                A `<details>` disclosure, not a JS menu. The shell renders on every signed-in route
                including error and gated states, and a client island here would be the one component
                able to break all of them at once. Native disclosure also works before hydration.

                One element serves both widths — a pull-up sheet above the bottom tab bar on a phone, a
                dropdown under the header from 640px up. It is NOT expanded inline on desktop because
                revealing a closed <details>' content with CSS is not reliable across engines, and the
                alternative (rendering the list twice and hiding one copy per width) would read every
                section name twice to a screen reader.

                Each entry carries the inventory's own one-line description. Reaching a surface was
                half the audit's complaint; relating them to each other was the other half.
              */}
              {activeProject && links.length > 0 && (
                <details className="product-shell__sections">
                  <summary>
                    <Icon name="map-pin" />
                    Sections
                  </summary>
                  <div className="product-shell__sections-panel">
                    <ul>
                      {links.map((link) => (
                        <li key={link.routeSegment}>
                          <a href={link.href} data-surface-status={link.status}>
                            {link.label}
                            <small>{link.description}</small>
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                </details>
              )}

              <a href="/install">
                <Icon name="cable" />
                Connect
              </a>
              <a href="/llms.txt">
                <Icon name="book" />
                Agent notes
              </a>
            </nav>

            {/*
              Which project these sections belong to. When the user has more than one, the label links
              to /app rather than opening a switcher menu: a real switcher has to know the CURRENT
              surface to move you to the same page in another project, and this component is
              deliberately not told the route segment. A menu that silently dropped you on a different
              page than the one you were reading would be a worse answer than the one honest link.
            */}
            {activeProject ? (
              <span className="product-shell__signal" data-project={activeProject.slug}>
                <Icon name="gauge" />
                {projects.length > 1 ? (
                  <a href="/app">
                    {activeProject.slug} · {projects.length - 1} more
                  </a>
                ) : (
                  activeProject.slug
                )}
              </span>
            ) : (
              <span className="product-shell__signal">
                <Icon name="gauge" />
                Engine ready
              </span>
            )}
          </>
        ) : (
          <>
            {/* The logo goes to Today, which IS /app — see lib/console-shell.ts' TODAY_HREF note on
                why that resolves Story 1.3's "logo links to Today" against Story 1.4's "Today has no
                rail". One destination, named twice. */}
            <BrandLockup compact href={TODAY_HREF} />

            {/* Four destinations, generated from the inventory's `section` field (D2). A hardcoded
                list here is what lib/shell-nav.ts' own D1 comment forbids, and CONSOLE_SECTIONS is
                the single ordered list both this and the rail read.

                A section with no entitled surface is ABSENT rather than disabled: on a Vercel
                preview three of Ship's gates are closed (A2), and a tab that 404s is worse than a
                tab that is not there. */}
            <nav aria-label="Sections" className="product-shell__nav product-shell__tabs">
              {header.tabs.map((tab) => (
                <a
                  key={tab.id}
                  href={tab.href}
                  className="product-shell__tab"
                  // `aria-current="page"` rather than a class alone: the mark has to reach a screen
                  // reader, not just the pixels. Absent (not "false") when it is not the current
                  // one — `aria-current="false"` is a value some readers announce.
                  aria-current={tab.current ? 'page' : undefined}
                >
                  {tab.label}
                </a>
              ))}
            </nav>

            <div className="product-shell__identity">
              {/* The project switcher (D1). ONE tier — Golden Beans has no organisation layer, and
                  the production schema has no table that could support one. A `<details>` again, for
                  the same reason as the legacy disclosure: no client island in the shell.

                  With one project there is nothing to switch to, so it renders as a label rather
                  than a menu that opens onto a list of one. */}
              {activeProject &&
                (projects.length > 1 ? (
                  <details className="product-shell__switcher">
                    <summary>
                      <Icon name="gauge" />
                      {activeProject.slug}
                    </summary>
                    <div className="product-shell__menu">
                      <ul>
                        {header.projects.map((project) => (
                          <li key={project.slug}>
                            <a href={project.href} aria-current={project.current ? 'true' : undefined}>
                              {project.slug}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                ) : (
                  <span className="product-shell__signal" data-project={activeProject.slug}>
                    <Icon name="gauge" />
                    {activeProject.slug}
                  </span>
                ))}

              {/* The account menu carries the sign-out that used to sit in /app's own header.
                  `/app` drops its own copy exactly when THIS renders — both sides ask
                  `shellRendersAccountMenu`, so the control appears once and can never appear zero
                  times. It previously branched on the env var on one side and on `userEmail` here,
                  which is two conditions that were supposed to agree and did not: a signed-in user
                  with no project got the legacy header AND a suppressed page line, and therefore no
                  sign-out anywhere (fresh reviewer, PR #122). */}
              {shellRendersAccountMenu({ header, userEmail }) && (
                <details className="product-shell__account">
                  <summary>
                    <Icon name="panels" />
                    Account
                  </summary>
                  <div className="product-shell__menu">
                    <p>{userEmail}</p>
                    <SignOutButton />
                  </div>
                </details>
              )}
            </div>
          </>
        )}
      </header>
      <div className="product-shell__body">
        {/*
          Story 1.4 — the per-section rail. FIRST in the DOM, unlike the agent rail below: this is
          navigation for the page you are on, so a screen reader and a keyboard user should meet it
          before the content, in the same order a sighted reader meets it on the left.

          `railLinksFor` returns [] for Today (which IS /app — A11) and for a section whose every
          surface is gated off, and `ConsoleRail` renders null on an empty list. So "Today renders
          full width" and "no empty rail" are one branch, decided in the pure module.
        */}
        {header !== null && <ConsoleRail links={railLinksFor(section, links)} />}
        {/*
          Story 1.5 — ⌘K, the ONE client island in the shell, inside the ONE error boundary in
          apps/web (A9). If it throws, the boundary renders null and the page it sits on is
          untouched. Without the boundary the nearest one is Next's own error page, which would mean
          a bad keystroke replacing every signed-in route in the product with an error screen.

          Seeded from the links getShellNav already resolved — a second VIEW of that list, never a
          second read, which is also what makes it safe for a client component to hold: it inherits
          the server's entitlement filtering rather than re-implementing it.
        */}
        {header !== null && (
          <ShellErrorBoundary>
            <CommandPalette links={links} />
          </ShellErrorBoundary>
        )}
        {children}
        {/*
          Sprint 2, Story 2.2 — the rail is here, in the shell, so it is present on EVERY /app
          route rather than on whichever pages someone remembered to add it to. It renders nothing
          at all unless AGENT_RAIL_ENABLED is exactly 'true' AND a membership was resolved; see
          lib/agent-rail-visibility.ts for why both conditions are spelled out in one place.

          It sits after {children} in the DOM on purpose: a screen reader and a keyboard user reach
          the page's own content first, and the rail is positioned into the sidebar by CSS.
        */}
        {activeProject && <AgentRail projectId={activeProject.id} projectSlug={activeProject.slug} />}
      </div>
    </div>
  )
}
