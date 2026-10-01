import type { SupabaseClient } from '@supabase/supabase-js'
import { intersectWorkspaceProjects, type WorkspaceProject } from './workspace-access'

// workspaces · Sprint 2, Story 2.1 (the Architecture lock, D6) — the reads behind lib/workspace.ts.
//
// The client is a PARAMETER and this module carries no `server-only`, for the same reason as lib/workspace-tenancy.ts:
// e2e/workspace-boundary.spec.ts drives the real queries against the real local database. App code never imports
// this file — it imports lib/workspace.ts, which binds the service-role client and React's per-request cache.

export type UserWorkspace = { id: string; name: string; role: string }

/**
 * The ids of every workspace `userId` belongs to, or null when the read failed. Null is not "none": callers on an
 * authorization path deny on it, callers listing for display throw on it.
 */
export async function readViewerWorkspaceIds(
  db: SupabaseClient,
  userId: string
): Promise<Set<string> | null> {
  const { data, error } = await db.from('workspace_members').select('workspace_id').eq('user_id', userId)
  if (error) {
    console.error('[workspace] workspace membership read failed:', error)
    return null
  }
  return new Set((data ?? []).map((row) => row.workspace_id as string))
}

/**
 * Every workspace `userId` belongs to, with their role in it, sorted by name. For DISPLAY (`gf whoami`, the switcher's
 * group labels) — so it THROWS on a query failure rather than returning [], which would read as "you belong to no
 * workspace": an authorization answer for what is really an outage (the same rule as getUserProjects).
 */
export async function readUserWorkspaces(db: SupabaseClient, userId: string): Promise<UserWorkspace[]> {
  const { data, error } = await db
    .from('workspace_members')
    .select('role, workspaces(id, name)')
    .eq('user_id', userId)
  if (error) {
    console.error('[workspace] readUserWorkspaces failed:', error)
    throw new Error('Could not load your workspaces')
  }
  return (data ?? [])
    .flatMap((row) => {
      // A to-one embed, typed loosely without a generated Database type — the cast lib/membership.ts uses.
      const workspace = row.workspaces as unknown as { id: string; name: string } | null
      return workspace ? [{ id: workspace.id, name: workspace.name, role: String(row.role) }] : []
    })
    .sort((left, right) => left.name.localeCompare(right.name))
}

/**
 * The ONE legal multi-project read on a request path (AGENTS.md § The tenancy invariant): the projects of
 * `workspaceId` that `userId` is a member of, and nothing unless `userId` is a member of that workspace.
 *
 * Returns [] on ANY query error — it is an authorization read, and a denied list is safe where a partial one is not.
 * The decision itself is `intersectWorkspaceProjects`; the queries only narrow what it is handed.
 */
export async function readWorkspaceProjects(
  db: SupabaseClient,
  userId: string,
  workspaceId: string
): Promise<WorkspaceProject[]> {
  const viewerWorkspaceIds = await readViewerWorkspaceIds(db, userId)
  if (!viewerWorkspaceIds || !viewerWorkspaceIds.has(workspaceId)) return []

  const { data: memberships, error: membershipError } = await db
    .from('project_members')
    .select('project_id, role')
    .eq('user_id', userId)
  if (membershipError) {
    console.error('[workspace] project membership read failed:', membershipError)
    return []
  }
  const projectIds = (memberships ?? []).map((row) => row.project_id as string)
  if (projectIds.length === 0) return []

  const { data: projects, error: projectError } = await db
    .from('projects')
    .select('id, slug, workspace_id')
    .eq('workspace_id', workspaceId)
    .in('id', projectIds)
  if (projectError) {
    console.error('[workspace] workspace project read failed:', projectError)
    return []
  }

  return intersectWorkspaceProjects({
    workspaceId,
    viewerWorkspaceIds,
    projects: (projects ?? []).map((row) => ({
      id: row.id as string,
      slug: row.slug as string,
      workspaceId: row.workspace_id as string,
    })),
    memberships: (memberships ?? []).map((row) => ({
      projectId: row.project_id as string,
      role: String(row.role),
    })),
  })
}
