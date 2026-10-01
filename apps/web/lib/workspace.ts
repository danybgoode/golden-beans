import 'server-only'
import { cache } from 'react'
import { getSupabaseServiceClient } from './supabase'
import { readUserWorkspaces, readWorkspaceProjects } from './workspace-projects'

export type { UserWorkspace } from './workspace-projects'
export type { WorkspaceProject } from './workspace-access'

// workspaces · Sprint 2, Story 2.1 (Roadmap/02-commercial/workspaces — the Architecture lock, D6).
//
// ⚠️ `getWorkspaceProjects` is the ONLY multi-project read a request path may make (AGENTS.md § The tenancy
// invariant). A feature that needs several projects at once — the portfolio view, the workspace-wide board — reads
// them here, and nowhere else. The semantic-lint rule `tenancy` watches for reads that go around it.
//
// `cache()` is per-REQUEST (React clears it between renders), the same reasoning as lib/membership.ts: it removes a
// duplicate query within one render and can never serve one viewer's answer to another.

/** Every workspace the viewer belongs to, with their role. Throws on a query failure (see readUserWorkspaces). */
export const getUserWorkspaces = cache((userId: string) =>
  readUserWorkspaces(getSupabaseServiceClient(), userId)
)

/**
 * The projects of `workspaceId` the viewer may read together: same workspace ∩ their project memberships, and nothing
 * unless they belong to the workspace. [] on a query error — it fails closed.
 */
export const getWorkspaceProjects = cache((userId: string, workspaceId: string) =>
  readWorkspaceProjects(getSupabaseServiceClient(), userId, workspaceId)
)
