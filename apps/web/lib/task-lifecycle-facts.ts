import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { classifyEvidencePointer } from './evidence-pointer'
import { countAgentResolved } from './task-lifecycle-count'

// signals-loop · Sprint 3, Story 3.3b — task-lifecycle facts as AI-adoption ladder evidence.
//
// Amendment 4.3: landing §5's adoption-step claim is currently ASSERTED. This epic is the first
// thing in the repo that could honestly move it, because it is the first place a real user-reported
// problem is captured, grouped, handed to an agent over MCP, and closed BY that agent with a pointer
// someone can check. The ladder names that transition verbatim (3 → 4, "feedback remediation").
//
// This module answers exactly one question, for ONE project: how many tasks did an agent resolve,
// and how many of those carried evidence a third party could check?
//
// ── Why "an agent" means "through the connector", not "an actor string that looks like a bot" ──
// The audit trail records `via: 'connector'` on every staged write (lib/task-write-staging.ts), and
// that is a FACT about which credential and code path performed the mutation. The alternative —
// pattern-matching `claimed_by` for things like 'claude' or '-bot' — would be inferring identity
// from a caller-supplied free-text label, i.e. letting the subject of the measurement choose its own
// answer. A tenant could then move their own adoption score by naming a human "claude-code".
//
// ── Why it re-derives evidence rather than trusting a stored boolean ───────────────────────────
// `classifyEvidencePointer` is the same function the write path used to decide what to tell the
// agent. Re-running it here means the read and the write cannot drift into disagreeing about what
// counts as evidence — the recurring failure this repo has a LEARNINGS entry for (two layers
// bounding the same data by different measurements). It is pure and cheap, so there is no reason to
// denormalise the answer and every reason not to.

export type TaskLifecycleFacts = {
  /** Tasks resolved through the connector's write tools, by an agent. */
  agentResolvedTotal: number
  /** ...of which carried a RESOLVABLE pointer (a commit SHA or a URL), not a free-text note. */
  agentResolvedWithEvidence: number
  /** One real pointer, so the lens's evidence row cites something a reader can actually open. */
  sampleEvidencePointer: string | null
}

/**
 * Count agent-resolved tasks for ONE project.
 *
 * Returns `null` — never zeroes — when the facts cannot be read. The distinction is the whole point
 * of the criterion this feeds: the lens renders `not_instrumented` ("we did not look") for null and
 * `not_met` ("we looked and it is not happening") for a genuine zero, and collapsing them would
 * turn an outage into a quiet accusation that no agent is doing any work.
 *
 * Tenancy: `projectId` is required and every query is scoped to it. There is no cross-project
 * variant of this function, and a report is always about one tenant.
 */
export async function getTaskLifecycleFacts(projectId: string): Promise<TaskLifecycleFacts | null> {
  if (!projectId) return null

  const supabase = getSupabaseServiceClient()

  // The audit trail, not the tasks table, is what knows HOW a transition happened. A resolved task
  // row records that it was resolved; only the audit row records that the connector did it.
  const { data, error } = await supabase
    .from('audit_log')
    .select('metadata, created_at')
    .eq('project_id', projectId)
    .eq('action', 'task_transitioned')
    // ORDER BY is load-bearing, not tidiness (cross-review, Codex, PR #38). The loop below resolves
    // duplicate rows for one task by "last write wins" — and without an explicit order, "last" is
    // whatever order Postgres happened to return, which it guarantees nothing about. So the comment
    // asserted a property the query did not provide: a re-resolved task could be scored from its
    // OLDER pointer, changing an evidenced resolution back into an unevidenced one and moving the
    // published maturity score. Same defect class as the audit-metadata finding beside it — prose
    // promising what the code does not do.
    .order('created_at', { ascending: true })
    // Tie-break on the row id: two audit rows can share a timestamp at Postgres' resolution, which
    // would leave "last" ambiguous again for exactly the case this ordering exists to settle.
    .order('id', { ascending: true })

  if (error) {
    console.error('[task-lifecycle-facts] query failed:', error)
    return null
  }

  // The counting RULE lives in lib/task-lifecycle-count.ts — pure and zero-import, so it can be
  // unit-tested directly (CODE-QUALITY rule 5). This module keeps the I/O and the shaping.
  // Rows arrive oldest-first from the query above, which is what makes "latest" meaningful.
  const rows = (data ?? []).map((row) => {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    return {
      taskId: typeof meta.taskId === 'string' ? meta.taskId : '',
      via: meta.via,
      toStatus: meta.toStatus,
      evidencePointer: typeof meta.evidencePointer === 'string' ? meta.evidencePointer : null,
    }
  })

  // The SAME classifier the write path used, injected — so read and write cannot drift into
  // disagreeing about what counts as evidence.
  return countAgentResolved(
    rows,
    (pointer) => classifyEvidencePointer(pointer).resolvable,
    (pointer) => classifyEvidencePointer(pointer).value
  )
}
