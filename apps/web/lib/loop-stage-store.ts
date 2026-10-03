import type { SupabaseClient } from '@supabase/supabase-js'
import type { LoopStage } from './loop-stage'

// portfolio-view · Sprint 1, Story 1.3 (the Architecture lock, D8, D11).
//
// The read and the write of one project's loop stage. The client is a PARAMETER and there is no `server-only`, for the
// reason `lib/workspace-projects.ts` gives: `e2e/portfolio-loop-stage.spec.ts` drives these exact functions against the
// real database. App code calls it only from the Server Action, AFTER `loopStageWriteDecision` said `ok` for the
// session user — this function authorizes nothing on its own.
//
// `projectId` is always ONE id the caller already resolved — from `getWorkspaceProjects()` for the read, from the
// membership check for the write — never a slug (CODE-QUALITY #10).

/**
 * One project's stored stage, raw. THROWS on a failed read: null means "not placed", and a database outage must not
 * render as that (D2) — the portfolio turns the throw into its "couldn't load" cell.
 */
export async function readLoopStage(db: SupabaseClient, projectId: string): Promise<string | null> {
  const { data, error } = await db.from('projects').select('loop_stage').eq('id', projectId).maybeSingle()
  if (error) {
    console.error('[loop-stage] read failed:', error)
    throw new Error('Could not read the loop stage')
  }
  return (data?.loop_stage as string | null | undefined) ?? null
}

/** Set (or clear, with null) one project's loop stage. Returns false when the write failed or matched no row. */
export async function writeLoopStage(
  db: SupabaseClient,
  projectId: string,
  stage: LoopStage | null
): Promise<boolean> {
  const { data, error } = await db
    .from('projects')
    .update({ loop_stage: stage })
    .eq('id', projectId)
    .select('id')
  if (error) {
    console.error('[loop-stage] write failed:', error)
    return false
  }
  return (data ?? []).length === 1
}
