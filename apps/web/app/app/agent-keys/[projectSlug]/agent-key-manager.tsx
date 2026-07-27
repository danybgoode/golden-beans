'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { AgentWriteKeyRow } from '@/lib/agent-write-keys'
import { mintAgentKeyAction, revokeAgentKeyAction } from './actions'

// signals-loop · Sprint 3, Story 3.1 — mint / list / revoke UI for agent write keys.
//
// The same shape as ShareManager and KeyManager, for the same reason the data model is shared: an
// operator who has revoked a key already knows how to kill an agent credential. Only the just-minted
// plaintext lives in local state — shown ONCE, never re-fetchable, because only its hash was stored.

// Timezone-stable rendering. `toLocaleString()` without a fixed zone formats in the SERVER's zone
// during SSR and the BROWSER's on hydration — a guaranteed hydration mismatch, caught by both
// cross-review families on 2026-07-20.
function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

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

  function onRevoke(keyId: string) {
    setError(null)
    startTransition(async () => {
      const { ok } = await revokeAgentKeyAction(slug, keyId)
      if (!ok) setError('Could not revoke that key (already revoked?).')
      router.refresh()
    })
  }

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
        <div role="alert" style={{ border: '1px solid', padding: '0.75rem', margin: '0.75rem 0' }}>
          <strong>Copy this key now — it won&apos;t be shown again:</strong>
          <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{minted}</pre>
          <p>
            Give it to your agent as a bearer token: <code>Authorization: Bearer {'<key>'}</code> alongside
            this project&apos;s connector URL. Anyone holding it can move tasks in this project — treat it
            like a password, and revoke it here when the agent is done.
          </p>
          <button type="button" onClick={() => setMinted(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <form onSubmit={onMint}>
        {/* Explicit htmlFor/id rather than implicit wrapping (cross-review nit, Agy, PR #38):
            resolves cleanly in the accessibility tree and gives browser tests a stable target. */}
        <label htmlFor="agent-key-label">
          Label
          <input
            id="agent-key-label"
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Claude session, nightly triage bot"
          />
        </label>

        <label htmlFor="agent-key-expiry">
          Expires
          <select
            id="agent-key-expiry"
            value={expiryDays === null ? '' : String(expiryDays)}
            onChange={(e) => setExpiryDays(e.target.value === '' ? null : Number(e.target.value))}
          >
            {EXPIRY_CHOICES.map((c) => (
              <option key={c.label} value={c.days === null ? '' : String(c.days)}>
                {c.label}
              </option>
            ))}
          </select>
        </label>

        <button type="submit" disabled={pending}>
          {pending ? 'Working…' : 'Mint agent write key'}
        </button>
      </form>

      {error && <p role="status">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.length === 0 ? (
            <tr>
              <td colSpan={5}>No agent write keys yet.</td>
            </tr>
          ) : (
            keys.map((key) => {
              const expired = key.expiresAt !== null && new Date(key.expiresAt) <= new Date()
              return (
                <tr key={key.id}>
                  <td>{key.label}</td>
                  <td>{formatUtc(key.createdAt)}</td>
                  <td>{key.expiresAt ? formatUtc(key.expiresAt) : '—'}</td>
                  {/* Three states, not two. An EXPIRED key is dead but was never revoked, and
                      collapsing it into "active" would tell an operator a credential is live when
                      it is not. */}
                  <td>
                    {key.revokedAt ? `revoked ${formatUtc(key.revokedAt)}` : expired ? 'expired' : 'active'}
                  </td>
                  <td>
                    {!key.revokedAt && (
                      <button type="button" onClick={() => onRevoke(key.id)} disabled={pending}>
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
    </section>
  )
}
