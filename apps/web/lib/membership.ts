import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { Membership } from './roles'

export type { Membership } from './roles'
export { isOwner } from './roles'

// multi-tenant-activation · Sprint 1 — the authorization primitives (Stories 1.1 + 1.2).
//
// project_members is readable ONLY by the service-role client (RLS on, no policies), so these run
// server-side after the session user is resolved (lib/supabase-auth.ts). They never trust a
// caller-supplied slug alone — the (user, project) pair must actually exist in the join table.

export type MemberProject = { id: string; slug: string; role: string }

// Every project a user belongs to — backs the /app shell's project list. Throws on a query failure
// rather than returning [], which would render as "you're not a member of any project" and read as
// an authorization answer when it's really an outage (cross-review catch, Codex 2026-07-20).
export async function getUserProjects(userId: string): Promise<MemberProject[]> {
  const supabase = getSupabaseServiceClient()
  const { data, error } = await supabase
    .from('project_members')
    .select('role, projects(id, slug)')
    .eq('user_id', userId)
  if (error) {
    console.error('[membership] getUserProjects failed:', error)
    throw new Error('Could not load your projects')
  }
  return (data ?? []).flatMap((row) => {
    // supabase-js types a to-one embedded relation loosely without a generated Database type —
    // the same cast lib/connector-tokens.ts / lib/tars-query.ts already use.
    const project = row.projects as unknown as { id: string; slug: string } | null
    return project ? [{ id: project.id, slug: project.slug, role: String(row.role) }] : []
  })
}

// The core authorization lookup: the project_id `userId` may act on for `slug`, or null if they're
// not a member (or the slug is unknown). Resolved in two explicit steps (slug → project_id →
// membership) rather than an embedded-resource filter, for clarity and to avoid supabase-js
// join-filter fragility. Returns the id (not just a bool) so management flows can scope their
// mutations to it without a second lookup.
//
// DELIBERATE asymmetry with getUserProjects above: this one returns null (not throws) on a query
// error, because it is an AUTHORIZATION decision — it must FAIL CLOSED (deny access) rather than
// propagate. A denied request is safe; a thrown one that some caller catches into an allow is not.
export async function getMembership(userId: string, slug: string): Promise<Membership | null> {
  const supabase = getSupabaseServiceClient()
  const { data: project, error: projectError } = await supabase
    .from('projects')
    .select('id')
    .eq('slug', slug)
    .maybeSingle()
  if (projectError) {
    console.error('[membership] project lookup failed:', projectError)
    return null
  }
  if (!project) return null

  const { data: membership, error: membershipError } = await supabase
    .from('project_members')
    .select('role')
    .eq('user_id', userId)
    .eq('project_id', project.id)
    .maybeSingle()
  if (membershipError) {
    console.error('[membership] membership lookup failed:', membershipError)
    return null
  }
  if (!membership) return null
  return { projectId: project.id as string, role: String(membership.role) }
}

export async function getMemberProjectId(userId: string, slug: string): Promise<string | null> {
  return (await getMembership(userId, slug))?.projectId ?? null
}

// Boolean form the dashboards call (Story 1.2). A non-member, or an unknown slug, is false.
export async function isProjectMember(userId: string, slug: string): Promise<boolean> {
  return (await getMembership(userId, slug)) !== null
}
