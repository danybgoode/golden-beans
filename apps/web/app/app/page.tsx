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
import { SignOutButton } from './sign-out-button'
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
  const { provision } = await searchParams
  if (projects.length === 0 && isSignupEnabled() && provision !== 'failed') {
    redirect('/app/provision')
  }

  // Read once, per render, and pass down. The gates decide which SURFACES a member may reach; they
  // are not tenancy — that is `getUserProjects` above, and it is resolved from the session user.
  const gates = {
    'experiment-governance': isExperimentGovernanceEnabled(),
    'flag-console': isFlagConsoleEnabled(),
    'flag-serving': isFlagServingEnabled(),
    'journey-projections': isJourneyProjectionsEnabled(),
    signals: isSignalsEnabled(),
  }

  return (
    <ProductShell section="home">
      <main>
        <header>
          {/* Names what the page IS. The slug lives on each project's own card, where it belongs —
              putting it in the h1 as well rendered a long tenant slug at clamp(30px, 7vw, 48px) and
              said the same thing twice. */}
          <h1>{projects.length === 0 ? 'Your projects' : 'Command center'}</h1>
          {/* console-ia-overhaul · Story 1.3 — with the console shell on, the header carries an
              account menu holding this exact address and this exact button, so rendering it here as
              well would be the same control twice on one screen. With the gate off this line is
              untouched, which is what keeps the old page identical (D4). It is a MOVE, not a
              deletion: sign-out exists in exactly one place in either state, never zero. */}
          {!isConsoleShellEnabled() && (
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
