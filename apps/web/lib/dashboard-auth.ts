import 'server-only'
import { redirect, notFound } from 'next/navigation'
import { assertPublicAllowedSlug } from './public-demo'
import { getSessionUser } from './supabase-auth'
import { getMembership } from './membership'
import { isOwner } from './roles'

// multi-tenant-activation · Sprint 1 — the authorization gates every /app surface calls before
// reading a project's data. Kept in its own module (imports next/navigation) so lib/membership.ts
// stays a plain server-only DB module.
//
// The demo carve-out reuses the CANONICAL allow-list seam, assertPublicAllowedSlug()
// (lib/public-demo.ts, AGENTS rule #2) rather than comparing to DEMO_PROJECT_SLUG itself — one
// policy, not two that can drift (cross-review round 2, Codex 2026-07-20).
function isPubliclyReadable(slug: string): boolean {
  return assertPublicAllowedSlug(slug).ok
}

// READ gate for the dashboards (Story 1.2):
//   • the demo project renders ANONYMOUSLY — the public showcase, same allow-list that gates
//     /api/v1/public/*. The ONLY project a stranger may read.
//   • every other slug requires a signed-in MEMBER: unauthed → /login; authed-but-not-a-member →
//     404 (never 403), so we don't confirm a foreign project's existence. Slug-guessing dies here.
export async function requireDashboardAccess(slug: string): Promise<void> {
  if (isPubliclyReadable(slug)) return

  const user = await getSessionUser()
  if (!user) redirect('/login')

  const membership = await getMembership(user.id, slug)
  if (!membership) notFound()
}

// MEMBER gate for management surfaces — NO demo carve-out: even the demo project's settings need a
// real member. Returns the acting user + resolved project so mutations can scope to it.
export async function requireProjectMembership(
  slug: string,
): Promise<{ userId: string; projectId: string; role: string }> {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const membership = await getMembership(user.id, slug)
  if (!membership) notFound()

  return { userId: user.id, projectId: membership.projectId, role: membership.role }
}

// OWNER gate for CREDENTIAL administration (Story 1.3 — issue/revoke API keys). Least privilege:
// an ordinary member can read dashboards but must not mint a full ingest credential or revoke the
// key production runs on (cross-review round 2, Codex 2026-07-20). A member who isn't an owner gets
// 404, consistent with every other "you may not see this" answer here.
export async function requireProjectOwnership(
  slug: string,
): Promise<{ userId: string; projectId: string; role: string }> {
  const user = await getSessionUser()
  if (!user) redirect('/login')

  const membership = await getMembership(user.id, slug)
  if (!membership || !isOwner(membership)) notFound()

  return { userId: user.id, projectId: membership.projectId, role: membership.role }
}
