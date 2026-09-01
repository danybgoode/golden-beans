import { formatUtc } from '@/lib/format-utc'
import type { TaskRow } from '@/lib/tasks'
import { taskEvidencePhrase, taskHolder, taskSignalKind } from '@/lib/today-bands'
import { TaskLine } from '@/design-system/bands'

// design-system-rails · Sprint 5, Story 5.2 — the READ-ONLY mount of a task row.
//
// ── Why there are two mounts and only one row ─────────────────────────────────────────────────
// DD5: one design, two mounts. `/app/tasks` renders the same `TaskLine` from a CLIENT component,
// because claiming and resolving are interactive; Today renders it from the server, because Today
// is a place you read rather than a place you work. What differs is the `actions` slot. What does
// not differ is the row — and it does not differ because there is one of it, not because two
// currently agree.
//
// ── The holder is a name, never a classification ──────────────────────────────────────────────
// `taskHolder` deliberately does not say whether a holder is a person or an agent. `claimed_by` is
// caller-supplied free text, and this repo already decided twice that agent attribution comes from
// `metadata.via === 'connector'` and never from an actor string — otherwise a tenant could relabel a
// human as an agent and change what the product says about them. See `lib/today-bands.ts`.

/**
 * Which timestamp a row shows, per band.
 *
 * A closed task's interesting moment is when it closed; a held task's is when it was picked up; an
 * open one's is when it arrived. Showing `updatedAt` for all three would be one field that means
 * three different things, which is how a reader stops trusting a column.
 */
function occurredAt(task: TaskRow): string {
  if (task.resolvedAt) return formatUtc(task.resolvedAt)
  if (task.claimedAt) return formatUtc(task.claimedAt)
  return formatUtc(task.createdAt)
}

export function TaskLines({ slug, tasks }: { slug: string; tasks: TaskRow[] }) {
  return (
    <>
      {tasks.map((task) => {
        const evidence = taskEvidencePhrase(task)
        return (
          <TaskLine
            key={task.id}
            title={task.title}
            kind={taskSignalKind(task)}
            holder={taskHolder(task)}
            when={occurredAt(task)}
            meta={
              <>
                {evidence ? <span>{evidence}</span> : null}
                {/* The resolution, in the same words as the button that recorded it. An unevidenced
                    resolution says so rather than being rendered as a blank — a resolution CLAIM is
                    only worth anything if a reader can tell whether it came with a pointer. */}
                {task.status === 'resolved' || task.status === 'dismissed' ? (
                  <span>
                    {task.status === 'resolved' ? 'Resolved' : 'Dismissed'}
                    {task.resolution ? ` · ${task.resolution}` : ''}
                    {task.status === 'resolved' && !task.evidencePointer ? ' · no evidence attached' : ''}
                  </span>
                ) : null}
                {task.evidencePointer ? <span className="ds-mono">{task.evidencePointer}</span> : null}
              </>
            }
            actions={
              // Today is read-only: the row LINKS to the queue rather than offering an action, so
              // there is exactly one surface that can claim, resolve or dismiss. Two places that
              // mutate the same row is two places to get the confirmation wrong.
              <a className="ds-btn ds-btn--secondary ds-btn--sm" href={`/app/tasks/${slug}#task-${task.id}`}>
                Open
              </a>
            }
          />
        )
      })}
    </>
  )
}
