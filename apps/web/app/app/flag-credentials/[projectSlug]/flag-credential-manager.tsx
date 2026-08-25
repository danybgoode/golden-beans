'use client'
// flags-console-parity · Sprint 3, Story 3.1 — both key tables and both minting forms, MOVED.
//
// ── Moved, not rewritten ──────────────────────────────────────────────────────────────────────
// The columns, the status derivation, the mint flows and the two revoke confirmations all come from
// `flag-manager.tsx` unchanged. The consequence sentences in particular are load-bearing and
// cross-review-hardened, so they are now imported from `lib/flag-console-copy.ts` rather than
// retyped — "verbatim" and "a second copy" cannot both survive contact with time.
//
// ── One write path (D1) ───────────────────────────────────────────────────────────────────────
// The same four server actions the flags page uses. Each re-resolves ownership server-side, so this
// component grants no authority; the route already 404s a non-owner before any of this renders.

import { useCallback, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { describeRevokeSyncKey, REVOKE_SNAPSHOT_KEY_CONSEQUENCE } from '@/lib/flag-console-copy'
import type { FlagReadKeyRow } from '@/lib/flag-read-keys'
import type { FlagSyncKeyRow } from '@/lib/flag-sync-keys'
import { FLAG_ENVIRONMENTS, type FlagEnvironment } from '@/lib/flag-definition'
import {
  mintFlagReadKeyAction,
  mintFlagSyncKeyAction,
  revokeFlagReadKeyAction,
  revokeFlagSyncKeyAction,
} from '../../flags/[projectSlug]/actions'

export function FlagCredentialManager({
  slug,
  keys,
  syncKeys,
}: {
  slug: string
  keys: FlagReadKeyRow[]
  syncKeys: FlagSyncKeyRow[]
}) {
  const router = useRouter()
  const [keyLabel, setKeyLabel] = useState('local development')
  const [keyEnvironment, setKeyEnvironment] = useState<FlagEnvironment>('development')
  const [minted, setMinted] = useState<string | null>(null)
  const [syncKeyLabel, setSyncKeyLabel] = useState('frontend catalog publisher')
  const [syncKeySource, setSyncKeySource] = useState('frontend')
  const [mintedSync, setMintedSync] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  // React 18's `isPending` clears before an async transition callback's first await resolves
  // (see flag-switch.tsx for the full note), so minting and revoking hold their own flag. Minting
  // twice would issue a second live credential; revoking twice renders a spurious failure over a
  // revocation that already succeeded.
  const [busy, setBusy] = useState(false)
  const inFlight = busy || pending
  const [confirming, setConfirming] = useState<
    { kind: 'snapshot'; row: FlagReadKeyRow } | { kind: 'sync'; row: FlagSyncKeyRow } | null
  >(null)

  const run = useCallback(
    (work: () => Promise<{ ok: boolean; error?: string }>, success: string, onSettled?: () => void) => {
      setError(null)
      setNotice(null)
      setBusy(true)
      startTransition(async () => {
        try {
          const result = await work()
          if (result.ok) {
            setNotice(success)
            router.refresh()
          } else setError(result.error ?? 'The change could not be applied.')
        } catch {
          setError('The change could not be applied. Try again.')
        }
        setBusy(false)
        onSettled?.()
      })
    },
    [router]
  )

  const onRevoke = useCallback(
    (keyId: string) =>
      run(
        () => revokeFlagReadKeyAction(slug, keyId),
        'Snapshot key revoked.',
        () => setConfirming(null)
      ),
    [slug, run]
  )
  const onRevokeSync = useCallback(
    (keyId: string) =>
      run(
        () => revokeFlagSyncKeyAction(slug, keyId),
        'Catalog sync key revoked.',
        () => setConfirming(null)
      ),
    [slug, run]
  )

  function onMint(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const result = await mintFlagReadKeyAction(slug, keyEnvironment, keyLabel, 30)
        if (result.ok) {
          setMinted(result.plaintext)
          setKeyLabel('')
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not mint a snapshot key.')
      }
      setBusy(false)
    })
  }

  function onMintSync(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    setBusy(true)
    startTransition(async () => {
      try {
        const result = await mintFlagSyncKeyAction(slug, syncKeyLabel, syncKeySource, 30)
        if (result.ok) {
          setMintedSync(result.plaintext)
          setSyncKeyLabel('')
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not mint a catalog sync key.')
      }
      setBusy(false)
    })
  }

  const statusOf = useCallback((key: { revokedAt: string | null; expiresAt: string | null }) => {
    if (key.revokedAt) return `revoked ${formatUtc(key.revokedAt)}`
    return key.expiresAt !== null && new Date(key.expiresAt) <= new Date() ? 'expired' : 'active'
  }, [])

  const snapshotKeyColumns = useMemo<DataTableColumn<FlagReadKeyRow>[]>(
    () => [
      { key: 'label', header: 'Label', value: (key) => key.label },
      { key: 'environment', header: 'Environment', value: (key) => key.environment },
      { key: 'created', header: 'Created', value: (key) => formatUtc(key.createdAt) },
      {
        key: 'expires',
        header: 'Expires',
        value: (key) => (key.expiresAt ? formatUtc(key.expiresAt) : null),
        cell: (key) => (key.expiresAt ? formatUtc(key.expiresAt) : '—'),
      },
      { key: 'status', header: 'Status', value: statusOf },
      {
        key: 'actions',
        header: 'Actions',
        cell: (key) =>
          key.revokedAt ? null : (
            <button
              type="button"
              disabled={inFlight}
              onClick={() => setConfirming({ kind: 'snapshot', row: key })}
            >
              Revoke
            </button>
          ),
      },
    ],
    [inFlight, statusOf]
  )

  const syncKeyColumns = useMemo<DataTableColumn<FlagSyncKeyRow>[]>(
    () => [
      { key: 'label', header: 'Label', value: (key) => key.label },
      {
        key: 'source',
        header: 'Source',
        value: (key) => key.source,
        cell: (key) => <code>{key.source}</code>,
      },
      { key: 'created', header: 'Created', value: (key) => formatUtc(key.createdAt) },
      {
        key: 'expires',
        header: 'Expires',
        value: (key) => (key.expiresAt ? formatUtc(key.expiresAt) : null),
        cell: (key) => (key.expiresAt ? formatUtc(key.expiresAt) : '—'),
      },
      { key: 'status', header: 'Status', value: statusOf },
      {
        key: 'actions',
        header: 'Actions',
        cell: (key) =>
          key.revokedAt ? null : (
            <button
              type="button"
              disabled={inFlight}
              onClick={() => setConfirming({ kind: 'sync', row: key })}
            >
              Revoke
            </button>
          ),
      },
    ],
    [inFlight, statusOf]
  )

  return (
    <section>
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <h2>Snapshot keys</h2>
      <DataTable
        caption="Snapshot keys"
        columns={snapshotKeyColumns}
        rows={keys}
        rowKey={(key) => key.id}
        filterLabel="Filter snapshot keys"
        empty="No snapshot keys yet. Mint one below to let a client read this project's flags."
      />
      <form onSubmit={onMint}>
        <h3>Mint a snapshot key</h3>
        <p>A key is bound to exactly one environment, stored only as a hash, and shown once.</p>
        <label htmlFor="flag-key-environment">
          Environment
          <select
            id="flag-key-environment"
            value={keyEnvironment}
            onChange={(event) => setKeyEnvironment(event.target.value as FlagEnvironment)}
          >
            {FLAG_ENVIRONMENTS.map((environment) => (
              <option key={environment}>{environment}</option>
            ))}
          </select>
        </label>
        <label htmlFor="flag-key-label">
          Label
          <input
            id="flag-key-label"
            value={keyLabel}
            onChange={(event) => setKeyLabel(event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <button type="submit" disabled={inFlight}>
          {inFlight ? 'Working…' : 'Mint 30-day snapshot key'}
        </button>
      </form>

      <h2>Catalog sync keys</h2>
      <p>
        Give each service publisher its own key, such as <code>frontend</code> or <code>backend</code>. A sync
        key creates or no-ops definition drafts only; it can never turn a feature on or off.
      </p>
      <DataTable
        caption="Catalog sync keys"
        columns={syncKeyColumns}
        rows={syncKeys}
        rowKey={(key) => key.id}
        filterLabel="Filter sync keys"
        empty="No catalog sync keys yet. Each service publisher gets its own separately revocable credential."
      />
      <form onSubmit={onMintSync}>
        <h3>Mint a catalog sync key</h3>
        <label htmlFor="flag-sync-source">
          Publisher source
          <input
            id="flag-sync-source"
            value={syncKeySource}
            onChange={(event) => setSyncKeySource(event.target.value)}
            pattern="[a-z][a-z0-9_-]{0,63}"
            maxLength={64}
            required
          />
        </label>
        <label htmlFor="flag-sync-label">
          Label
          <input
            id="flag-sync-label"
            value={syncKeyLabel}
            onChange={(event) => setSyncKeyLabel(event.target.value)}
            maxLength={120}
            required
          />
        </label>
        <button type="submit" disabled={inFlight}>
          {inFlight ? 'Working…' : 'Mint 30-day catalog sync key'}
        </button>
      </form>

      {/* Shown once, never again — the plaintext is not stored. Same treatment as the flags page. */}
      {minted && (
        <div role="alert">
          <strong>Copy this snapshot key now — it won&apos;t be shown again:</strong>
          <pre className="copy-url">{minted}</pre>
          <button type="button" onClick={() => setMinted(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}
      {mintedSync && (
        <div role="alert">
          <strong>Copy this catalog sync key now — it won&apos;t be shown again:</strong>
          <pre className="copy-url">{mintedSync}</pre>
          <button type="button" onClick={() => setMintedSync(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <ConfirmDialog
        open={confirming !== null}
        verb="Revoke"
        noun={confirming?.kind === 'sync' ? 'catalog sync key' : 'snapshot key'}
        subject={confirming?.row.label ?? ''}
        // VERBATIM, from the one module that owns these sentences — see flag-console-copy.ts.
        consequence={
          confirming?.kind === 'sync'
            ? describeRevokeSyncKey(confirming.row.source)
            : REVOKE_SNAPSHOT_KEY_CONSEQUENCE
        }
        pending={inFlight}
        onCancel={() => setConfirming(null)}
        onConfirm={() => {
          if (!confirming) return
          if (confirming.kind === 'sync') onRevokeSync(confirming.row.id)
          else onRevoke(confirming.row.id)
        }}
      />
    </section>
  )
}
