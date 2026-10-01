import type { SupabaseClient } from '@supabase/supabase-js'

// workspaces · Sprint 2 (lock D11) — every project lives in exactly one workspace, and since migration B
// `projects.workspace_id` is NOT NULL. A spec that inserts a project directly owes it a tenant.
//
// One fresh workspace per call, with no creator and no members: the same shape as a project nobody has been granted
// yet. Granting someone the project (a `project_members` insert) places them inside the workspace through the
// database trigger `project_members_join_workspace`, so specs that seed membership need nothing more.

export async function specWorkspaceId(client: SupabaseClient, label = 'spec'): Promise<string> {
  const { data, error } = await client
    .from('workspaces')
    .insert({ name: `${label} fixtures` })
    .select('id')
    .single()
  if (error || !data)
    throw new Error(`specWorkspaceId: could not create a fixture workspace: ${error?.message}`)
  return data.id as string
}
