// The counting rule for agent-resolved tasks — pure, zero-import, directly testable.
//
// signals-loop · Sprint 3, Story 3.3b. Extracted from lib/task-lifecycle-facts.ts after cross-review
// (Agy, PR #38) found the rule subtly wrong, because the rule is the part worth pinning and its
// host module cannot be unit-tested: it imports `server-only` and a database client, so a generic
// test runner throws on the import before reaching the logic. That is the lib/flags.ts precedent,
// and CODE-QUALITY.md rule 5 states it as house style.
//
// ── The rule, and the bug that produced it ────────────────────────────────────────────────────
// The first version filtered rows down to connector-resolves and kept the last one per task. So
// once a task had been agent-resolved it stayed counted forever: a later dismissal, human
// resolution or reopen was skipped rather than replacing the entry, and the count could assert
// agent-closed work that had since been undone — on a public maturity score, about ourselves.
//
// So: record each task's LATEST transition, then judge it. The question becomes "is this task, right
// now, agent-resolved?" rather than "was it ever?", which is what the ladder criterion actually
// asks, and it cannot drift out of step when a new lifecycle state is added.

export type TransitionRecord = {
  taskId: string
  /** How the transition happened. Only `'connector'` counts as an agent write. */
  via: unknown
  toStatus: unknown
  evidencePointer: string | null
}

export type LifecycleCounts = {
  agentResolvedTotal: number
  agentResolvedWithEvidence: number
  sampleEvidencePointer: string | null
}

/**
 * Count currently-agent-resolved tasks.
 *
 * `rows` MUST be ordered oldest-first: the last record seen for a task wins, which is what makes
 * "latest" meaningful. `isResolvable` is injected rather than imported so this file keeps zero
 * imports; the caller passes the same classifier the write path used, so read and write cannot
 * drift into disagreeing about what counts as evidence.
 */
export function countAgentResolved(
  rows: readonly TransitionRecord[],
  isResolvable: (pointer: string | null) => boolean,
  normalise: (pointer: string | null) => string | null = (p) => p
): LifecycleCounts {
  const latestByTask = new Map<string, TransitionRecord>()
  for (const row of rows) {
    if (!row.taskId) continue
    latestByTask.set(row.taskId, row)
  }

  let agentResolvedTotal = 0
  let agentResolvedWithEvidence = 0
  let sampleEvidencePointer: string | null = null

  for (const latest of latestByTask.values()) {
    if (latest.via !== 'connector' || latest.toStatus !== 'resolved') continue
    agentResolvedTotal += 1
    if (!isResolvable(latest.evidencePointer)) continue
    agentResolvedWithEvidence += 1
    if (!sampleEvidencePointer) sampleEvidencePointer = normalise(latest.evidencePointer)
  }

  return { agentResolvedTotal, agentResolvedWithEvidence, sampleEvidencePointer }
}
