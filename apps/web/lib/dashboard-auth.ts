import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { DEMO_PROJECT_SLUG } from './public-demo'
import { getSessionUser } from './supabase-auth'
import { isProjectMember, getMemberProjectId } from './membership'

// multi-tenant-activation · Sprint 1, Story 1.2 — the one gate every dashboard page calls before
// reading a project's data. Kept in its own module (imports next/navigation) so lib/membership.ts
// stays a plain server-only DB module.
//
// Policy:
//   • the demo project renders ANONYMOUSLY — the public showcase, same allow-list carve-out that
//     /api/v1/public/* uses (lib/public-demo.ts). This is the ONLY project a stranger may read.
//   • every other slug requires a signed-in MEMBER: unauthed → /login; authed-but-not-a-member →
//     404 (notFound). 404 (not 403) so we never confirm a foreign project's existence, and never
//     leak its data — slug-guessing dies here.
export async function requireDashboardAccess(slug: string): Promise<void> {
  if (slug === DEMO_PROJECT_SLUG) return

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const member = await isProjectMember(user.id, slug)
  if (!member) notFound()
}

// Stricter gate for MANAGEMENT pages/actions (Story 1.3 — API keys): NO demo carve-out. Even the
// demo project's keys can only be managed by a signed-in member. Returns the acting user + the
// resolved project_id so mutations can scope to it. Unauthed → /login; non-member → 404.
export async function requireProjectMembership(
  slug: string,
): Promise<{ userId: string; projectId: string }> {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const projectId = await getMemberProjectId(user.id, slug)
  if (!projectId) notFound()

  return { userId: user.id, projectId }
}
