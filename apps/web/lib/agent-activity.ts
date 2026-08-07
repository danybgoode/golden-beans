import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { readAgentActivity, type AgentActivityEntry } from './agent-activity-read'

// app-shell-and-agent-rail · Sprint 1, Story 1.1 — the seam the product imports.
//
// lib/audit.ts is WRITE-only (its sole export is `recordAudit`). This is its read side, and it is
// deliberately the only one: a component that issues its own `audit_log` query is a second read
// path with its own tenancy filter to forget (CODE-QUALITY rule 1).
//
// The query itself lives in ./agent-activity-read.ts, which takes its client as a parameter — see
// that file's header for why (the tenancy spec must be able to run the real query, and a
// `server-only` module cannot be imported from a Playwright spec).
//
// ── D4: this is RECENT ACTIVITY, not a ledger ─────────────────────────────────────────────────
// `recordAudit` swallows its own failure by design, so a successful revoke is never rolled back by
// a failed log write. Its own comment is explicit: "this trail is best-effort, not a ledger you can
// prove completeness against." Every caller of this function must caption what it renders
// accordingly. A rail headed "everything your agent did" would claim a completeness the data
// structurally cannot support, on the one surface whose whole pitch is that it shows its work.

export type { AgentActivityEntry, AgentActivityActor } from './agent-activity-read'
export { AGENT_ACTIVITY_ACTIONS, AGENT_ACTIVITY_MAX_LIMIT } from './agent-activity-read'

/**
 * Recent activity for ONE project, newest first, or `null` when it could not be read.
 *
 * Tenancy: `projectId` must already be resolved server-side — through lib/membership.ts or
 * lib/dashboard-auth.ts — never taken from a URL slug or a request body (AGENTS.md; CODE-QUALITY
 * rule 10).
 */
export async function getRecentAgentActivity(
  projectId: string,
  limit?: number
): Promise<AgentActivityEntry[] | null> {
  return readAgentActivity(getSupabaseServiceClient(), projectId, limit)
}
