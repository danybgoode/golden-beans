'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import type { TaskRow } from '@/lib/tasks'
import { taskEvidencePhrase, taskHolder, taskSignalKind, type TaskBands } from '@/lib/today-bands'
import { Band, BandEmpty, TaskLine, TaskList } from '@/design-system/bands'
import { transitionTaskAction } from './actions'
import { Icon } from '@/components/ui/Icon'

// signals-loop · Sprint 2, Story 2.2 — the queue and the evidence drawer.
//
// design-system-rails · Sprint 5, Story 5.6 — it renders Today's bands (DD1/DD5) instead of a
// four-column table. The row is `design-system/bands.tsx`' `TaskLine`, the SAME component Today's
// server-rendered rows use; what differs is what goes in the `actions` slot.
//
// ⚠️ **Nothing interactive was removed.** Claim, resolve, dismiss, the optional evidence pointer and
// the evidence drawer all survive, because deleting a capability to satisfy a geometry assertion is
// not what "render from the design system" asks for. What changed is the shape they sit in.

/** The four bands this page shows, in the order the approved design lists them. */
const GROUPS = [
  {
    key: 'open',
    title: 'Waiting on you',
    who: 'you',
    sub: 'Decisions nothing else is allowed to make.',
    empty: {
      head: 'Nothing is waiting on you',
      body: 'Errors and friction reach this list once they affect enough people to be worth your time. Nothing has crossed that line.',
    },
  },
  {
    key: 'claimed',
    title: 'Your agent is working',
    who: 'agent',
    sub: 'Picked up and being resolved right now.',
    empty: {
      head: 'Nothing is in hand',
      body: 'An agent with a write key can claim a task from this list and work it without being asked.',
    },
  },
  {
    key: 'resolved',
    title: 'Resolved',
    who: 'done',
    sub: 'Fixed, with what was done recorded.',
    empty: { head: 'Nothing resolved yet', body: 'A resolution lands here with its pointer, if one was attached.' },
  },
  {
    key: 'dismissed',
    title: 'Dismissed',
    who: 'done',
    sub: 'Judged not a problem, with the reason kept.',
    empty: { head: 'Nothing dismissed', body: 'A dismissal is not a fix, and it is kept with its reason so it can be revisited.' },
  },
] as const

