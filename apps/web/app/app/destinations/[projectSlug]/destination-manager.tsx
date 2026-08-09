'use client'
import { useCallback, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { DestinationRow } from '@/lib/destinations'
import type { DeliveryHistoryRow } from '@/lib/deliveries'
import { formatUtc } from '@/lib/format-utc'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Field, FormSection } from '@/components/ui/FormSection'
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

// app-component-kit-adoption · Sprint 2, Story 2.2 — converted to DataTable + FormSection/Field.
// The private `formatUtc` copy that lived here is gone in favour of `lib/format-utc.ts` (D11).
//
// app-component-kit-adoption · Sprint 3 — the two-click "Click again to confirm" on Remove is GONE,
// converged onto `ConfirmDialog` (the corrected D5). It was the product's only pre-existing UI
// confirmation and the grooming docs misattributed it to the agent rail, which has no controls at
// all. Two confirmation patterns for one job is what D5 was written to avoid; it just named the
// wrong file. `window.confirm` stays banned for the reason recorded when the two-click was added:
// it blocks the page and the automation harness, so the cancel path could never be spec'd.
//
// Rotate is confirmed too. It reads as routine next to Remove and is not: the previous signing
// secret stops verifying the moment it completes, so every receiver still using it starts rejecting
// deliveries until someone redeploys with the new one.

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
  // The destination awaiting confirmation, and WHICH question is being asked about it. Held as the
  // row so the dialog can name it, and as a discriminated pair so one dialog serves both the
  // irreversible operations this table offers.
  const [confirming, setConfirming] = useState<{ row: DestinationRow; intent: 'remove' | 'rotate' } | null>(
    null
  )
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

  const onRotate = useCallback(
    (id: string) => {
      setError(null)
      setTestResult(null)
      startTransition(async () => {
        // The close is after the try/catch so a thrown action cannot strand the dialog open with no
        // error on it (cross-review, Agy, PR #84).
        try {
          const result = await rotateSecretAction(slug, id)
          if (result.ok) {
            setSecret({ id, value: result.signingSecret, rotated: true })
            router.refresh()
          } else {
            setError(result.error)
          }
        } catch {
          setError('Could not rotate that signing secret. The previous one is still valid.')
        }
        setConfirming(null)
      })
    },
    [slug, router]
  )

  const onToggle = useCallback(
    (id: string, enabled: boolean) => {
      setError(null)
      startTransition(async () => {
        const { ok } = await setEnabledAction(slug, id, enabled)
        if (!ok) setError('Could not update that destination.')
        router.refresh()
      })
    },
    [slug, router]
  )

  const onSendTest = useCallback(
    (id: string) => {
      setError(null)
      setTestResult(null)
      startTransition(async () => {
        const result = await sendTestAction(slug, id)
        if (result.ok) {
          setTestResult({
            destinationId: id,
            ok: true,
            message: `Delivered (HTTP ${result.status}, ${result.latencyMs}ms).`,
          })
        } else {
          const detail = 'error' in result && result.error ? result.error : 'not delivered'
          setTestResult({ destinationId: id, ok: false, message: `Test failed: ${detail}.` })
        }
      })
    },
    [slug]
  )

  // Soft-delete: the destination stops receiving and frees a slot against the per-project cap, but
  // its delivery history is retained.
  //
  // TWO-STEP, because removal is irreversible in the way that matters: the signing secret is gone
  // (never re-readable) and a removed destination can never be re-enabled (cross-review, Codex round
  // 12 — a one-click Remove sat beside routine controls). An in-UI confirm rather than window.confirm:
  // a browser dialog blocks the page and the automation harness.
  const onDelete = useCallback(
    (id: string) => {
      setError(null)
      setTestResult(null)
      startTransition(async () => {
        try {
          const { ok } = await deleteDestinationAction(slug, id)
          if (!ok) setError('Could not remove that destination.')
        } catch {
          setError('Could not remove that destination. It is still receiving deliveries.')
        }
        setConfirming(null)
        router.refresh()
      })
    },
    [slug, router]
  )

  // Story 2.2 — re-queue a settled delivery. The dispatcher picks it up on its next pass, so the
  // row goes back to "pending" here rather than reporting a send result inline.
  const onReplay = useCallback(
    (deliveryId: string) => {
      setError(null)
      startTransition(async () => {
        const result = await replayDeliveryAction(slug, deliveryId)
        if (!result.ok) setError(result.error)
        router.refresh()
      })
    },
    [slug, router]
  )

  const destinationColumns = useMemo<DataTableColumn<DestinationRow>[]>(
    () => [
      { key: 'name', header: 'Name', value: (d) => d.name },
      {
        key: 'url',
        header: 'URL',
        value: (d) => d.targetUrl,
        cell: (d) => <code>{d.targetUrl ?? '—'}</code>,
      },
      {
        // "all events" is a real setting, not a missing one, so it is a searchable VALUE rather
        // than a null: a reader filtering for "all events" is asking a legitimate question.
        key: 'filter',
        header: 'Filter',
        value: (d) => d.eventFilter ?? 'all events',
      },
      {
        key: 'secret',
        header: 'Secret',
        value: (d) => (d.secretSetAt ? `set ${formatUtc(d.secretSetAt)}` : null),
        cell: (d) => (d.secretSetAt ? `set ${formatUtc(d.secretSetAt)}` : '—'),
      },
      { key: 'status', header: 'Status', value: (d) => (d.enabled ? 'enabled' : 'disabled') },
      {
        key: 'actions',
        header: 'Actions',
        cell: (d) => (
          <>
            <button type="button" onClick={() => onSendTest(d.id)} disabled={pending}>
              Send test
            </button>{' '}
            <button type="button" onClick={() => onToggle(d.id, !d.enabled)} disabled={pending}>
              {d.enabled ? 'Disable' : 'Enable'}
            </button>{' '}
            <button
              type="button"
              onClick={() => setConfirming({ row: d, intent: 'rotate' })}
              disabled={pending}
            >
              Rotate secret
            </button>{' '}
            <button
              type="button"
              onClick={() => setConfirming({ row: d, intent: 'remove' })}
              disabled={pending}
            >
              Remove
            </button>
            {testResult && testResult.destinationId === d.id && <p role="status">{testResult.message}</p>}
          </>
        ),
      },
    ],
    [pending, testResult, onSendTest, onToggle]
  )

  const deliveryColumns = useMemo<DataTableColumn<DeliveryHistoryRow>[]>(
    () => [
      { key: 'event', header: 'Event', value: (d) => d.eventName, cell: (d) => d.eventName ?? '—' },
      {
        key: 'destination',
        header: 'Destination',
        value: (d) => d.destinationName,
        cell: (d) => d.destinationName ?? '—',
      },
      { key: 'status', header: 'Status', value: (d) => d.status },
      // A NUMBER, not the string it renders as: `attemptCount` must sort 2 < 10, and passing the
      // raw value is what makes the numeric branch of compareCellValues apply.
      { key: 'attempts', header: 'Attempts', value: (d) => d.attemptCount },
      {
        key: 'lastAttempt',
        header: 'Last attempt',
        value: (d) => (d.lastAttemptAt ? formatUtc(d.lastAttemptAt) : null),
        cell: (d) => (d.lastAttemptAt ? formatUtc(d.lastAttemptAt) : '—'),
      },
      {
        key: 'lastError',
        header: 'Last error',
        value: (d) => d.lastError,
        cell: (d) => <small>{d.lastError ?? '—'}</small>,
      },
      {
        key: 'actions',
        header: 'Actions',
        cell: (d) => (
          <>
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
          </>
        ),
      },
    ],
    [pending, onReplay]
  )

  return (
    <section>
      {secret && (
        <div className="panel" role="alert">
          <strong>
            Copy this signing secret now — it won&apos;t be shown again
            {secret.rotated ? ' (the previous secret is now invalid)' : ''}:
          </strong>
          <pre className="panel-code">{secret.value}</pre>
          <button type="button" className="btn btn-ghost" onClick={() => setSecret(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <form onSubmit={onCreate}>
        <FormSection
          title="Add a destination"
          description="Every matching event is POSTed to your URL and signed with a secret shown once, here, at creation time."
        >
          <Field label="Name" hint="How this destination appears in the table below.">
            {(control) => (
              <input
                {...control}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. crm-webhook"
                required
              />
            )}
          </Field>
          <Field
            label="Webhook URL"
            hint="Must be HTTPS. Delivery is at least once — deduplicate on the event id."
          >
            {(control) => (
              <input
                {...control}
                type="url"
                value={targetUrl}
                onChange={(e) => setTargetUrl(e.target.value)}
                placeholder="https://example.com/webhooks/golden-beans"
                required
              />
            )}
          </Field>
          <Field label="Event filter" hint="Leave blank to deliver every event.">
            {(control) => (
              <input
                {...control}
                type="text"
                value={eventFilter}
                onChange={(e) => setEventFilter(e.target.value)}
                placeholder="e.g. order_placed"
              />
            )}
          </Field>
          <div>
            <button type="submit" className="btn btn-gold" disabled={pending}>
              {pending ? 'Working…' : 'Add destination'}
            </button>
          </div>
        </FormSection>
      </form>

      {error && <p role="status">{error}</p>}

      <DataTable
        caption="Destinations"
        columns={destinationColumns}
        rows={destinations}
        rowKey={(d) => d.id}
        filterLabel="Filter destinations"
        empty="No destinations yet — add one above. Until you do, events are recorded but not forwarded anywhere."
      />

      {/* Story 2.2 — delivery history. Shows what actually happened per attempt (status, attempt
          count, last error) and offers REPLAY on a settled row. Deliberately no secrets and no
          payload body: this is an operational view, not an event browser. */}
      <h2>Recent deliveries</h2>
      <p>
        <small>
          Delivery is <strong>at least once</strong> — your receiver should deduplicate on the event id. A
          replay re-sends the same logical event id.
        </small>
      </p>
      <DataTable
        caption="Recent deliveries"
        columns={deliveryColumns}
        rows={deliveries}
        rowKey={(d) => d.id}
        filterLabel="Filter deliveries"
        empty="No deliveries yet — they appear once an enabled destination matches an incoming event."
      />

      {/*
        ONE dialog for both irreversible operations on this table, driven by `confirming.intent`.
        Two dialog components would be two places for the copy to drift apart, which is the same
        failure mode at a smaller scale as the two confirmation patterns D5 was written about.
      */}
      <ConfirmDialog
        open={confirming !== null}
        verb={confirming?.intent === 'rotate' ? 'Rotate' : 'Remove'}
        noun={confirming?.intent === 'rotate' ? 'the signing secret for' : 'destination'}
        subject={confirming?.row.name ?? ''}
        consequence={
          confirming?.intent === 'rotate'
            ? 'The current signing secret stops verifying the moment this completes. Any receiver still checking signatures with it will reject every delivery until you redeploy it with the new secret — which is shown once, here, and never again.'
            : 'Deliveries to this endpoint stop immediately and the signing secret is gone for good, so this destination can never be re-enabled. Delivery history is kept. Removing cannot be undone — disable it instead if you only want to pause it.'
        }
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return
          if (confirming.intent === 'rotate') onRotate(confirming.row.id)
          else onDelete(confirming.row.id)
        }}
      />
    </section>
  )
}
