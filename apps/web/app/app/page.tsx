import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getUserProjects } from '@/lib/membership'
import { isSignupEnabled } from '@/lib/flags'
import { provisionTenantForUser } from '@/lib/provisioning'
import { SignOutButton } from './sign-out-button'

// multi-tenant-activation · Sprint 1, Story 1.1 — the authed shell. Unauthed → /login; a signed-in
// member sees EXACTLY their own projects (getUserProjects is a service-role read of the
// membership join table — never derived from the URL). This is the front door the dashboards
// (Story 1.2) now live behind.
export const dynamic = 'force-dynamic'

// The funnel/impact dashboards are addressed per FEATURE key, and which features a project has
// registered isn't known here (that's the registry's business, not the shell's) — so the links
// carry a placeholder the user edits. A real feature picker is dashboard work beyond this sprint.
const DEFAULT_FEATURE_HINT = 'your-feature-key'

export default async function AppHome() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  let projects = await getUserProjects(user.id)

  // multi-tenant-activation · Sprint 2 — the provisioning RETRY, and the reason it lives here
  // rather than only in the auth callback.
  //
  // The callback provisions a tenant after the email round-trip. But `signInWithPassword`
  // (app/login/login-form.tsx) sets its cookies client-side and NEVER touches /auth/callback — so
  // an earlier "the next sign-in retries provisioning" was simply false: a user whose provisioning
  // hit a transient DB error at confirmation time would have been stranded permanently, with a
  // working account and no tenant, and no path back short of hand-seeded SQL (cross-review, Codex
  // 2026-07-20).
  //
  // /app is the one surface EVERY authenticated route funnels through, whichever way the user
  // signed in, which makes it the correct retry point. Gated on both the flag and an empty project
  // list, so it costs one already-made query for everyone else and cannot hand a tenant to a
  // hand-seeded member who legitimately has none yet while signup is dark.
  if (projects.length === 0 && isSignupEnabled()) {
    // canRevealKey: false — a Server Component cannot set the hand-off cookie, so no first key is
    // minted here. The user issues one from /app/keys, where it is shown properly at issue time.
    const result = await provisionTenantForUser(user.id, user.email ?? '', { canRevealKey: false })
    if (result.ok && result.created) {
      projects = await getUserProjects(user.id)
    } else if (!result.ok) {
      // Deliberately not fatal and deliberately not surfaced as an error: the page below renders
      // an honest "no projects yet" state, and the next visit retries. Failing the shell would
      // strand the user harder than the state we are trying to recover from.
      console.error('[app] provisioning retry failed:', result.error)
    }
  }

  return (
    <main>
      <header>
        <h1>Your projects</h1>
        <p>
          Signed in as {user.email} · <SignOutButton />
        </p>
      </header>

      {projects.length === 0 ? (
        <p>
          You&apos;re not a member of any project yet. Ask an owner to add you, or (once self-serve
          signup is live) create one.
        </p>
      ) : (
        <ul>
          {projects.map((project) => (
            <li key={project.id}>
              <strong>{project.slug}</strong> <small>({project.role})</small>
              <ul>
                {/* The dashboards are per-feature/per-experiment, so these link to the project's
                    entry points rather than a single page — a member shouldn't have to guess URLs
                    (cross-review round 2, Gemini/Agy 2026-07-20). */}
                <li>
                  <a href={`/app/funnel/${project.slug}/${DEFAULT_FEATURE_HINT}`}>Funnel</a>{' '}
                  <small>— swap the feature key in the URL</small>
                </li>
                <li>
                  <a href={`/app/impact/${project.slug}/${DEFAULT_FEATURE_HINT}`}>Impact</a>{' '}
                  <small>— swap the feature key in the URL</small>
                </li>
                {project.role === 'owner' && (
                  <li>
                    <a href={`/app/keys/${project.slug}`}>API keys</a>{' '}
                    <small>— issue, rotate, revoke</small>
                  </li>
                )}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
