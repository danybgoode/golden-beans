import type { SupabaseClient } from '@supabase/supabase-js'
import { parseLoopStage, type LoopStage } from './loop-stage'

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
 * One project's stored stage. THROWS on a failed read, and on a stored value that is not one of the three: null means
 * "not placed", and neither an outage nor an unreadable value may render as that (D2) — the portfolio turns the throw
 * into its "couldn't load" cell. The CHECK makes the second case unreachable through any write; this is the read
 * refusing to trust that it always will (cross-review, PR #234).
 */
export async function readLoopStage(db: SupabaseClient, projectId: string): Promise<LoopStage | null> {
  const { data, error } = await db.from('projects').select('loop_stage').eq('id', projectId).maybeSingle()
  if (error) {
    console.error('[loop-stage] read failed:', error)
    throw new Error('Could not read the loop stage')
  }
  const stored: unknown = data?.loop_stage ?? null
  if (stored === null) return null
  const stage = parseLoopStage(stored)
  if (stage === null) throw new Error('The stored loop stage is not one of consider, operate or exit')
  return stage
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
