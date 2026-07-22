'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { DestinationRow } from '@/lib/destinations'
import type { DeliveryHistoryRow } from '@/lib/deliveries'
import {
  createDestinationAction,
  rotateSecretAction,
  setEnabledAction,
  sendTestAction,
  replayDeliveryAction,
  deleteDestinationAction,
} from './actions'

// event-destination-router · Sprint 2, Story 2.1 — create / test / enable / rotate / disable UI.
// The list renders from the `destinations` prop (refreshed by router.refresh() after each mutation,
// since the actions revalidate the path). Only a just-minted signing secret lives in local state —
// it is shown ONCE and never re-fetchable, the same contract as the API-key manager.

// Timezone-stable rendering — toLocaleString formats in the server zone during SSR and the browser
// zone on hydration, a guaranteed React hydration mismatch. UTC is explicit and deterministic.
function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

type TestState = { destinationId: string; message: string; ok: boolean }

export function DestinationManager({
  slug,
  destinations,
  deliveries,
}: {
  slug: string
  destinations: DestinationRow[]
  deliveries: DeliveryHistoryRow[]
}) {
  const router = useRouter()
  const [name, setName] = useState('')
  const [targetUrl, setTargetUrl] = useState('')
  const [eventFilter, setEventFilter] = useState('')
  const [secret, setSecret] = useState<{ id: string; value: string; rotated: boolean } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [testResult, setTestResult] = useState<TestState | null>(null)
  // Which destination is awaiting a second Remove click (the in-UI confirm step).
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setTestResult(null)
    startTransition(async () => {
      const result = await createDestinationAction(slug, name, targetUrl, eventFilter || null)
      if (result.ok) {
        setSecret({ id: result.id, value: result.signingSecret, rotated: false })
        setName('')
        setTargetUrl('')
        setEventFilter('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function onRotate(id: string) {
    setError(null)
    setTestResult(null)
    startTransition(async () => {
      const result = await rotateSecretAction(slug, id)
      if (result.ok) {
        setSecret({ id, value: result.signingSecret, rotated: true })
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function onToggle(id: string, enabled: boolean) {
    setError(null)
    startTransition(async () => {
      const { ok } = await setEnabledAction(slug, id, enabled)
      if (!ok) setError('Could not update that destination.')
      router.refresh()
    })
  }

  function onSendTest(id: string) {
    setError(null)
    setTestResult(null)
    startTransition(async () => {
      const result = await sendTestAction(slug, id)
      if (result.ok) {
        setTestResult({ destinationId: id, ok: true, message: `Delivered (HTTP ${result.status}, ${result.latencyMs}ms).` })
      } else {
        const detail = 'error' in result && result.error ? result.error : 'not delivered'
        setTestResult({ destinationId: id, ok: false, message: `Test failed: ${detail}.` })
      }
    })
  }

  // Soft-delete: the destination stops receiving and frees a slot against the per-project cap, but
  // its delivery history is retained.
  //
  // TWO-STEP, because removal is irreversible in the way that matters: the signing secret is gone
  // (never re-readable) and a removed destination can never be re-enabled (cross-review, Codex round
  // 12 — a one-click Remove sat beside routine controls). An in-UI confirm rather than window.confirm:
  // a browser dialog blocks the page and the automation harness.
  function onDelete(id: string) {
    setError(null)
    setTestResult(null)
    if (confirmDelete !== id) {
      setConfirmDelete(id)
      return
    }
    setConfirmDelete(null)
    startTransition(async () => {
      const { ok } = await deleteDestinationAction(slug, id)
      if (!ok) setError('Could not remove that destination.')
      router.refresh()
    })
  }

  // Story 2.2 — re-queue a settled delivery. The dispatcher picks it up on its next pass, so the
  // row goes back to "pending" here rather than reporting a send result inline.
  function onReplay(deliveryId: string) {
    setError(null)
    startTransition(async () => {
      const result = await replayDeliveryAction(slug, deliveryId)
      if (!result.ok) setError(result.error)
      router.refresh()
    })
  }

  return (
    <section>
      {secret && (
        <div role="alert" style={{ border: '1px solid', padding: '0.75rem', margin: '0.75rem 0' }}>
          <strong>
            Copy this signing secret now — it won&apos;t be shown again
            {secret.rotated ? ' (the previous secret is now invalid)' : ''}:
          </strong>
          <pre>{secret.value}</pre>
          <button type="button" onClick={() => setSecret(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <form onSubmit={onCreate}>
        <fieldset>
          <legend>Add a destination</legend>
          <label>
            Name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. crm-webhook"
              required
            />
          </label>
          <label>
            Webhook URL
            <input
              type="url"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              placeholder="https://example.com/webhooks/golden-beans"
              required
            />
          </label>
          <label>
            Event filter <small>— leave blank to deliver every event</small>
            <input
              type="text"
              value={eventFilter}
              onChange={(e) => setEventFilter(e.target.value)}
              placeholder="e.g. order_placed"
            />
          </label>
          <button type="submit" disabled={pending}>
            {pending ? 'Working…' : 'Add destination'}
          </button>
        </fieldset>
      </form>

      {error && <p role="status">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>URL</th>
            <th>Filter</th>
            <th>Secret</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {destinations.length === 0 ? (
            <tr>
              <td colSpan={6}>No destinations yet — add one above.</td>
            </tr>
          ) : (
            destinations.map((d) => (
              <tr key={d.id}>
                <td>{d.name}</td>
                <td>
                  <code>{d.targetUrl ?? '—'}</code>
                </td>
                <td>{d.eventFilter ?? 'all events'}</td>
                <td>{d.secretSetAt ? `set ${formatUtc(d.secretSetAt)}` : '—'}</td>
                <td>{d.enabled ? 'enabled' : 'disabled'}</td>
                <td>
                  <button type="button" onClick={() => onSendTest(d.id)} disabled={pending}>
                    Send test
                  </button>{' '}
                  <button type="button" onClick={() => onToggle(d.id, !d.enabled)} disabled={pending}>
                    {d.enabled ? 'Disable' : 'Enable'}
                  </button>{' '}
                  <button type="button" onClick={() => onRotate(d.id)} disabled={pending}>
                    Rotate secret
                  </button>{' '}
                  <button type="button" onClick={() => onDelete(d.id)} disabled={pending}>
                    {confirmDelete === d.id ? 'Click again to confirm' : 'Remove'}
                  </button>
                  {confirmDelete === d.id && (
                    <small> — the signing secret is lost and this cannot be undone.</small>
                  )}
                  {testResult && testResult.destinationId === d.id && (
                    <p role="status">{testResult.message}</p>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>

      {/* Story 2.2 — delivery history. Shows what actually happened per attempt (status, attempt
          count, last error) and offers REPLAY on a settled row. Deliberately no secrets and no
          payload body: this is an operational view, not an event browser. */}
      <h2>Recent deliveries</h2>
      <p>
        <small>
          Delivery is <strong>at least once</strong> — your receiver should deduplicate on the
          event id. A replay re-sends the same logical event id.
        </small>
      </p>
      <table>
        <thead>
          <tr>
            <th>Event</th>
            <th>Destination</th>
            <th>Status</th>
            <th>Attempts</th>
            <th>Last attempt</th>
            <th>Last error</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {deliveries.length === 0 ? (
            <tr>
              <td colSpan={7}>
                No deliveries yet — they appear once an enabled destination matches an incoming event.
              </td>
            </tr>
          ) : (
            deliveries.map((d) => (
              <tr key={d.id}>
                <td>{d.eventName ?? '—'}</td>
                <td>{d.destinationName ?? '—'}</td>
                <td>{d.status}</td>
                <td>{d.attemptCount}</td>
                <td>{d.lastAttemptAt ? formatUtc(d.lastAttemptAt) : '—'}</td>
                <td>
                  <small>{d.lastError ?? '—'}</small>
                </td>
                <td>
                  {/* Only a TERMINAL delivery can be replayed. `pending`/`in_flight` are queued, and
                      `failed` is mid-retry — already scheduled for another attempt, so replaying it
                      would silently override that schedule and reset its budget (cross-review, Codex
                      round 14). A REMOVED destination has nothing to replay to. */}
                  {['delivered', 'dead'].includes(d.status) && !d.destinationRemoved && (
                    <button type="button" onClick={() => onReplay(d.id)} disabled={pending}>
                      Replay
                    </button>
                  )}
                  {d.destinationRemoved && <small>destination removed</small>}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}
