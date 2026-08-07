import 'server-only'
import { BrandLockup } from '@/components/brand/BrandLockup'
import { Icon } from '@/components/ui/Icon'
import { getShellNav } from '@/lib/shell-nav'
import { AgentRail } from './AgentRail'

/**
 * Product chrome is rendered inside each page after its auth/flag guard resolves.
 *
 * This must not become an App Router layout: Next may stream a parent layout before a child calls
 * `notFound()`, turning the required dark-route 404 into a 200 with not-found content. Keeping the
 * shell below the guard makes the HTTP status and the visual rail agree.
 *
 * app-shell-and-agent-rail · Sprint 1, Story 1.3 — the section nav.
 *
 * `projectSlug` is the page's own project, passed so the sections point at the project you are
 * actually looking at. It is a HINT, not an authorization input: lib/shell-nav.ts matches it
 * against the membership list it reads server-side and ignores anything that does not match, so a
 * slug in a URL can never make this render another tenant's sections.
 *
 * Deliberately NOT gated by AGENT_RAIL_ENABLED (epic README, D6). A rail can be born off and
 * flipped on; navigation that vanishes with a flag is a worse failure than no flag.
 */
export async function ProductShell({
  children,
  projectSlug,
}: {
  children: React.ReactNode
  projectSlug?: string
}) {
  const { activeProject, projects, links } = await getShellNav(projectSlug)

  return (
    <div className="product-shell">
      <header className="product-shell__header">
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
            dropdown under the header from 720px up. It is NOT expanded inline on desktop because
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
      </header>
      <div className="product-shell__body">
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
