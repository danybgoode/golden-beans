import 'server-only'
import { randomBytes } from 'node:crypto'
import { getSupabaseServiceClient } from './supabase'
import { hashCredential } from './credential-hash'
import { getTaskByProjectId, transitionTask } from './tasks'
import type { TaskStatus } from './task-events'
import { classifyEvidencePointer, describeEvidence, type EvidenceKind } from './evidence-pointer'
import { recordAudit } from './audit'

// signals-loop · Sprint 3, Story 3.2 — the propose → confirm → apply staging seam.
//
// The connector's write tools do not mutate. `propose_task_change` returns a PREVIEW of exactly what
// would change plus a single-use confirmation token; `apply_task_change` spends that token and
// performs the mutation through the same `transitionTask` path the dashboard uses.
//
// ── Why two steps, when the credential already authorizes the write ────────────────────────────
// Because of WHO is calling. The agent is the customer's, running under prompts this engine will
// never see, and "the model misread the queue and resolved forty tasks" is an ordinary failure mode
// rather than a paranoid one. Splitting the act means the mutation is a distinct, reviewable event
// in the agent's transcript, and the preview gives the model — or the human reading over its
// shoulder — one chance to notice that the task about to be closed is not the one they meant.
//
// It is NOT a permission check. The credential already decided that. It is a confirmation step, and
// those are different things: this cannot stop an agent that means to do the wrong thing, only one
// that is about to do it by accident.
//
// ── Why the mutation reuses transitionTask ─────────────────────────────────────────────────────
// lib/tasks.ts calls it "the ONE status-change path, shared by the dashboard and (in Sprint 3) the
// connector write tools." Two implementations of "may this task be claimed?" is one too many, and
// the second copy is the one that forgets a rule — here, the row lock, the terminal-state guard, the
// actor requirement and the lifecycle event emit. This module adds staging and audit; it does not
// re-decide anything about the lifecycle.

const CONFIRM_PREFIX = 'gb_confirm_'

/**
 * How long a confirmation stays spendable.
 *
 * Short on purpose. This is the gap between an agent being shown a preview and confirming it — a
 * round trip, not a work session. A long window turns a leaked token into a lasting capability, and
 * there is no legitimate flow that needs one: an expired proposal costs a re-propose, which is one
 * cheap call.
 */
export const CONFIRMATION_TTL_MS = 5 * 60 * 1000

export type TaskWriteAction = 'claim' | 'resolve' | 'dismiss'

/** The action → target status map. The only place this correspondence is written down. */
const ACTION_TO_STATUS: Record<TaskWriteAction, TaskStatus> = {
  claim: 'claimed',
  resolve: 'resolved',
  dismiss: 'dismissed',
}

export type ProposeInput = {
  projectId: string
  taskId: string
  action: TaskWriteAction
  actor?: string | null
  resolution?: string | null
  evidencePointer?: string | null
  agentKeyId?: string | null
}

export type ProposeResult =
  | {
      ok: true
      confirmationToken: string
      expiresAt: string
      preview: {
        taskId: string
        title: string
        action: TaskWriteAction
        fromStatus: string
        toStatus: TaskStatus
        actor: string | null
        resolution: string | null
        evidencePointer: string | null
        evidenceKind: EvidenceKind
        evidenceNote: string
      }
    }
  | { ok: false; reason: 'not_found' | 'already_terminal' | 'actor_required' | 'stage_failed' }

/**
 * Stage a proposed change. **Mutates nothing about the task.**
 *
 * The only row this writes is the confirmation itself. That is the property the acceptance criterion
 * checks by RE-READING the task row afterwards rather than by trusting this function's response —
 * the right way round, because a response is a claim and the row is the fact.
 */
export async function proposeTaskChange(input: ProposeInput): Promise<ProposeResult> {
  // Read the task through the project-scoped reader, so a task belonging to another tenant is
  // `not_found` here exactly as it is everywhere else — no existence oracle over foreign task ids.
  const task = await getTaskByProjectId(input.projectId, input.taskId)
  if (!task) return { ok: false, reason: 'not_found' }

  // Preflight the refusals `transition_task` would give, so an agent learns at PROPOSE time that a
  // change is impossible instead of being handed a token that is guaranteed to fail on apply. These
  // are previews of the database's decision, never a replacement for it: the same checks run again
  // inside the locked function at apply time, which is what makes the race-free answer authoritative.
  if (task.status === 'resolved' || task.status === 'dismissed') {
    return { ok: false, reason: 'already_terminal' }
  }
  const actor = (input.actor ?? '').trim() || null
  if (input.action === 'claim' && !actor) return { ok: false, reason: 'actor_required' }

  const evidence = classifyEvidencePointer(input.evidencePointer)
  const resolution = (input.resolution ?? '').trim() || null

  const plaintext = `${CONFIRM_PREFIX}${randomBytes(24).toString('base64url')}`
  const expiresAt = new Date(Date.now() + CONFIRMATION_TTL_MS)

  const supabase = getSupabaseServiceClient()
  const { error } = await supabase.from('task_write_confirmations').insert({
    token_hash: hashCredential(plaintext),
    project_id: input.projectId,
    task_id: input.taskId,
    action: input.action,
    actor,
    resolution,
    // Stored as classified, so the value the preview showed is byte-identical to the value applied.
    evidence_pointer: evidence.value,
    agent_key_id: input.agentKeyId ?? null,
    expires_at: expiresAt.toISOString(),
  })

  if (error) {
    console.error('[task-write-staging] could not stage proposal:', error)
    return { ok: false, reason: 'stage_failed' }
  }

  return {
    ok: true,
    confirmationToken: plaintext,
    expiresAt: expiresAt.toISOString(),
    preview: {
      taskId: task.id,
      title: task.title,
      action: input.action,
      fromStatus: task.status,
      toStatus: ACTION_TO_STATUS[input.action],
      actor,
      resolution,
      evidencePointer: evidence.value,
      evidenceKind: evidence.kind,
      // The honesty rule, surfaced in the PREVIEW and not only in the result: an agent about to
      // resolve a task with an unresolvable note is told so while it can still supply a real
      // pointer (Amendment 4.2).
      evidenceNote:
        input.action === 'resolve'
          ? describeEvidence(evidence)
          : 'No evidence pointer applies to this action.',
    },
  }
}

