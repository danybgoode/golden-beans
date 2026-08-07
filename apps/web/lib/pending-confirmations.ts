import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { readPendingConfirmations, type PendingConfirmation } from './pending-confirmations-read'

// app-shell-and-agent-rail · Sprint 1, Story 1.2 — the seam the product imports.
//
// Read-only by construction: the only export is a SELECT. Spending a confirmation stays on the
// agent's path (lib/task-write-staging.ts → consume_write_confirmation) — see
// ./pending-confirmations-read.ts for why that separation is load-bearing rather than tidy.

export type { PendingConfirmation, PendingConfirmationAction } from './pending-confirmations-read'
export { PENDING_CONFIRMATIONS_MAX_LIMIT } from './pending-confirmations-read'

/**
 * Staged proposals waiting on a human for ONE project, oldest first, or `null` when unreadable.
 *
 * Tenancy: `projectId` must already be resolved server-side through lib/membership.ts or
 * lib/dashboard-auth.ts — never from a URL slug (AGENTS.md; CODE-QUALITY rule 10).
 */
export async function getPendingConfirmations(
  projectId: string,
  limit?: number
): Promise<PendingConfirmation[] | null> {
  return readPendingConfirmations(getSupabaseServiceClient(), projectId, { limit })
}