export function TaskQueue({
  slug,
  bands,
}: {
  slug: string
  bands: TaskBands<TaskRow> & { unknown: TaskRow[] }
}) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The evidence pointer per task, so two rows being resolved in one session cannot pick up each
  // other's value.
  const [pointers, setPointers] = useState<Record<string, string>>({})

  function act(taskId: string, toStatus: string, resolution?: string) {
    setError(null)
    startTransition(async () => {
      const result = await transitionTaskAction(
        slug,
        taskId,
        toStatus,
        resolution,
        // Only sent on a resolve. A dismissal is explicitly NOT a fix, so attaching a commit to one
        // would be a claim the action does not support.
        toStatus === 'resolved' ? pointers[taskId] : undefined,
      )
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  const total =
    bands.open.length + bands.claimed.length + bands.resolved.length + bands.dismissed.length

  return (
    <>
      {error ? (
        <p className="ds-callout ds-callout--warn" role="alert">
          <span className="ds-callout-icon">
            <Icon name="warning" size={14} />
          </span>
          <span>{error}</span>
        </p>
      ) : null}

      {total === 0 ? (
        // ⚠️ The whole-queue empty state, kept from the page this replaces and still the same
        // sentence. An empty queue and a broken queue look identical, and LEARNINGS records that an
        // honest-looking zero pages nobody — three times in this repo. So it says what "empty" MEANS
        // here rather than leaving a reader to wonder whether capture is even wired up.
        <TaskList>
          <BandEmpty
            head="No task has crossed the promotion threshold"
            body={
              <>
                That means one of three things: no errors have been captured yet, the signals seen so far
                affect too few people to be worth your time, or your funnels are healthy enough that no
                friction detector fired. Errors reach the engine through <code>captureError</code> in the
                SDK; friction is derived from funnels you already track, with nothing to install.
              </>
            }
          />
        </TaskList>
      ) : (
        GROUPS.map((group) => {
          const rows = bands[group.key]
          return (
            <Band key={group.key} title={group.title} who={group.who} count={rows.length} sub={group.sub}>
              <TaskList>
                {rows.length === 0 ? (
                  <BandEmpty head={group.empty.head} body={group.empty.body} />
                ) : (
                  rows.map((task) => (
                    <QueueLine
                      key={task.id}
                      task={task}
                      expanded={expanded === task.id}
                      onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                      pending={pending}
                      pointer={pointers[task.id] ?? ''}
                      onPointer={(value) => setPointers((prev) => ({ ...prev, [task.id]: value }))}
                      onAct={act}
                    />
                  ))
                )}
              </TaskList>
            </Band>
          )
        })
      )}

      {/* ⚠️ Rendered, never dropped. The database CHECK allows exactly the four statuses above, so
          this is empty today — but a fifth added by a migration would otherwise vanish from a queue
          whose entire promise is that a human sees what an agent sees. An unknown status is a
          finding, and this is how it becomes visible instead of becoming absent. */}
      {bands.unknown.length > 0 ? (
        <Band
          title="In a state this page does not recognise"
          who="done"
          count={bands.unknown.length}
          sub="These tasks exist and are not in any band above. That is a defect in this page, not in your queue — report it."
        >
          <TaskList>
            {bands.unknown.map((task) => (
              <QueueLine
                key={task.id}
                task={task}
                expanded={expanded === task.id}
                onToggle={() => setExpanded(expanded === task.id ? null : task.id)}
                pending={pending}
                pointer=""
                onPointer={() => undefined}
                onAct={act}
                readOnly
              />
            ))}
          </TaskList>
        </Band>
      ) : null}
    </>
  )
}

/** Which timestamp a row shows — the same rule `components/product/TaskLines.tsx` follows. */
function occurredAt(task: TaskRow): string {
  if (task.resolvedAt) return formatUtc(task.resolvedAt)
  if (task.claimedAt) return formatUtc(task.claimedAt)
  return formatUtc(task.createdAt)
}

function QueueLine({
  task,
  expanded,
  onToggle,
  pending,
  pointer,
  onPointer,
  onAct,
  readOnly,
}: {
  task: TaskRow
  expanded: boolean
  onToggle: () => void
  pending: boolean
  pointer: string
  onPointer: (value: string) => void
  onAct: (taskId: string, toStatus: string, resolution?: string) => void
  readOnly?: boolean
}) {
  const evidence = taskEvidencePhrase(task)
  const live = !readOnly && (task.status === 'open' || task.status === 'claimed')

  return (
    <div id={`task-${task.id}`}>
      <TaskLine
        title={task.title}
        kind={taskSignalKind(task)}
        holder={taskHolder(task)}
        when={occurredAt(task)}
        meta={
          <>
            {evidence ? <span>{evidence}</span> : null}
            {/* The rank, with BOTH its inputs beside it. A single opaque score invites people to
                argue with the number; showing what it was computed from lets them check it. */}
            <span className="ds-mono">rank {task.impactRank}</span>
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
          <>
            <button
              type="button"
              className="ds-btn ds-btn--secondary ds-btn--sm"
              onClick={onToggle}
              aria-expanded={expanded}
              aria-controls={`evidence-${task.id}`}
            >
              {expanded ? 'Hide evidence' : 'Evidence'}
            </button>
            {live && task.status === 'open' ? (
              <button
                type="button"
                className="ds-btn ds-btn--secondary ds-btn--sm"
                disabled={pending}
                onClick={() => onAct(task.id, 'claimed')}
              >
                Claim
              </button>
            ) : null}
            {live ? (
              <>
                <button
                  type="button"
                  className="ds-btn ds-btn--primary ds-btn--sm"
                  disabled={pending}
                  onClick={() => onAct(task.id, 'resolved', 'fixed')}
                >
                  Resolve
                </button>
                <button
                  type="button"
                  className="ds-btn ds-btn--secondary ds-btn--sm"
                  disabled={pending}
                  onClick={() => onAct(task.id, 'dismissed')}
                >
                  Dismiss
                </button>
              </>
            ) : null}
          </>
        }
      >
        {/* ── The evidence pointer (signals-loop Amendment 4.2) ──────────────────────────────
            Cross-review (Agy round 4) caught that the action accepted this and the UI never offered
            it — so the human surface could only ever produce unevidenced resolutions while an agent
            could attach a commit. That is backwards: the whole point of the pointer is that a
            resolution CLAIM is checkable, and the person clicking Resolve is the one most likely to
            know the PR number. Optional by design — a resolution with no pointer is recorded as
            resolved WITHOUT evidence, never silently as evidenced.

            ⚠️ It moved INTO the disclosure with Story 5.6. On the table it sat in a cell on every
            row, so a queue of twenty rendered twenty text inputs and the page was a form. It is one
            keystroke further away and is announced by the same control that reveals the evidence it
            belongs beside. */}
        {expanded ? (
          <div className="ds-disclosure-body" id={`evidence-${task.id}`}>
            {live ? (
              <label className="ds-field">
                <span className="ds-label">Evidence for this resolution (optional)</span>
                <input
                  className="ds-input"
                  type="text"
                  value={pointer}
                  onChange={(event) => onPointer(event.target.value)}
                  placeholder="commit SHA, PR URL, or a note"
                />
              </label>
            ) : null}
            <EvidenceDrawer task={task} />
          </div>
        ) : null}
      </TaskLine>
    </div>
  )
}

/**
 * The evidence bundle, rendered as the agent receives it.
 *
 * Deliberately shows the SAME fields `get_task` returns, in the same shape. If a human and an agent
 * can be shown different evidence for the same task, "humans see what agents see" is a slogan
 * rather than a property.
 */
function EvidenceDrawer({ task }: { task: TaskRow }) {
  const evidence = task.evidence ?? {}
  const signal = (evidence.signal ?? {}) as Record<string, unknown>
  const feature = evidence.feature as Record<string, unknown> | null
  const sample = evidence.sample as Record<string, unknown> | undefined

  return (
    <dl className="ds-envlist">
      <dt>Signal</dt>
      <dd>
        {String(signal.kind ?? 'unknown')} · first seen{' '}
        {signal.firstSeenAt ? formatUtc(String(signal.firstSeenAt)) : '—'} · last seen{' '}
        {signal.lastSeenAt ? formatUtc(String(signal.lastSeenAt)) : '—'}
      </dd>

      <dt>Feature</dt>
      <dd>
        {feature ? (
          <>
            <code>{String(feature.key)}</code> — flag was{' '}
            <strong>{feature.enabled ? 'ON' : 'OFF'}</strong> when this was promoted
          </>
        ) : (
          // Named explicitly rather than rendered blank. "No feature context" is a fact about the
          // event (it carried no featureId), not a rendering gap, and a silent empty row would read
          // as the latter.
          <em>No feature context — the events carried no feature id.</em>
        )}
      </dd>

      <dt>Sample</dt>
      <dd>
        {sample ? (
          // Scrubbed at ingest and again on the way out. Rendered as data, never as markup.
          <pre>{JSON.stringify(sample, null, 2)}</pre>
        ) : (
          <em>None recorded.</em>
        )}
      </dd>

      <dt>Captured</dt>
      <dd>
        {evidence.capturedAt ? formatUtc(String(evidence.capturedAt)) : '—'}{' '}
        <small>
          — the bundle reflects the world at promotion time, not now. That is deliberate: it is the
          state the problem occurred in.
        </small>
      </dd>
    </dl>
  )
}
