'use client'
import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import type { TaskRow } from '@/lib/tasks'
import { transitionTaskAction } from './actions'

// signals-loop · Sprint 2, Story 2.2 — the queue and the evidence drawer.

export function TaskQueue({ slug, tasks }: { slug: string; tasks: TaskRow[] }) {
  const router = useRouter()
  const [expanded, setExpanded] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function act(taskId: string, toStatus: string, resolution?: string) {
    setError(null)
    startTransition(async () => {
      const result = await transitionTaskAction(slug, taskId, toStatus, resolution)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  if (tasks.length === 0) {
    return (
      <section>
        <h2>No tasks yet</h2>
        {/* An empty queue and a broken queue look identical, and LEARNINGS records that an
            honest-looking zero pages nobody — three times in this repo. So the empty state says
            what "empty" MEANS here, and names the thresholds, rather than leaving a reader to
            wonder whether capture is even wired up. */}
        <p>
          Nothing has crossed the promotion threshold. That means one of three things: no errors
          have been captured yet, the signals seen so far affect too few users to be worth your
          time, or your funnels are healthy enough that no friction detector fired.
        </p>
        <p>
          Errors reach the engine through <code>captureError</code> in the SDK. Friction is derived
          from funnels you already track — nothing to install.
        </p>
      </section>
    )
  }

  return (
    <section>
      {error ? <p role="alert">⚠ {error}</p> : null}
      <table>
        <caption>
          {tasks.length} task{tasks.length === 1 ? '' : 's'}, most impactful first
        </caption>
        <thead>
          <tr>
            <th scope="col">Impact</th>
            <th scope="col">Problem</th>
            <th scope="col">Status</th>
            <th scope="col">Actions</th>
          </tr>
        </thead>
        <tbody>
          {tasks.map((task) => {
            const signal = (task.evidence?.signal ?? {}) as Record<string, unknown>
            const isOpen = expanded === task.id
            return (
              <tr key={task.id}>
                <td>
                  <strong>{task.impactRank}</strong>
                  <br />
                  {/* The two INPUTS to the rank, beside it. A single opaque score invites people to
                      argue with the number; showing users × frequency lets them check it. */}
                  <small>
                    {String(signal.usersAffected ?? '—')} users · {String(signal.eventCount ?? '—')}{' '}
                    events
                  </small>
                </td>
                <td>
                  <button type="button" onClick={() => setExpanded(isOpen ? null : task.id)}>
                    {isOpen ? '▾' : '▸'} {task.title}
                  </button>
                  {isOpen ? <EvidenceDrawer task={task} /> : null}
                </td>
                <td>
                  {task.status}
                  {task.claimedBy ? (
                    <>
                      <br />
                      <small>by {task.claimedBy}</small>
                    </>
                  ) : null}
                  {task.evidencePointer ? (
                    <>
                      <br />
                      <small>↳ {task.evidencePointer}</small>
                    </>
                  ) : null}
                </td>
                <td>
                  {task.status === 'open' || task.status === 'claimed' ? (
                    <>
                      {task.status === 'open' ? (
                        <button type="button" disabled={pending} onClick={() => act(task.id, 'claimed')}>
                          Claim
                        </button>
                      ) : null}
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => act(task.id, 'resolved', 'fixed')}
                      >
                        Resolve
                      </button>
                      <button type="button" disabled={pending} onClick={() => act(task.id, 'dismissed')}>
                        Dismiss
                      </button>
                    </>
                  ) : (
                    <small>{task.resolution ?? 'closed'}</small>
                  )}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </section>
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
    <div>
      <h3>Evidence</h3>
      <dl>
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
            // event (it carried no featureId), not a rendering gap, and a silent empty row would
            // read as the latter.
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
            — the bundle reflects the world at promotion time, not now. That is deliberate: it is
            the state the problem occurred in.
          </small>
        </dd>
      </dl>
    </div>
  )
}
