'use client'
import { useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ApiKeyRow } from '@/lib/api-keys'
import { formatUtc } from '@/lib/format-utc'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Field, FormSection } from '@/components/ui/FormSection'
import { issueKeyAction, revokeKeyAction } from './actions'

// multi-tenant-activation · Sprint 1, Story 1.3 — issue / rotate / revoke UI. The key list renders
// straight from the `keys` prop (refreshed by router.refresh() after each mutation, since the
// server actions revalidate the path). Only the just-issued plaintext lives in local state — it's
// shown ONCE and never re-fetchable.
//
// app-component-kit-adoption · Sprint 1, Stories 1.2 + 1.3 — this file is the PROOF OF USE for
// `ConfirmDialog` and `FormSection`/`Field`. Two downstream epics consume both from `main`, so the
// APIs are validated by a real caller before anything depends on them. The key TABLE is not
// converted here; that is Sprint 2, Story 2.1.
//
// The private four-line `formatUtc` copy that used to live here is gone in favour of
// `lib/format-utc.ts` (D11). Same output on every valid timestamp; the seam additionally returns
// UNKNOWN_UTC_TIME where the copy threw a RangeError.

export function KeyManager({ slug, keys }: { slug: string; keys: ApiKeyRow[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [fieldError, setFieldError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  // The key awaiting confirmation, held as the ROW rather than the id: the dialog has to name the
  // specific key, and re-deriving the label from an id at render time is how a dialog ends up
  // asking about the wrong one after a refresh.
  const [confirming, setConfirming] = useState<ApiKeyRow | null>(null)

  function onIssue(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const desired = label.trim()
    // Client-side, so the reader sees the error against the field. The server action remains the
    // authority — this only saves a round-trip, it does not replace a check.
    if (desired === '') {
      setFieldError('Give the key a label so you can tell it apart from the others later.')
      return
    }
    setFieldError(null)
    startTransition(async () => {
      const result = await issueKeyAction(slug, desired)
      if (result.ok) {
        setIssued(result.plaintext)
        setLabel('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function onRevoke(key: ApiKeyRow) {
    setError(null)
    // The dialog stays OPEN across the transition and closes when the action settles. Clearing
    // `confirming` first (as this did) hid the dialog the instant Confirm was clicked, which made
    // its `pending` state unreachable — the "Working…" label could never render, and the window
    // between click and result was a silent no-op, the exact thing ux-guidelines names as a state
    // we must never ship. Keeping it open also means the confirm button is `disabled` for that
    // window, so the action cannot be fired twice. (Cross-review, Agy, PR #82.)
    startTransition(async () => {
      // Same shape as every other confirmed action: the close sits after the try/catch, so a thrown
      // action cannot leave the dialog open and unanswerable. Agy raised this on agent-keys and
      // destinations in PR #84; it was true here too, from Sprint 1.
      try {
        const { ok } = await revokeKeyAction(slug, key.id)
        if (!ok) setError('Could not revoke that key (already revoked?).')
      } catch {
        setError('Could not revoke that key. It is still active.')
      }
      setConfirming(null)
      router.refresh()
    })
  }

  // Memoised so `DataTable`'s sort/filter memo is a real cache rather than a per-render recompute:
  // an inline array is a new identity every render. Cheap here, and the pattern the remaining
  // conversions copy.
  //
  // Each column's `value` is the string the reader actually SEES, not the underlying field. That
  // makes "what I typed into the filter" and "what is on screen" the same thing — filtering for
  // `07-01` finds the row whose Created cell reads `2026-07-01 …`. For these columns it also keeps
  // the sort honest: an ISO-derived `YYYY-MM-DD HH:MM UTC` string sorts lexicographically in
  // chronological order.
  const columns = useMemo<DataTableColumn<ApiKeyRow>[]>(
    () => [
      { key: 'label', header: 'Label', value: (key) => key.label },
      { key: 'created', header: 'Created', value: (key) => formatUtc(key.createdAt) },
      {
        key: 'status',
        header: 'Status',
        value: (key) => (key.revokedAt ? `revoked ${formatUtc(key.revokedAt)}` : 'active'),
      },
      {
        // No `value`: the actions column is neither sortable nor searchable, and omitting the
        // accessor is how that is expressed (DataTable, D3).
        key: 'actions',
        header: 'Actions',
        cell: (key) =>
          key.revokedAt ? null : (
            <button type="button" onClick={() => setConfirming(key)} disabled={pending}>
              Revoke
            </button>
          ),
      },
    ],
    [pending]
  )

  return (
    <section>
      {issued && (
        <div className="panel" role="alert">
          <strong>Copy your new key now — it won&apos;t be shown again:</strong>
          <pre className="panel-code">{issued}</pre>
          <button type="button" className="btn btn-ghost" onClick={() => setIssued(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <form onSubmit={onIssue}>
        <FormSection
          title="Issue a key"
          description={
            <>
              One key per integration. The plaintext is shown once, at issue time, and is never recoverable
              afterwards — only its hash is stored.
            </>
          }
        >
          <Field label="New key label" hint="e.g. production, ci, rotated-2026-07" error={fieldError}>
            {(control) => (
              <input
                {...control}
                type="text"
                value={label}
                onChange={(e) => {
                  setLabel(e.target.value)
                  if (fieldError) setFieldError(null)
                }}
              />
            )}
          </Field>
          <div>
            <button type="submit" className="btn btn-gold" disabled={pending}>
              {pending ? 'Working…' : 'Issue key'}
            </button>
          </div>
        </FormSection>
      </form>

      {error && <p role="status">{error}</p>}

      <DataTable
        caption="API keys"
        columns={columns}
        rows={keys}
        rowKey={(key) => key.id}
        filterLabel="Filter keys"
        empty="No keys yet — issue one above. Until you do, the SDK and POST /api/v1/track have nothing to authenticate with."
      />

      {/*
        The click no longer revokes — it opens the question. `onCancel` closes and does nothing
        else: there is exactly ONE call site of revokeKeyAction in this file and it is inside
        onRevoke, which only the confirm button reaches. That is the property
        design-system.authed.spec.ts asserts, and the mutation it was observed failing under.
      */}
      <ConfirmDialog
        open={confirming !== null}
        verb="Revoke"
        noun="key"
        subject={confirming?.label ?? ''}
        consequence="Anything still using this key — the SDK, POST /api/v1/track, a CI job — starts getting 401s on its next request. Revoking cannot be undone; issue a new key instead."
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && onRevoke(confirming)}
      />
    </section>
  )
}
