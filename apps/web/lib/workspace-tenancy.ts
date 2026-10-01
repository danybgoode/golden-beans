import type { SupabaseClient } from '@supabase/supabase-js'

// workspaces · Sprint 1, Story 1.3 (Roadmap/02-commercial/workspaces — lock D2, D3; sprint-1 build contract).
//
// Where a tenant is BORN. `provisionTenantForUser` claims the person's workspace before it inserts their first
// project, writes the project into it, and releases the claim on every path that fails.
//
// ── Why this is its own module, without `server-only` ─────────────────────────────────────────────────────────────
// It is a tenancy decision, and this repo asserts those directly rather than through a page (CODE-QUALITY #5). The
// caller passes the client in, so `e2e/workspaces.spec.ts` drives these functions against the real local database —
// including the failure path — which a `server-only` provisioning module cannot be loaded to do.

/** Must match the index name in 20261001100000_workspaces.sql exactly. Both sides name it; rename one, rename both. */
export const WORKSPACE_CREATOR_CONSTRAINT = 'workspaces_one_per_creator_idx'

const PG_UNIQUE_VIOLATION = '23505'
const PG_FOREIGN_KEY_VIOLATION = '23503'

export type WorkspaceClaim =
  { ok: true; workspaceId: string; created: boolean } | { ok: false; error: unknown }

/**
 * "<display name>'s products", else the email's local part. The SAME SHAPE as the backfill's name in SQL, not the same
 * function: the caller passes `displayNameFrom(user_metadata)`, which refuses invisible and bidi characters, whereas
 * the one-time backfill read raw metadata — checked by hand for the two people it named in production (fresh
 * reviewer, PR #220).
 */
export function workspaceNameFor(
  displayName: string | null | undefined,
  email: string | null | undefined
): string {
  const base = displayName?.trim() || email?.split('@')[0]?.trim() || 'My'
  return `${base.slice(0, 100)}'s products`
}

async function findOwnWorkspace(db: SupabaseClient, userId: string) {
  return db.from('workspaces').select('id').eq('created_by', userId).maybeSingle()
}

/**
 * The workspace `userId` created, creating it if there is none, with `userId` as its owner.
 *
 * `created` says whether THIS call inserted it — the only workspace `releaseWorkspace` may delete. A person who signs
 * up again (their project was removed, or a retry after a failed provision) reuses the one they already have.
 *
 * Fails closed: any read or write error is `ok: false`, never a guess. A provision that cannot tell whether a
 * workspace exists must not mint a second one.
 */
export async function claimWorkspace(
  db: SupabaseClient,
  userId: string,
  name: string
): Promise<WorkspaceClaim> {
  const existing = await findOwnWorkspace(db, userId)
  if (existing.error) return { ok: false, error: existing.error }

  let workspaceId = (existing.data?.id as string | undefined) ?? null
  let created = false

  if (!workspaceId) {
    const inserted = await db.from('workspaces').insert({ name, created_by: userId }).select('id').single()
    if (!inserted.error && inserted.data) {
      workspaceId = inserted.data.id as string
      created = true
    } else if (
      inserted.error?.code === PG_UNIQUE_VIOLATION &&
      `${inserted.error.message} ${inserted.error.details ?? ''}`.includes(WORKSPACE_CREATOR_CONSTRAINT)
    ) {
      // A concurrent confirmation callback won the race. Adopt ITS row — the one the violation proves exists.
      const winner = await findOwnWorkspace(db, userId)
      if (winner.error || !winner.data) return { ok: false, error: winner.error ?? inserted.error }
      workspaceId = winner.data.id as string
    } else {
      return { ok: false, error: inserted.error }
    }
  }

  // ignoreDuplicates is safe HERE: the conflict target is the (workspace_id, user_id) primary key, so a conflicting
  // row is by definition this same person in this same workspace — never somebody else's (the LEARNINGS rule on
  // "insert or ignore" against a credential column, checked).
  const membership = await db
    .from('workspace_members')
    .upsert(
      { workspace_id: workspaceId, user_id: userId, role: 'owner' },
      { onConflict: 'workspace_id,user_id', ignoreDuplicates: true }
    )
  if (membership.error) {
    const claim = { ok: true as const, workspaceId, created }
    await releaseWorkspace(db, claim)
    return { ok: false, error: membership.error }
  }

  return { ok: true, workspaceId, created }
}

/**
 * Undo a claim on a failed provision. Deletes the workspace ONLY when this call created it, so a person's existing
 * tenant is never removed by a retry that failed.
 *
 * `projects.workspace_id` is ON DELETE RESTRICT, so even a created workspace survives if a project landed in it
 * (a racing request adopted it): the delete is refused, and that refusal is the correct outcome, not an error to fix.
 * Returns the error it could not resolve, for the caller's log.
 */
export async function releaseWorkspace(
  db: SupabaseClient,
  claim: { workspaceId: string; created: boolean }
): Promise<unknown> {
  if (!claim.created) return null
  const { error } = await db.from('workspaces').delete().eq('id', claim.workspaceId)
  if (!error || error.code === PG_FOREIGN_KEY_VIOLATION) return null
  return error
}
