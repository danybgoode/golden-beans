import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import { classifyEvidencePointer } from './evidence-pointer'

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
    .select('metadata')
    .eq('project_id', projectId)
    .eq('action', 'task_transitioned')

  if (error) {
    console.error('[task-lifecycle-facts] query failed:', error)
    return null
  }

  // De-duplicated by task id. A task can legitimately produce several `task_transitioned` rows
  // (claimed, then resolved), and a task that was resolved, reopened and resolved again would
  // otherwise count twice — inflating the very number this exists to make honest.
  const resolvedByTask = new Map<string, string | null>()

  for (const row of data ?? []) {
    const meta = (row.metadata ?? {}) as Record<string, unknown>
    if (meta.via !== 'connector') continue
    if (meta.toStatus !== 'resolved') continue
    const taskId = typeof meta.taskId === 'string' ? meta.taskId : null
    if (!taskId) continue
    const pointer = typeof meta.evidencePointer === 'string' ? meta.evidencePointer : null
    // Last write wins: if a task really was resolved twice, the most recent resolution is the
    // current truth about it.
    resolvedByTask.set(taskId, pointer)
  }

  let withEvidence = 0
  let sample: string | null = null
  for (const pointer of resolvedByTask.values()) {
    const classified = classifyEvidencePointer(pointer)
    if (!classified.resolvable) continue
    withEvidence += 1
    if (!sample) sample = classified.value
  }

  return {
    agentResolvedTotal: resolvedByTask.size,
    agentResolvedWithEvidence: withEvidence,
    sampleEvidencePointer: sample,
  }
}
