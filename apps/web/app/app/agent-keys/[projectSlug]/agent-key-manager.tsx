'use client'
import { useCallback, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { AgentWriteKeyRow } from '@/lib/agent-write-keys'
import { formatUtc } from '@/lib/format-utc'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Field, FormSection } from '@/components/ui/FormSection'
import { mintAgentKeyAction, revokeAgentKeyAction } from './actions'

// signals-loop · Sprint 3, Story 3.1 — mint / list / revoke UI for agent write keys.
//
// The same shape as ShareManager and KeyManager, for the same reason the data model is shared: an
// operator who has revoked a key already knows how to kill an agent credential. Only the just-minted
// plaintext lives in local state — shown ONCE, never re-fetchable, because only its hash was stored.
//
// app-component-kit-adoption · Sprint 2, Story 2.1 — the SECOND of the two conversions `DataTable`'s
// API was derived from. It is the one that earned the `expires` column's null handling: "until
// revoked" is a real absence of a date, not a blank, and it must not sort as the earliest expiry.
// After this story the API is frozen for the sprint (D3).
//
// The private `formatUtc` copy that used to live here is gone in favour of `lib/format-utc.ts`
// (D11) — same output on every valid timestamp, and UNKNOWN_UTC_TIME instead of a thrown
// RangeError on a malformed one.

// "Until revoked" is offered but is not the default. A write credential that outlives its purpose
// is the one most worth bounding at mint time — a decision made once, rather than a revocation
// someone has to remember.
const EXPIRY_CHOICES: Array<{ label: string; days: number | null }> = [
  { label: '24 hours', days: 1 },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'Until revoked', days: null },
]

export function AgentKeyManager({
  slug,
  keys,
  enabled,
}: {
  slug: string
  keys: AgentWriteKeyRow[]
  enabled: boolean
}) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [expiryDays, setExpiryDays] = useState<number | null>(7)
  const [minted, setMinted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // The ROW awaiting confirmation, not its id: the dialog has to name the specific key, and
  // re-deriving a label from an id at render time is how a dialog asks about the wrong one.
  const [confirming, setConfirming] = useState<AgentWriteKeyRow | null>(null)

  function onMint(event: FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await mintAgentKeyAction(slug, label, expiryDays)
      if (result.ok) {
        setMinted(result.plaintext)
        setLabel('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  // `useCallback` rather than a plain function, so the column memo below can list it honestly
  // instead of suppressing the lint rule: a new function identity every render would rebuild the
  // columns every render and make the memo decorative.
  // app-component-kit-adoption · Sprint 3 — the click opens the question; only Confirm acts. The
  // dialog stays open across the transition so `pending` is reachable and the action cannot fire
  // twice.
  const onRevoke = useCallback(
    (keyId: string) => {
      setError(null)
      startTransition(async () => {
        const { ok } = await revokeAgentKeyAction(slug, keyId)
        if (!ok) setError('Could not revoke that key (already revoked?).')
        setConfirming(null)
        router.refresh()
      })
    },
    [slug, router]
  )

  const columns = useMemo<DataTableColumn<AgentWriteKeyRow>[]>(
    () => [
      { key: 'label', header: 'Label', value: (key) => key.label },
      { key: 'created', header: 'Created', value: (key) => formatUtc(key.createdAt) },
      {
        // The column that shaped `CellValue`'s null case. A key with no expiry has no date — it is
        // not the empty string and it is not the earliest one. Returning null sorts it last in both
        // directions and keeps it out of filter matches, while the cell still renders the em dash
        // this table has always shown.
        key: 'expires',
        header: 'Expires',
        value: (key) => (key.expiresAt ? formatUtc(key.expiresAt) : null),
        cell: (key) => (key.expiresAt ? formatUtc(key.expiresAt) : '—'),
      },
      {
        // Three states, not two. An EXPIRED key is dead but was never revoked, and collapsing it
        // into "active" would tell an operator a credential is live when it is not.
        key: 'status',
        header: 'Status',
        value: (key) => {
          if (key.revokedAt) return `revoked ${formatUtc(key.revokedAt)}`
          return key.expiresAt !== null && new Date(key.expiresAt) <= new Date() ? 'expired' : 'active'
        },
      },
      {
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
      {/* Dark-by-default is a design decision, not an outage — but an owner who mints a key, wires
          it into an agent and watches the write tools never appear has no way to tell those apart.
          Saying so up front is the whole difference. */}
      {!enabled && (
        <p role="status">
          <strong>Agent writes are currently switched off for this deployment.</strong> You can mint keys now,
          but the write tools stay absent from your agent&apos;s tool list until{' '}
          <code>CONNECTOR_WRITES_ENABLED</code> is turned on. Reading tasks already works.
        </p>
      )}

      {minted && (
        <div className="panel" role="alert">
          <strong>Copy this key now — it won&apos;t be shown again:</strong>
          <pre className="panel-code">{minted}</pre>
          <p>
            Give it to your agent as a bearer token: <code>Authorization: Bearer {'<key>'}</code> alongside
            this project&apos;s connector URL. Anyone holding it can move tasks in this project — treat it
            like a password, and revoke it here when the agent is done.
          </p>
          <button type="button" className="btn btn-ghost" onClick={() => setMinted(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <form onSubmit={onMint}>
        <FormSection
          title="Mint an agent write key"
          description="A scoped, revocable credential your agent presents as a bearer token. Anyone holding it can move tasks in this project."
        >
          <Field label="Label" hint="e.g. Claude session, nightly triage bot">
            {(control) => (
              <input {...control} type="text" value={label} onChange={(e) => setLabel(e.target.value)} />
            )}
          </Field>

          <Field
            label="Expires"
            hint="A write credential that outlives its purpose is the one most worth bounding now, rather than revoking later."
          >
            {(control) => (
              <select
                {...control}
                value={expiryDays === null ? '' : String(expiryDays)}
                onChange={(e) => setExpiryDays(e.target.value === '' ? null : Number(e.target.value))}
              >
                {EXPIRY_CHOICES.map((c) => (
                  <option key={c.label} value={c.days === null ? '' : String(c.days)}>
                    {c.label}
                  </option>
                ))}
              </select>
            )}
          </Field>

          <div>
            <button type="submit" className="btn btn-gold" disabled={pending}>
              {pending ? 'Working…' : 'Mint agent write key'}
            </button>
          </div>
        </FormSection>
      </form>

      {error && <p role="status">{error}</p>}

      <DataTable
        caption="Agent write keys"
        columns={columns}
        rows={keys}
        rowKey={(key) => key.id}
        filterLabel="Filter keys"
        empty="No agent write keys yet. Mint one above to let an agent stage task actions on this project."
      />

      <ConfirmDialog
        open={confirming !== null}
        verb="Revoke"
        noun="agent write key"
        subject={confirming?.label ?? ''}
        consequence="The agent holding this key stops being able to stage or apply task actions on its very next call, mid-session if one is running. Revoking cannot be undone — mint a new key and hand it over instead."
        pending={pending}
        onCancel={() => setConfirming(null)}
        onConfirm={() => confirming && onRevoke(confirming.id)}
      />
    </section>
  )
}
