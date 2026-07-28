'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import type { FlagReadKeyRow } from '@/lib/flag-read-keys'
import type { FlagEnvironment } from '@/lib/flag-definition'
import type { FlagEnvironmentStateRow, FlagLifecycleAuditRow, FlagRegistryRow } from '@/lib/flag-registry'
import {
  activateFlagAction,
  createFlagDefinitionVersionAction,
  deactivateFlagAction,
  mintFlagReadKeyAction,
  revokeFlagReadKeyAction,
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
  canManage,
  servingEnabled,
}: {
  slug: string
  flags: FlagRegistryRow[]
  environments: FlagEnvironmentStateRow[]
  audit: FlagLifecycleAuditRow[]
  keys: FlagReadKeyRow[]
  canManage: boolean
  servingEnabled: boolean
}) {
  const router = useRouter()
  const [key, setKey] = useState('new-product-details')
  const [definition, setDefinition] = useState(EXAMPLE)
  const [reason, setReason] = useState('Initial draft for controlled rollout')
  const [keyLabel, setKeyLabel] = useState('local development')
  const [keyEnvironment, setKeyEnvironment] = useState<FlagEnvironment>('development')
  const [minted, setMinted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const stateByEnvironment = new Map(environments.map((state) => [state.environment, state]))

  function run(work: () => Promise<{ ok: boolean; error?: string }>, success: string) {
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
    })
  }
  function onCreate(event: FormEvent) {
    event.preventDefault()
    run(
      async () => createFlagDefinitionVersionAction(slug, key, definition, reason),
      `Created ${key} as an immutable draft version.`
    )
  }
  function onActivate(flagId: string, versionId: string, version: number, environment: FlagEnvironment) {
    const revision = stateByEnvironment.get(environment)?.snapshotVersion ?? 0
    run(
      async () => activateFlagAction(slug, environment, flagId, versionId, revision, reason),
      `Activated v${version} in ${environment}.`
    )
  }
  function onDeactivate(flagId: string, environment: FlagEnvironment) {
    const revision = stateByEnvironment.get(environment)?.snapshotVersion ?? 0
    run(
      async () => deactivateFlagAction(slug, environment, flagId, revision, reason),
      `Deactivated the flag in ${environment}.`
    )
  }
  function onMint(event: FormEvent) {
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
  function onRevoke(keyId: string) {
    run(() => revokeFlagReadKeyAction(slug, keyId), 'Flag read key revoked.')
  }

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
          {minted && (
            <div role="alert">
              <strong>Copy this snapshot key now — it won&apos;t be shown again:</strong>
              <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{minted}</pre>
              <button type="button" onClick={() => setMinted(null)}>
                I&apos;ve saved it
              </button>
            </div>
          )}
        </>
      ) : (
        <p>
          <strong>Read-only access.</strong> A project owner creates versions, manages scoped snapshot
          credentials, and changes environment activations.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
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
          <table>
            <thead>
              <tr>
                <th>Label</th>
                <th>Environment</th>
                <th>Created</th>
                <th>Expires</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={6}>No snapshot keys yet.</td>
                </tr>
              ) : (
                keys.map((key) => {
                  const expired = key.expiresAt !== null && new Date(key.expiresAt) <= new Date()
                  return (
                    <tr key={key.id}>
                      <td>{key.label}</td>
                      <td>{key.environment}</td>
                      <td>{formatUtc(key.createdAt)}</td>
                      <td>{key.expiresAt ? formatUtc(key.expiresAt) : '—'}</td>
                      <td>
                        {key.revokedAt
                          ? `revoked ${formatUtc(key.revokedAt)}`
                          : expired
                            ? 'expired'
                            : 'active'}
                      </td>
                      <td>
                        {!key.revokedAt && (
                          <button type="button" disabled={pending} onClick={() => onRevoke(key.id)}>
                            Revoke
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </>
      )}
      <h2>Lifecycle audit</h2>
      {audit.length === 0 ? (
        <p>No lifecycle actions recorded yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Action</th>
              <th>Environment</th>
              <th>Reason</th>
              <th>Actor</th>
            </tr>
          </thead>
          <tbody>
            {audit.map((entry) => (
              <tr key={entry.id}>
                <td>{formatUtc(entry.createdAt)}</td>
                <td>{entry.action}</td>
                <td>{entry.environment ?? '—'}</td>
                <td>{entry.reason}</td>
                <td>
                  <code>{entry.actorUserId}</code>
                  {entry.externalActorId && (
                    <>
                      {' '}
                      via <code>{entry.externalActorId}</code>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
