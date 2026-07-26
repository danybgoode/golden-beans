'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isSignalsEnabled } from '@/lib/flags'
import { transitionTask } from '@/lib/tasks'
import { recordAudit } from '@/lib/audit'
import type { TaskStatus } from '@/lib/task-events'

// signals-loop · Sprint 2, Story 2.2 — the dashboard's lifecycle actions.
//
// ── Every action re-authorizes from scratch ─────────────────────────────────────────────────
// A Server Action is a PUBLIC POST endpoint that happens to be written in TypeScript. The rendering
// page having checked membership means nothing here: an attacker invokes the action directly, with
// whatever slug and task id they like, and never renders the page at all. So the flag check and the
// membership check are repeated in full, in every action, before anything else runs.

const ALLOWED: TaskStatus[] = ['claimed', 'resolved', 'dismissed']

export type TaskActionResult = { ok: true } | { ok: false; error: string }

export async function transitionTaskAction(
  slug: string,
  taskId: string,
  toStatus: string,
  resolution?: string,
  evidencePointer?: string,
): Promise<TaskActionResult> {
  if (!isSignalsEnabled()) return { ok: false, error: 'Not found.' }

  // An allow-list, not a cast. `toStatus` arrives from the client, and passing an arbitrary string
  // to the RPC would let a caller attempt transitions the UI never offers — including 'open', which
  // would be a re-open of a terminal task and is exactly what transition_task refuses at the
  // database. Rejecting it here as well means the invalid case never reaches a query at all.
  if (!ALLOWED.includes(toStatus as TaskStatus)) return { ok: false, error: 'Invalid status.' }

  const membership = await requireProjectMembership(slug)

  const result = await transitionTask(membership.projectId, taskId, toStatus as TaskStatus, {
    // The acting HUMAN, recorded the same way an agent's opaque label will be in Sprint 3, so the
    // `claimed_by` column answers "who holds this?" identically whichever surface acted.
    actor: `user:${membership.userId}`,
    resolution: resolution ?? null,
    evidencePointer: evidencePointer ?? null,
  })

  if (!result.ok) {
    // The RPC's own reason is surfaced rather than flattened: "already claimed by someone else" and
    // "this task is already resolved" are different situations for the person reading the screen,
    // and a generic failure would send them to look for a bug that isn't there.
    return { ok: false, error: humanReason(result.reason) }
  }

  await recordAudit({
    action: 'task_transitioned',
    projectId: membership.projectId,
    actorUserId: membership.userId,
    // Non-secret context only, and the discriminator is IN the record: an audit trail that cannot
    // distinguish a resolve from a dismiss is the "label chosen by picking an endpoint" failure
    // LEARNINGS records from pod-report S3.
    metadata: { taskId, toStatus, fromStatus: result.fromStatus },
  })

  revalidatePath(`/app/tasks/${slug}`)
  return { ok: true }
}

function humanReason(reason: string): string {
  switch (reason) {
    case 'not_found':
      return 'That task no longer exists.'
    case 'already_claimed':
      return 'Someone else already claimed this task.'
    case 'already_terminal':
      return 'This task is already resolved or dismissed.'
    case 'actor_required':
      // Not reachable from the dashboard — the action always supplies `user:<id>`. Handled anyway
      // because Sprint 3's connector writes pass an AGENT-supplied label, and a shared reason map
      // that silently falls through to "Could not update" for a known refusal is how a caller ends
      // up debugging the wrong thing.
      return 'A claim needs an identified claimant.'
    default:
      return 'Could not update the task.'
  }
}
