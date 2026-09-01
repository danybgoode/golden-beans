'use client'
import { useCallback, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { DestinationRow } from '@/lib/destinations'
import type { DeliveryHistoryRow } from '@/lib/deliveries'
import { formatUtc } from '@/lib/format-utc'
import type { DeliveryHealthRow } from '@/lib/deliveries'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { CopyField } from '@/design-system/copy-field'
import {
  Answer,
  Callout,
  Card,
  Col,
  Empty,
  Field,
  ListCard,
  ListHead,
  PageHead,
  Row,
  RowMain,
  ShownOnce,
  Tag,
} from '@/design-system/primitives'
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
  health,
}: {
  slug: string
  destinations: DestinationRow[]
  deliveries: DeliveryHistoryRow[]
  /**
   * Per-destination delivery counts, aggregated in the DATABASE.
   *
   * ⚠️ **Moved INTO the rows — design-system-rails S4.6.** This rendered as a separate nine-column
   * table above the list, so "is delivery working?" and "what is configured?" were two tables a
   * reader had to join by name. The approved `setup-destinations` state puts the health on the row
   * it belongs to: a split bar and the two counts, beside the destination they describe.
   */
  health: DeliveryHealthRow[]
}) {
  const router = useRouter()
  // The form is behind `+ New destination`, so the page opens on the answer and the list rather
  // than on an empty form — which is what the approved state shows and what makes the page fit.
  const [creating, setCreating] = useState(false)
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
        setCreating(false)
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

  /**
   * The health row for a destination, or a zeroed stand-in.
   *
   * ⚠️ A MISSING row is not the same as zeros, and the fallback says so by carrying `known: false`.
   * `delivery_health` LEFT-JOINs, so a configured destination with no deliveries DOES get a row of
   * zeros — the only way to miss is a read that did not answer, and painting an empty bar for that
   * would claim "nothing has failed" about a question nobody asked.
   */
  const healthById = useMemo(() => new Map(health.map((row) => [row.destinationId, row])), [health])

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

  const live = destinations.filter((row) => row.enabled).length
  const failed = health.reduce((total, row) => total + row.failedAttempts, 0)

  return (
    <>
      <PageHead
        title="Destinations"
        lede="Where this project sends what happens, so another tool can act on it. Every matching event is POSTed to your URL and signed, so your receiver can verify it came from Golden Frijoles."
        actions={
          !creating && (
            <button type="button" className="ds-btn ds-btn--primary" onClick={() => setCreating(true)}>
              + New destination
            </button>
          )
        }
      />

      {/* ── The answer line ────────────────────────────────────────────────────────────────────
          What is true right now, in one sentence, before any table. `failedAttempts` is CUMULATIVE
          — it survives a replay — so the sentence says "have failed", not "are failing": a count of
          historical failures rendered in the present tense would read as an ongoing outage. */}
      <Answer>
        <b>
          {live} destination{live === 1 ? '' : 's'} {live === 1 ? 'is' : 'are'} live
        </b>
        {failed > 0 ? (
          <>
            {' and '}
            <b>{failed}</b> {failed === 1 ? 'delivery has' : 'deliveries have'} failed. A failed delivery is
            retried, and you can replay one by hand from the log below.
          </>
        ) : (
          <>. Nothing has failed to deliver.</>
        )}
      </Answer>

      {/* ⚠️ The signing secret is shown ONCE, on a screen of its own — the same rule Setup › Keys
          follows. On a ROTATE it also says what just stopped working, because that is the half a
          reader can miss: the previous secret stops verifying the moment the rotation completes, so
          every receiver still using it starts rejecting deliveries. */}
      {secret && (
        <ShownOnce
          title={
            secret.rotated
              ? 'Copy this signing secret now — the previous one is already invalid'
              : 'Copy this signing secret now — it is not shown again'
          }
          body={
            secret.rotated
              ? 'Every receiver still verifying with the old secret is rejecting deliveries until you deploy this one.'
              : 'Only its hash is stored, so nothing here can show it to you a second time. Your receiver uses it to verify that a delivery came from us.'
          }
        >
          <CopyField value={secret.value} label="Copy the signing secret" />
          <p className="ds-once-actions">
            <button type="button" className="ds-btn ds-btn--secondary" onClick={() => setSecret(null)}>
              I&apos;ve saved it
            </button>
          </p>
        </ShownOnce>
      )}

      {creating && (
        <Card>
          <form onSubmit={onCreate}>
            <Field
              label="Name"
              controlId="new-destination-name"
              hint="How this destination appears in the list below."
            >
              {(control) => (
                <input
                  {...control}
                  className="ds-input"
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
              controlId="new-destination-url"
              hint="Must be HTTPS. Delivery is at least once — deduplicate on the event id."
            >
              {(control) => (
                <input
                  {...control}
                  className="ds-input"
                  type="url"
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                  placeholder="https://example.com/webhooks/golden-frijoles"
                  required
                />
              )}
            </Field>
            <Field
              label="Which events"
              controlId="new-destination-filter"
              hint="Leave blank to deliver every event."
            >
              {(control) => (
                <input
                  {...control}
                  className="ds-input"
                  type="text"
                  value={eventFilter}
                  onChange={(e) => setEventFilter(e.target.value)}
                  placeholder="e.g. order_placed"
                />
              )}
            </Field>
            {/* New destinations start DISABLED — configure it, send a test, then enable it. Said
                here, at the moment somebody creates one, rather than in a paragraph at the top of
                the page they read before they had a reason to care. */}
            <Callout>
              A new destination starts <b>switched off</b>. Send it a test first, then turn it on — turning it
              on starts delivery from now, not from the backlog.
            </Callout>
            {error && <Callout tone="warn">{error}</Callout>}
            <p className="ds-mint-actions">
              <button type="submit" className="ds-btn ds-btn--primary" disabled={pending}>
                {pending ? 'Working…' : 'Create the destination'}
              </button>
              <button
                type="button"
                className="ds-btn ds-btn--secondary"
                onClick={() => setCreating(false)}
                disabled={pending}
              >
                Cancel
              </button>
            </p>
          </form>
        </Card>
      )}

      {error && !creating && <Callout tone="warn">{error}</Callout>}

      {destinations.length === 0 ? (
        <div className="ds-listcard">
          <Empty
            title="No destinations yet"
            body="Until you add one, events are recorded here but not forwarded anywhere. A destination is a URL of yours that every matching event is POSTed to, signed so you can verify it came from us."
          />
        </div>
      ) : (
        <ListCard label="Destinations" wideActions>
          <ListHead>
            <Col header>Destination</Col>
            <Col header width="state">
              Sends
            </Col>
            <Col header width="meta">
              Delivery
            </Col>
            <Col header width="act">
              On / off
            </Col>
          </ListHead>
          {destinations.map((row) => {
            const rowHealth = healthById.get(row.id)
            const total = (rowHealth?.delivered ?? 0) + (rowHealth?.failedAttempts ?? 0)
            const okPercent = total === 0 ? 0 : ((rowHealth?.delivered ?? 0) / total) * 100
            return (
              <Row key={row.id}>
                <RowMain
                  mono={false}
                  title={row.name}
                  description={
                    <>
                      <span className="ds-mono">{row.targetUrl ?? 'no URL'}</span>
                      {row.secretSetAt === null
                        ? ' · no secret yet'
                        : ` · secret set ${formatUtc(row.secretSetAt)}`}
                    </>
                  }
                />
                <Col width="state">
                  {/* "all events" is a real setting, not a missing one — a dashed tag would read as
                      "unclassified", which is a different fact. */}
                  {row.eventFilter === null ? (
                    <Tag>Everything</Tag>
                  ) : (
                    <Tag label={`Only ${row.eventFilter}`}>
                      <span className="ds-mono">{row.eventFilter}</span>
                    </Tag>
                  )}
                </Col>
                <Col width="meta">
                  {rowHealth === undefined ? (
                    // ⚠️ NOT zeros. The health read did not answer for this row, and painting an
                    // empty bar would claim "nothing has failed" about a question nobody asked.
                    <span className="ds-note">Delivery could not be read</span>
                  ) : total === 0 ? (
                    <span className="ds-note">Nothing sent yet</span>
                  ) : (
                    <>
                      {/* The same split bar the drills use, because "how much of what I sent
                          arrived" is the same question in both places. */}
                      <div
                        className="ds-splitbar"
                        role="img"
                        aria-label={`${rowHealth.delivered} delivered, ${rowHealth.failedAttempts} failed`}
                      >
                        <i className="ds-splitbar-ok" style={{ width: `${okPercent.toFixed(1)}%` }} />
                        {rowHealth.failedAttempts > 0 && (
                          <i
                            className="ds-splitbar-bad"
                            style={{ width: `${(100 - okPercent).toFixed(1)}%` }}
                          />
                        )}
                      </div>
                      <span className="ds-note">
                        <span className="ds-mono">{rowHealth.delivered.toLocaleString('en-US')}</span> sent
                        {rowHealth.failedAttempts > 0 && (
                          <>
                            {' · '}
                            <span className="ds-mono ds-note--bad">{rowHealth.failedAttempts} failed</span>
                          </>
                        )}
                      </span>
                    </>
                  )}
                </Col>
                <Col width="act">
                  {/* ⚠️ TWO states here, not three. A destination is on or off — nobody "never
                      touched" one, because creating it is the act. So the switch is the two-state
                      form of the same control the feature list uses, and `never` is not reachable. */}
                  <button
                    type="button"
                    role="switch"
                    aria-checked={row.enabled}
                    className="ds-switch"
                    data-state={row.enabled ? 'on' : 'off'}
                    disabled={pending}
                    aria-label={
                      row.enabled ? `Stop delivering to ${row.name}` : `Start delivering to ${row.name}`
                    }
                    onClick={() => onToggle(row.id, !row.enabled)}
                  />
                  <span className="ds-row-actions">
                    <button
                      type="button"
                      className="ds-btn ds-btn--secondary ds-btn--sm"
                      onClick={() => onSendTest(row.id)}
                      disabled={pending}
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      className="ds-btn ds-btn--secondary ds-btn--sm"
                      onClick={() => setConfirming({ row, intent: 'rotate' })}
                      disabled={pending}
                    >
                      Rotate secret
                    </button>
                    <button
                      type="button"
                      className="ds-btn ds-btn--secondary ds-btn--sm"
                      onClick={() => setConfirming({ row, intent: 'remove' })}
                      disabled={pending}
                    >
                      Remove
                    </button>
                  </span>
                  {testResult && testResult.destinationId === row.id && (
                    <span className="ds-row-alert" role="status">
                      {testResult.message}
                    </span>
                  )}
                </Col>
              </Row>
            )
          })}
        </ListCard>
      )}

      {/* ── The delivery log, behind a disclosure ───────────────────────────────────────────────
          ⚠️ **Kept, and moved below the fold rather than deleted.** The approved
          `setup-destinations` state has no delivery table at all — the health it shows lives on the
          rows above. But replaying a dead delivery is a real capability with no other surface, so
          removing the table would remove the capability, which is not what "render from the design
          system" asks for. A disclosure is the honest resolution: the page answers its question
          without scrolling, and the depth is one click away rather than gone. */}
      <details className="ds-disclosure">
        <summary>Recent deliveries — replay one that never arrived</summary>
        <div className="ds-disclosure-body">
          <DataTable
            caption="Recent deliveries"
            columns={deliveryColumns}
            rows={deliveries}
            rowKey={(d) => d.id}
            filterLabel="Filter deliveries"
            empty="No deliveries yet — they appear once an enabled destination matches an incoming event."
          />
        </div>
      </details>

      <Callout>
        Correctly built, wrongly prominent — this used to be a top-level destination in the nav. It is{' '}
        <b>plumbing</b>, and plumbing belongs in Setup.
      </Callout>

      <ConfirmDialog
        open={confirming !== null}
        verb={confirming?.intent === 'rotate' ? 'Rotate' : 'Remove'}
        noun={confirming?.intent === 'rotate' ? 'the signing secret for' : 'destination'}
        subject={confirming?.row.name ?? ''}
        // ⚠️ **Both sentences are carried VERBATIM through the redesign.** They are
        // cross-review-hardened copy that tells an operator what actually stops — the remove one
        // says the secret is gone for good and points at Disable as the reversible alternative,
        // which is the sentence that stops somebody destroying a live integration they only wanted
        // to pause. Rewording them to match a new visual language would trade a real safety property
        // for a stylistic one, which is the trade `flag-console-copy.ts` exists to refuse.
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
    </>
  )
}