/**
 * Every way an apply can fail, named once.
 *
 * Three come from the confirmation (`not_found` / `already_used` / `expired`), four from the
 * lifecycle function's own structured refusals, and `apply_failed` is the catch-all for an
 * unexpected reason string — so a future refusal added to `transition_task` degrades to a generic
 * failure rather than being passed through unvalidated as if this module understood it.
 */
export type ApplyFailureReason =
  | 'not_found'
  | 'already_used'
  | 'expired'
  | 'already_terminal'
  | 'already_claimed'
  | 'invalid_resolution'
  | 'actor_required'
  | 'apply_failed'

const LIFECYCLE_REFUSALS: readonly ApplyFailureReason[] = [
  'already_terminal',
  'already_claimed',
  'invalid_resolution',
  'actor_required',
  'not_found',
]

export type ApplyResult =
  | {
      ok: true
      taskId: string
      action: TaskWriteAction
      fromStatus: string | null
      toStatus: TaskStatus
      evidenceKind: EvidenceKind
      evidenceRecorded: boolean
      note: string
    }
  | { ok: false; reason: ApplyFailureReason }

/**
 * Spend a confirmation token and perform the mutation.
 *
 * `projectId` is the project the CALLER resolved to on THIS request — both its connector token and
 * its agent_write key. The token is only spendable against the project it was minted under, so a
 * confirmation that leaks to another tenant is inert. That check lives inside
 * `consume_write_confirmation`'s WHERE clause, not here, so it cannot be skipped by a caller.
 *
 * Ordering note: the token is spent BEFORE the transition runs. That is deliberate and the trade is
 * worth stating. If the transition then fails, the confirmation is burned and the agent must
 * re-propose — mildly annoying. The alternative (transition first, spend after) makes a crash
 * between the two leave a spent-looking mutation with a still-spendable token, which is a DOUBLE
 * APPLY. Losing a token is recoverable; applying twice is not.
 */
export async function applyTaskChange(projectId: string, confirmationToken: string): Promise<ApplyResult> {
  const supabase = getSupabaseServiceClient()

  const { data, error } = await supabase
    .rpc('consume_write_confirmation', {
      p_token_hash: hashCredential(confirmationToken ?? ''),
      p_project_id: projectId,
    })
    .single<{
      ok: boolean
      reason: string
      task_id: string | null
      action: string | null
      actor: string | null
      resolution: string | null
      evidence_pointer: string | null
    }>()

  if (error || !data) {
    console.error('[task-write-staging] could not consume confirmation:', error)
    return { ok: false, reason: 'apply_failed' }
  }
  if (!data.ok) {
    const reason = data.reason
    if (reason === 'not_found' || reason === 'already_used' || reason === 'expired') {
      return { ok: false, reason }
    }
    return { ok: false, reason: 'apply_failed' }
  }

  const action = data.action as TaskWriteAction
  const taskId = data.task_id as string
  const toStatus = ACTION_TO_STATUS[action]

  const result = await transitionTask(projectId, taskId, toStatus, {
    actor: data.actor,
    resolution: data.resolution,
    evidencePointer: data.evidence_pointer,
  })

  // Re-classified from the STORED pointer rather than carried through in memory, so what is reported
  // describes what was actually written.
  const evidence = classifyEvidencePointer(data.evidence_pointer)

  if (!result.ok) {
    // The lifecycle refused at apply time — the task moved between propose and apply (someone else
    // claimed it, or it was resolved in the dashboard). The token is already spent, correctly: the
    // agent must look again rather than retry blindly against a queue that has changed.
    const refusal = LIFECYCLE_REFUSALS.find((r) => r === result.reason)
    return { ok: false, reason: refusal ?? 'apply_failed' }
  }

  // ── The audit row ───────────────────────────────────────────────────────────────────────────
  // `task_transitioned` is the shared label (lib/audit.ts): one action with the transition in its
  // metadata, because the dashboard and the connector share ONE code path and three labels over one
  // path is how a record ends up describing the endpoint someone called instead of what changed.
  // What distinguishes an agent write is `via: 'connector'` plus the credential id — so "who moved
  // this task, human or agent, and under which key?" is answerable from one place.
  await recordAudit({
    action: 'task_transitioned',
    projectId,
    metadata: {
      taskId,
      via: 'connector',
      action,
      fromStatus: result.fromStatus,
      toStatus,
      actor: data.actor,
      resolution: data.resolution,
      // Both facts, deliberately. A pointer that is only a note is recorded WITH the note and WITHOUT
      // the claim that it is evidence — never silently as evidenced (Amendment 4.2).
      evidencePointer: data.evidence_pointer,
      evidenceKind: evidence.kind,
      evidenceRecorded: evidence.resolvable,
    },
  })

  return {
    ok: true,
    taskId,
    action,
    fromStatus: result.fromStatus,
    toStatus,
    evidenceKind: evidence.kind,
    evidenceRecorded: evidence.resolvable,
    note: action === 'resolve' ? describeEvidence(evidence) : 'Applied.',
  }
}
