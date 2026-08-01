import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getUserProjects } from '@/lib/membership'
import {
  isExperimentGovernanceEnabled,
  isFlagServingEnabled,
  isJourneyProjectionsEnabled,
  isSignalsEnabled,
  isSignupEnabled,
} from '@/lib/flags'
import { getProjectSurfaceLinks } from '@/lib/project-route-inventory'
import { SignOutButton } from './sign-out-button'
import { ProductShell } from '@/components/product/ProductShell'

// multi-tenant-activation · Sprint 1, Story 1.1 — the authed shell. Unauthed → /login; a signed-in
// member sees EXACTLY their own projects (getUserProjects is a service-role read of the
// membership join table — never derived from the URL). This is the front door the dashboards
// (Story 1.2) now live behind.
export const dynamic = 'force-dynamic'

// The funnel/impact dashboards are addressed per FEATURE key, and which features a project has
// registered isn't known here (that's the registry's business, not the shell's) — so the links
// carry a placeholder the user edits. A real feature picker is dashboard work beyond this sprint.
const DEFAULT_FEATURE_HINT = 'your-feature-key'

export default async function AppHome({ searchParams }: { searchParams: Promise<{ provision?: string }> }) {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const projects = await getUserProjects(user.id)

  // multi-tenant-activation · Sprint 2 — the provisioning RETRY trigger.
  //
  // /app is the one surface EVERY authenticated route funnels through, whichever way the user
  // signed in, which makes it the right place to NOTICE a missing tenant. The provisioning itself
  // happens in app/app/provision/route.ts — a Route Handler, because only a Route Handler can set
  // the one-time key cookie, and doing it inline here would force a degraded "no first key, no
  // starter feature" variant (see that file's header for the full rationale).
  //
  // `?provision=failed` breaks the loop: after a failed attempt we render the honest empty state
  // below instead of bouncing back and retrying forever.
  const { provision } = await searchParams
  if (projects.length === 0 && isSignupEnabled() && provision !== 'failed') {
    redirect('/app/provision')
  }

  return (
    <ProductShell>
      <main>
        <header>
          <h1>Your projects</h1>
          <p>
            Signed in as {user.email} · <SignOutButton />
          </p>
        </header>

        {projects.length === 0 ? (
          <p>
            You&apos;re not a member of any project yet. Ask an owner to add you, or (once self-serve signup
            is live) create one.
          </p>
        ) : (
          <ul>
            {projects.map((project) => {
              const links = getProjectSurfaceLinks({
                projectSlug: project.slug,
                role: project.role,
                featureHint: DEFAULT_FEATURE_HINT,
                gates: {
                  'experiment-governance': isExperimentGovernanceEnabled(),
                  'flag-serving': isFlagServingEnabled(),
                  'journey-projections': isJourneyProjectionsEnabled(),
                  signals: isSignalsEnabled(),
                },
              })

              return (
                <li key={project.id}>
                  <strong>{project.slug}</strong> <small>({project.role})</small>
                  <ul>
                    {links.map((link) => (
                      <li key={link.routeSegment}>
                        <a href={link.href}>{link.label}</a> <small>— {link.description}</small>
                      </li>
                    ))}
                  </ul>
                </li>
              )
            })}
          </ul>
        )}
      </main>
    </ProductShell>
  )
}
