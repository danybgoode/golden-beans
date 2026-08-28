import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getUserProjects } from '@/lib/membership'
import {
  isConsoleShellEnabled,
  isExperimentGovernanceEnabled,
  isFlagConsoleEnabled,
  isFlagServingEnabled,
  isJourneyProjectionsEnabled,
  isSignalsEnabled,
  isSignupEnabled,
} from '@/lib/flags'
import { getProjectSurfaceLinks } from '@/lib/project-route-inventory'
import { getShellNav } from '@/lib/shell-nav'
import { shellRendersAccountMenu } from '@/lib/console-shell'
import { SignOutButton } from '@/components/product/SignOutButton'
import { ProductShell } from '@/components/product/ProductShell'
import { CommandCenter } from '@/components/product/CommandCenter'

// multi-tenant-activation · Sprint 1, Story 1.1 — the authed shell. Unauthed → /login; a signed-in
// member sees EXACTLY their own projects (getUserProjects is a service-role read of the
// membership join table — never derived from the URL).
//
// app-shell-and-agent-rail · Sprint 3, Story 3.3 — Command Center. This page used to render a bare
// <ul> of slugs with a nested <ul> of links: it answered "which URLs exist", which is not the
// question anyone signs in with. It now answers "did anything need me today" — headline figures,
// the funnel as a funnel, and what this project is deliberately NOT measuring.
export const dynamic = 'force-dynamic'

export default async function AppHome({ searchParams }: { searchParams: Promise<{ provision?: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const projects = await getUserProjects(user.id)

  // multi-tenant-activation · Sprint 2 — the provisioning RETRY trigger. LOAD-BEARING for signup
  // recovery and easy to delete by accident in a rewrite of this page (sprint-3.md says so
  // explicitly), so it stays exactly where it was: above any render, before Command Center runs a
  // single query.
  //
  // /app is the one surface EVERY authenticated route funnels through, whichever way the user
  // signed in, which makes it the right place to NOTICE a missing tenant. The provisioning itself
  // happens in app/app/provision/route.ts — a Route Handler, because only a Route Handler can set
  // the one-time key cookie.
  //
  // `?provision=failed` breaks the loop: after a failed attempt we render the honest empty state
  // below instead of bouncing back and retrying forever.
  // Resolved from the SAME seam the shell uses, so the page and its chrome cannot disagree about
  // whether an account menu was rendered. `getSessionUser` and `getUserProjects` are both React
  // `cache()`d per request, so this adds no query — only the pure header arithmetic.
  const shellNav = await getShellNav(undefined, 'home')

  const { provision } = await searchParams
  if (projects.length === 0 && isSignupEnabled() && provision !== 'failed') {
    redirect('/app/provision')
  }

  // Read once, per render, and pass down. The gates decide which SURFACES a member may reach; they
  // are not tenancy — that is `getUserProjects` above, and it is resolved from the session user.
  const consoleShell = isConsoleShellEnabled()
  const gates = {
    'experiment-governance': isExperimentGovernanceEnabled(),
    'flag-console': isFlagConsoleEnabled(),
    'flag-serving': isFlagServingEnabled(),
    'journey-projections': isJourneyProjectionsEnabled(),
    signals: isSignalsEnabled(),
    'console-shell': consoleShell,
    // A7: derived, never a second env var — the legacy credential routes are listed exactly while
    // `Setup › Keys` is not. Command Center reads the same inventory as the shell, so both surfaces
    // stop offering the old routes at the same instant.
    'legacy-keys': !consoleShell,
    // The conjunction — see lib/shell-nav.ts. Both callers must derive it the same way, which is
    // what the assertion in project-route-inventory.test.ts pins.
    'legacy-flag-credentials': !consoleShell && isFlagConsoleEnabled(),
  }

  return (
    <ProductShell section="home">
      <main>
        <header>
          {/* Names what the page IS. The slug lives on each project's own card, where it belongs —
              putting it in the h1 as well rendered a long tenant slug at clamp(30px, 7vw, 48px) and
              said the same thing twice. */}
          <h1>{projects.length === 0 ? 'Your projects' : 'Command center'}</h1>
          {/* console-ia-overhaul · Story 1.3 — this line renders exactly when the shell did NOT
              render an account menu, so sign-out is present once and never zero times.

              It used to test `!isConsoleShellEnabled()`, which is a DIFFERENT question: the shell
              also needs a resolved header and an email, and a signed-in user with no project (say,
              `/app?provision=failed`) has neither — so the gate being on suppressed this line while
              the shell fell back to the legacy header that has no account menu, leaving the page
              with no way to sign out at all. Found by the fresh reviewer on PR #122.

              Both sides now ask the same predicate rather than two conditions that are supposed to
              agree. With the gate off it is always false, so the old page is untouched (D4). */}
          {!shellRendersAccountMenu(shellNav) && (
            <p>
              Signed in as {user.email} · <SignOutButton />
            </p>
          )}
        </header>

        {projects.length === 0 ? (
          // The provisioning empty state, preserved verbatim. A brand-new user must not meet a wall
          // of zeroes (sprint-3.md, step 6) — Command Center renders per project, and with no
          // project there is nothing to render.
          <p>
            You&apos;re not a member of any project yet. Ask an owner to add you, or (once self-serve signup
            is live) create one.
          </p>
        ) : (
          projects.map((project) => (
            <CommandCenter
              key={project.id}
              project={project}
              links={getProjectSurfaceLinks({
                projectSlug: project.slug,
                role: project.role,
                gates,
              })}
            />
          ))
        )}
      </main>
    </ProductShell>
  )
}
