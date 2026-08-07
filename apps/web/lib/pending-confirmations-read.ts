import type { SupabaseClient } from '@supabase/supabase-js'

// app-shell-and-agent-rail · Sprint 1, Story 1.2 — the staged-proposal read.
//
// signals-loop Sprint 3 shipped `task_write_confirmations`: an agent PROPOSES a task write, gets
// back a preview and a single-use token, and nothing happens until a second call spends it. Until
// now the only way to know a proposal was waiting was to read the database. This is the read that
// lets a screen answer "what is your agent waiting on you for?".
//
// Split from lib/pending-confirmations.ts (which is `server-only`) for the same reason
// lib/agent-activity-read.ts is split: the tenancy property is the whole point, and a spec cannot
// import a `server-only` module to exercise it.
//
// ── What this module must NEVER do ────────────────────────────────────────────────────────────
// It must not call `consume_write_confirmation`. Spending a confirmation is the AGENT's path — the
// second half of propose → confirm → apply. A dashboard that could spend one would collapse the two
// deliberate decisions the staging table exists to separate, and would do it under a session cookie
// rather than under the agent credential the token is bound to. This module issues one SELECT.
//
// ── D8: task-scoped, because that is all the table models ─────────────────────────────────────
// `task_write_confirmations.task_id` is `NOT NULL REFERENCES tasks(id)`. There is no staged row for
// a flag activation or a scenario launch today. Callers must say what this covers rather than
// implying it shows every pending agent action. Generalising the mechanic is P2, not this bet.

export type PendingConfirmationAction = 'claim' | 'resolve' | 'dismiss'

export type PendingConfirmation = {
  id: string
  taskId: string
  action: PendingConfirmationAction
  /**
   * The parameters FROZEN at propose time, read straight from the row — never re-derived. The whole
   * design of the staging table rests on the preview an agent was shown and the mutation that would
   * run being built from the same columns; a read that recomputed them would show a reviewer
   * something other than what is actually staged.
   */
  actor: string | null
  resolution: string | null
  evidencePointer: string | null
  /**
   * Which agent write credential proposed it. NOT NULL at the database since migration
   * 20260806140000 — a confirmation is a capability minted FOR a credential, and
   * `consume_write_confirmation` binds spending to it, so a row without one could be spent by a
   * caller presenting none. Typed non-nullable here so the UI cannot grow a "proposed by nobody"
   * branch for a state the schema no longer permits.
   */
  agentKeyId: string
  proposedAt: string
  expiresAt: string
}

const CONFIRMATION_ACTIONS: readonly PendingConfirmationAction[] = ['claim', 'resolve', 'dismiss']

/** The most proposals a rail will render. Beyond this the answer is "go to the tasks page". */
export const PENDING_CONFIRMATIONS_MAX_LIMIT = 50

type ConfirmationRow = {
  id: unknown
  task_id: unknown
  action: unknown
  actor: unknown
  resolution: unknown
  evidence_pointer: unknown
  agent_key_id: unknown
  created_at: unknown
  expires_at: unknown
}

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value : null
}

/**
 * Unspent, unexpired staged proposals for ONE project, oldest first.
 *
 * Oldest first is deliberate and the opposite of the activity rail's order: this is a QUEUE of
 * things waiting on a human, and the one that has been waiting longest is the one most likely to
 * expire unanswered. The activity rail is a glance backwards; this is a glance at what is stuck.
 *
 * Returns `null` — never `[]` — when the read fails. "We could not look" and "your agent is not
 * waiting on you" are opposite messages and must not render identically (CODE-QUALITY rule 8).
 *
 * Tenancy: `projectId` is REQUIRED and filters every row. A confirmation minted under project A is
 * absent from project B's read — which is also enforced one layer down, since
 * `consume_write_confirmation` requires the applying credential to resolve to the same project.
 */
export async function readPendingConfirmations(
  db: SupabaseClient,
  projectId: string,
  options: { now?: Date; limit?: number } = {}
): Promise<PendingConfirmation[] | null> {
  if (!projectId) return null

  const now = options.now ?? new Date()
  const limit = Math.min(Math.max(options.limit ?? 20, 1), PENDING_CONFIRMATIONS_MAX_LIMIT)

  const { data, error } = await db
    .from('task_write_confirmations')
    .select('id, task_id, action, actor, resolution, evidence_pointer, agent_key_id, created_at, expires_at')
    .eq('project_id', projectId)
    // Unspent. `consumed_at` is NULL until `consume_write_confirmation` sets it exactly once — the
    // row IS the single-use ledger, so "is it still pending?" is this one predicate.
    .is('consumed_at', null)
    // Unexpired. Expired rows are deliberately NOT deleted (the migration revokes DELETE from
    // service_role): they are evidence of proposals nobody answered. They just are not pending.
    .gt('expires_at', now.toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)

  if (error) {
    console.error('[pending-confirmations] query failed:', error)
    return null
  }

  return (data ?? []).flatMap((row: ConfirmationRow) => {
    // The column has a CHECK constraint, so this can only fire if the constraint is widened without
    // this reader being updated. Dropping the row is the honest answer: a proposal whose action we
    // cannot name is one we cannot ask a human to approve.
    if (!CONFIRMATION_ACTIONS.includes(row.action as PendingConfirmationAction)) return []
    return [
      {
        id: String(row.id),
        taskId: String(row.task_id),
        action: row.action as PendingConfirmationAction,
        actor: text(row.actor),
        resolution: text(row.resolution),
        evidencePointer: text(row.evidence_pointer),
        agentKeyId: String(row.agent_key_id),
        proposedAt: new Date(String(row.created_at)).toISOString(),
        expiresAt: new Date(String(row.expires_at)).toISOString(),
      },
    ]
  })
}
