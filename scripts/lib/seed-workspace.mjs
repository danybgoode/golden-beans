// workspaces · Sprint 2 (lock D11) — the workspace a seeded project belongs to.
//
// `projects.workspace_id` is NOT NULL since migration B, and Postgres checks NOT NULL on an upsert's proposed row
// BEFORE the ON CONFLICT arbiter — so a seed script that upserts on `slug` must send a workspace even when the
// project already exists. It sends the project's OWN: a re-run never moves a project between tenants (a no-go of the
// epic). Only a project that does not exist yet gets a new workspace, with no creator and no members.

/** @returns {Promise<string>} the workspace id to send with this project's upsert */
export async function seededProjectWorkspace(db, slug, name) {
  const { data: existing, error } = await db
    .from('projects')
    .select('workspace_id')
    .eq('slug', slug)
    .maybeSingle();
  if (error) throw new Error(`Failed to look up ${slug}'s workspace: ${error.message}`);
  if (existing?.workspace_id) return existing.workspace_id;

  const { data: created, error: createError } = await db
    .from('workspaces')
    .insert({ name })
    .select('id')
    .single();
  if (createError || !created)
    throw new Error(`Failed to create a workspace for ${slug}: ${createError?.message}`);
  return created.id;
}
