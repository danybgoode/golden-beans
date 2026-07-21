import { redirect } from 'next/navigation'
import { getSessionUser } from '@/lib/supabase-auth'
import { getUserProjects } from '@/lib/membership'
import { SignOutButton } from './sign-out-button'

// multi-tenant-activation · Sprint 1, Story 1.1 — the authed shell. Unauthed → /login; a signed-in
// member sees EXACTLY their own projects (getUserProjects is a service-role read of the
// membership join table — never derived from the URL). This is the front door the dashboards
// (Story 1.2) now live behind.
export const dynamic = 'force-dynamic'

export default async function AppHome() {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const projects = await getUserProjects(user.id)

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
              {' — '}
              <a href={`/app/keys/${project.slug}`}>API keys</a>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
