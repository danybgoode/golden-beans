'use client'
import { useCallback, useMemo, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import type { FlagReadKeyRow } from '@/lib/flag-read-keys'
import type { FlagSyncKeyRow } from '@/lib/flag-sync-keys'
import type { FlagEnvironment } from '@/lib/flag-definition'
import type { FlagEnvironmentStateRow, FlagLifecycleAuditRow, FlagRegistryRow } from '@/lib/flag-registry'
import { RuleBuilder } from './rule-builder'
import { FlagInsight } from './flag-insight'
import {
  activateFlagAction,
  createFlagDefinitionVersionAction,
  deactivateFlagAction,
  mintFlagReadKeyAction,
  mintFlagSyncKeyAction,
  revokeFlagReadKeyAction,
  revokeFlagSyncKeyAction,
} from './actions'

const ENVIRONMENTS: FlagEnvironment[] = ['development', 'preview', 'production']
const EXAMPLE = JSON.stringify(
  {
    valueType: 'boolean',
    description: 'Reveal the new product details layout.',
    defaultVariantKey: 'off',
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: true },
    ],
    rules: [
      { priority: 1, clauses: [{ field: 'plan', operator: 'equals', value: 'founding' }], variantKey: 'on' },
    ],
  },
  null,
  2
)

export function FlagManager({
  slug,
  flags,
  environments,
  audit,
  keys,
  syncKeys,
  canManage,
  servingEnabled,
  ruleBuilderEnabled,
}: {
  slug: string
  flags: FlagRegistryRow[]
  environments: FlagEnvironmentStateRow[]
  audit: FlagLifecycleAuditRow[]
  keys: FlagReadKeyRow[]
  syncKeys: FlagSyncKeyRow[]
  canManage: boolean
  servingEnabled: boolean
  /** D6 — the epic's enablement gate, resolved server-side in page.tsx. */
  ruleBuilderEnabled: boolean
}) {
  const router = useRouter()
  const [key, setKey] = useState('new-product-details')
  const [definition, setDefinition] = useState(EXAMPLE)
  const [reason, setReason] = useState('Initial draft for controlled rollout')
  const [keyLabel, setKeyLabel] = useState('local development')
  const [keyEnvironment, setKeyEnvironment] = useState<FlagEnvironment>('development')
  const [minted, setMinted] = useState<string | null>(null)
  const [syncKeyLabel, setSyncKeyLabel] = useState('frontend catalog publisher')
  const [syncKeySource, setSyncKeySource] = useState('frontend')
  const [mintedSync, setMintedSync] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  // Which surface produced `error`. Cross-review (Agy) caught the same message rendering twice —
  // once inside the builder's save section and once in this component's own alert below — because
  // the builder was handed this shared state unconditionally. One failure, two alerts, and a reader
  // checking whether they had made two mistakes. The error still always renders; this only decides
  // which of the two places shows it, so nothing is suppressed (D2).
  const [errorFromBuilder, setErrorFromBuilder] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [confirming, setConfirming] = useState<
    { kind: 'snapshot'; row: FlagReadKeyRow } | { kind: 'sync'; row: FlagSyncKeyRow } | null
  >(null)
  const stateByEnvironment = new Map(environments.map((state) => [state.environment, state]))

  // Stable, so the two revoke callbacks below (and through them the column memos) can list their
  // real dependencies instead of suppressing the exhaustive-deps rule.
  const run = useCallback(
    (work: () => Promise<{ ok: boolean; error?: string }>, success: string, onSettled?: () => void) => {
      setError(null)
      setNotice(null)
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
        // Runs whatever happened, INSIDE the transition. The confirmed revocations below use it to
        // close their dialog, and both parts matter: calling setConfirming(null) after `run()`
        // returns would fire synchronously — `run` only SCHEDULES the transition — so the dialog
        // would vanish the instant Confirm was clicked and its `pending` state would be
        // unreachable, which is precisely the defect cross-review caught on key-manager in PR #82.
        // Putting it after the try/catch also means a thrown action cannot strand the dialog open
        // (the same class Agy raised on agent-keys and destinations in PR #84).
        onSettled?.()
      })
    },
    [router]
  )
  function onCreate(event: FormEvent) {
    event.preventDefault()
    setErrorFromBuilder(false)
    run(
      async () => createFlagDefinitionVersionAction(slug, key, definition, reason),
      `Created ${key} as an immutable draft version.`
    )
  }
  function onActivate(flagId: string, versionId: string, version: number, environment: FlagEnvironment) {
    setErrorFromBuilder(false)
    const revision = stateByEnvironment.get(environment)?.snapshotVersion ?? 0
    run(
      async () => activateFlagAction(slug, environment, flagId, versionId, revision, reason),
      `Activated v${version} in ${environment}.`
    )
  }
  function onDeactivate(flagId: string, environment: FlagEnvironment) {
    setErrorFromBuilder(false)
    const revision = stateByEnvironment.get(environment)?.snapshotVersion ?? 0
    run(
      async () => deactivateFlagAction(slug, environment, flagId, revision, reason),
      `Deactivated the flag in ${environment}.`
    )
  }
  function onMint(event: FormEvent) {
    setErrorFromBuilder(false)
    event.preventDefault()
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await mintFlagReadKeyAction(slug, keyEnvironment, keyLabel, 30)
        if (result.ok) {
          setMinted(result.plaintext)
          setKeyLabel('')
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not mint a flag read key.')
      }
    })
  }
  const onRevoke = useCallback(
    (keyId: string) => {
      setErrorFromBuilder(false)
      run(
        () => revokeFlagReadKeyAction(slug, keyId),
        'Flag read key revoked.',
        () => setConfirming(null)
      )
    },
    [slug, run]
  )
  function onMintSync(event: FormEvent) {
    setErrorFromBuilder(false)
    event.preventDefault()
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await mintFlagSyncKeyAction(slug, syncKeyLabel, syncKeySource, 30)
        if (result.ok) {
          setMintedSync(result.plaintext)
          setSyncKeyLabel('')
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not mint catalog sync key.')
      }
    })
  }
  const onRevokeSync = useCallback(
    (keyId: string) => {
      setErrorFromBuilder(false)
      run(
        () => revokeFlagSyncKeyAction(slug, keyId),
        'Catalog sync key revoked.',
        () => setConfirming(null)
      )
    },
    [slug, run]
  )

  // app-component-kit-adoption · Sprint 2, Story 2.3.
  //
  // THREE of this page's four tables are converted: snapshot keys, catalog sync keys and the
  // lifecycle audit are all flat, variable-length lists — exactly DataTable's case. The DEFINITIONS
  // table is not, and deliberately: it renders one small table PER FLAG, and DataTable's frozen API
  // always shows a filter box, so converting would stack a filter above every flag on the page. Same
  // D3 finding as the experiments manager, logged in sprint-2.md rather than fixed by quietly adding
  // a prop mid-sprint.
  //
  // The flag authoring <textarea> is untouched. Replacing it is flags-visual-rule-builder's entire
  // epic (#15); touching it here would collide with a stacked branch and pre-empt a decision this
  // epic has not made.
  // app-component-kit-adoption · Sprint 3 — both credential revocations confirm. One piece of state
  // for two tables, discriminated by `kind`, so the two dialogs cannot drift apart in wording.
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
              disabled={pending}
              onClick={() => setConfirming({ kind: 'snapshot', row: key })}
            >
              Revoke
            </button>
          ),
      },
    ],
    [pending, statusOf]
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
              disabled={pending}
              onClick={() => setConfirming({ kind: 'sync', row: key })}
            >
              Revoke
            </button>
          ),
      },
    ],
    [pending, statusOf]
  )

  const auditColumns = useMemo<DataTableColumn<FlagLifecycleAuditRow>[]>(
    () => [
      { key: 'when', header: 'When', value: (entry) => formatUtc(entry.createdAt) },
      { key: 'action', header: 'Action', value: (entry) => entry.action },
      {
        key: 'environment',
        header: 'Environment',
        value: (entry) => entry.environment,
        cell: (entry) => entry.environment ?? '—',
      },
      { key: 'reason', header: 'Reason', value: (entry) => entry.reason },
      {
        key: 'actor',
        header: 'Actor',
        value: (entry) =>
          entry.externalActorId ? `${entry.actorUserId} via ${entry.externalActorId}` : entry.actorUserId,
        cell: (entry) => (
          <>
            <code>{entry.actorUserId}</code>
            {entry.externalActorId && (
              <>
                {' '}
                via <code>{entry.externalActorId}</code>
              </>
            )}
          </>
        ),
      },
    ],
    []
  )

  return (
    <section>
      {!servingEnabled && (
        <p role="status">
          <strong>Flag serving is currently switched off.</strong> Definitions and credentials can be
          prepared, but activation and deactivation are unavailable until <code>FLAG_SERVING_ENABLED</code> is
          enabled in a new deployment.
        </p>
      )}
      {canManage ? (
        <>
          {/* flags-visual-rule-builder · Story 1.4 (D6/D7). The builder is ADDITIVE: it renders
              alongside the textarea, never instead of it. With the gate unset this whole block is
              absent and the page below is byte-for-byte what it was before the epic — which is the
              polarity argument in lib/flags.ts made concrete. It posts through the same action the
              textarea does (A1), so there is one write path and one validator. */}
          {ruleBuilderEnabled && (
            <RuleBuilder
              disabled={pending}
              serverError={errorFromBuilder ? error : null}
              onSubmit={(builtKey, builtDefinition, builtReason) => {
                setErrorFromBuilder(true)
                run(
                  async () => createFlagDefinitionVersionAction(slug, builtKey, builtDefinition, builtReason),
                  `Created ${builtKey} as an immutable draft version.`
                )
              }}
            />
          )}
          <form onSubmit={onCreate}>
            <h2>Create an immutable definition version</h2>
            <label htmlFor="flag-key">
              Flag key
              <input id="flag-key" value={key} onChange={(event) => setKey(event.target.value)} required />
            </label>
            <label htmlFor="flag-definition">
              Definition JSON
              <textarea
                id="flag-definition"
                value={definition}
                onChange={(event) => setDefinition(event.target.value)}
                rows={18}
                spellCheck={false}
                required
                // ── This inline style STAYS, and the reason is D6 ─────────────────────────────
                // Sprint 2 briefly swapped it for `.code-input`, the class app-component-kit-adoption
                // wrote for this control and annotated as this sprint's to apply (raised by Agy).
                // Cross-review (Codex, round 2) rejected it, correctly: this textarea renders when
                // FLAG_RULE_BUILDER_ENABLED is OFF, and D6 promises that with the gate off the page
                // is byte-for-byte what it was before the epic. The swap was not even neutral —
                // `.code-input` also sets `white-space: pre`, so long JSON lines would have stopped
                // wrapping. A dark-launch guarantee that holds "except for one class" is not a
                // guarantee. Whoever replaces this control owns the swap.
                style={{ display: 'block', width: '100%', fontFamily: 'monospace' }}
              />
            </label>
            <label htmlFor="flag-reason">
              Reason
              <input
                id="flag-reason"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                maxLength={500}
                required
              />
            </label>
            <button type="submit" disabled={pending}>
              {pending ? 'Working…' : 'Create immutable version'}
            </button>
          </form>
          <form onSubmit={onMint}>
            <h2>Mint a scoped snapshot key</h2>
            <p>A key is bound to exactly one environment, stored only as a hash, and shown once.</p>
            <label htmlFor="flag-key-environment">
              Environment
              <select
                id="flag-key-environment"
                value={keyEnvironment}
                onChange={(event) => setKeyEnvironment(event.target.value as FlagEnvironment)}
              >
                {ENVIRONMENTS.map((environment) => (
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
            <button type="submit" disabled={pending}>
              {pending ? 'Working…' : 'Mint 30-day snapshot key'}
            </button>
          </form>
          <form onSubmit={onMintSync}>
            <h2>Mint a catalog sync key</h2>
            <p>
              Give each service publisher its own key, such as <code>frontend</code> or <code>backend</code>.
              A sync key creates or no-ops immutable drafts only; it can never activate a flag or change a
              snapshot.
            </p>
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
            <button type="submit" disabled={pending}>
              {pending ? 'Working…' : 'Mint 30-day catalog sync key'}
            </button>
          </form>
          {minted && (
            <div role="alert">
              <strong>Copy this snapshot key now — it won&apos;t be shown again:</strong>
              <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{minted}</pre>
              <button type="button" onClick={() => setMinted(null)}>
                I&apos;ve saved it
              </button>
            </div>
          )}
          {mintedSync && (
            <div role="alert">
              <strong>Copy this catalog sync key now — it won&apos;t be shown again:</strong>
              <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{mintedSync}</pre>
              <button type="button" onClick={() => setMintedSync(null)}>
                I&apos;ve saved it
              </button>
            </div>
          )}
        </>
      ) : (
        <p>
          <strong>Read-only access.</strong> A project owner creates versions, manages scoped snapshot and
          catalog sync credentials, and changes environment activations.
        </p>
      )}
      {error && !errorFromBuilder && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
      <h2>Definitions</h2>
      {flags.length === 0 ? (
        <p>No flag definitions yet.</p>
      ) : (
        flags.map((flag) => (
          <article key={flag.id} style={{ margin: '1.5rem 0' }}>
            <h3>
              <code>{flag.key}</code>
            </h3>
            {/* flags-visual-rule-builder · Sprint 2 (Stories 2.1–2.3). Behind the SAME gate as the
                builder, for the same reason D6 gives: with FLAG_RULE_BUILDER_ENABLED unset this
                page is byte-for-byte what it was before the epic. The bars and the diff read
                nothing the table below does not already have — A4, no query added — so this is
                additive to the version table, never a replacement for it. */}
            {ruleBuilderEnabled && <FlagInsight flag={flag} />}
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>Created</th>
                  <th>Definition</th>
                  <th>Environment activation</th>
                </tr>
              </thead>
              <tbody>
                {flag.versions.map((version) => (
                  <tr key={version.id}>
                    <td>v{version.version}</td>
                    <td>
                      {formatUtc(version.createdAt)} by <code>{version.createdBy}</code>
                    </td>
                    <td>
                      <details>
                        <summary>Inspect immutable JSON</summary>
                        <pre>{JSON.stringify(version.definition, null, 2)}</pre>
                      </details>
                    </td>
                    <td>
                      {ENVIRONMENTS.map((environment) => {
                        const active =
                          flag.activations.find((activation) => activation.environment === environment)
                            ?.versionId === version.id
                        const revision = stateByEnvironment.get(environment)?.snapshotVersion ?? 0
                        return (
                          <div key={environment}>
                            <strong>{environment}</strong>:{' '}
                            {active ? `active (snapshot ${revision})` : 'not active'}{' '}
                            {canManage && servingEnabled && (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() =>
                                  active
                                    ? onDeactivate(flag.id, environment)
                                    : onActivate(flag.id, version.id, version.version, environment)
                                }
                              >
                                {active ? 'Deactivate' : `Activate v${version.version}`}
                              </button>
                            )}
                          </div>
                        )
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))
      )}
      {canManage && (
        <>
          <h2>Snapshot keys</h2>
          <DataTable
            caption="Snapshot keys"
            columns={snapshotKeyColumns}
            rows={keys}
            rowKey={(key) => key.id}
            filterLabel="Filter snapshot keys"
            empty="No snapshot keys yet. Mint one above to let a client read this project's flag snapshot."
          />
          <h2>Catalog sync keys</h2>
          <p>
            Each service publisher has a separately revocable credential. These keys create or no-op drafts;
            they never activate a version or change a snapshot.
          </p>
          <DataTable
            caption="Catalog sync keys"
            columns={syncKeyColumns}
            rows={syncKeys}
            rowKey={(key) => key.id}
            filterLabel="Filter sync keys"
            empty="No catalog sync keys yet. Each service publisher gets its own separately revocable credential."
          />
        </>
      )}
      <h2>Lifecycle audit</h2>
      <DataTable
        caption="Lifecycle audit"
        columns={auditColumns}
        rows={audit}
        rowKey={(entry) => entry.id}
        filterLabel="Filter audit"
        empty="No lifecycle actions recorded yet. Activating or deactivating a version in an environment is recorded here."
      />

      <ConfirmDialog
        open={confirming !== null}
        verb="Revoke"
        noun={confirming?.kind === 'sync' ? 'catalog sync key' : 'snapshot key'}
        subject={confirming?.row.label ?? ''}
        consequence={
          confirming?.kind === 'sync'
            ? `Catalog publishes from ${confirming.row.source} start failing on the next sync — flag definitions from that publisher stop reaching this project until someone mints a new key and redeploys it. Revoking cannot be undone.`
            : 'Any client reading the flag snapshot with this key starts getting 401s on its next poll, and falls back to whatever defaults it was built with. Revoking cannot be undone — mint a replacement first if this key is in production.'
        }
        pending={pending}
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
