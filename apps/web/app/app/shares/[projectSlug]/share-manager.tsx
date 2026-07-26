'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ShareRow } from '@/lib/report-shares'
import { POD_REPORT_LENSES, lensPolicy, type PodReportLens } from '@/lib/pod-report-lens'
import { mintShareAction, revokeShareAction } from './actions'

// pod-report · Sprint 3, Story 3.1 — mint / list / revoke UI for share links.
//
// The same shape as KeyManager next door, for the same reason the data model is shared: an operator
// who has revoked a key already knows how to kill a link. Only the just-minted URL lives in local
// state — shown ONCE, never re-fetchable, because only its hash was stored.

// Timezone-stable rendering. `toLocaleString()` without a fixed zone formats in the SERVER's zone
// during SSR and the BROWSER's on hydration — a guaranteed hydration mismatch, caught by both
// cross-review families on 2026-07-20.
function formatUtc(iso: string): string {
  return `${new Date(iso).toISOString().slice(0, 16).replace('T', ' ')} UTC`
}

const EXPIRY_CHOICES: Array<{ label: string; days: number | null }> = [
  { label: 'Until revoked', days: null },
  { label: '7 days', days: 7 },
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
]

export function ShareManager({
  slug,
  shares,
  enabled,
}: {
  slug: string
  shares: ShareRow[]
  enabled: boolean
}) {
  const router = useRouter()
  const [lens, setLens] = useState<PodReportLens>('investor')
  const [label, setLabel] = useState('')
  const [expiryDays, setExpiryDays] = useState<number | null>(null)
  const [minted, setMinted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onMint(event: FormEvent) {
    event.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await mintShareAction(slug, lens, label, expiryDays)
      if (result.ok) {
        setMinted(result.url)
        setLabel('')
        router.refresh()
      } else {
        setError(result.error)
      }
    })
  }

  function onRevoke(shareId: string) {
    setError(null)
    startTransition(async () => {
      const { ok } = await revokeShareAction(slug, shareId)
      if (!ok) setError('Could not revoke that link (already revoked?).')
      router.refresh()
    })
  }

  return (
    <section>
      {/* Dark-by-default is a design decision, not an outage — but an owner who mints a link, opens
          it and gets a 404 has no way to tell those apart. Saying so up front is the whole
          difference. */}
      {!enabled && (
        <p role="status">
          <strong>Share links are currently switched off for this deployment.</strong> You can mint
          links now, but they will return 404 until <code>REPORT_SHARES_ENABLED</code> is turned on.
        </p>
      )}

      {minted && (
        <div role="alert" style={{ border: '1px solid', padding: '0.75rem', margin: '0.75rem 0' }}>
          <strong>Copy this link now — it won&apos;t be shown again:</strong>
          <pre style={{ overflowWrap: 'anywhere', whiteSpace: 'pre-wrap' }}>{minted}</pre>
          <p>
            Anyone with this URL can read the report through the <b>{lens}</b> lens. There is no
            password on it — revoke it here when the conversation is over.
          </p>
          <button type="button" onClick={() => setMinted(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <form onSubmit={onMint}>
        <fieldset>
          <legend>Audience</legend>
          {POD_REPORT_LENSES.map((l) => (
            <label key={l} style={{ display: 'block' }}>
              <input
                type="radio"
                name="lens"
                value={l}
                checked={lens === l}
                onChange={() => setLens(l)}
              />{' '}
              <b>{l}</b> — {lensPolicy(l).audienceNote}
            </label>
          ))}
        </fieldset>

        <label>
          Label
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Series-A data room, Acme quarterly review"
          />
        </label>

        <label>
          Expires
          <select
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
          {pending ? 'Working…' : 'Mint share link'}
        </button>
      </form>

      {error && <p role="status">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Lens</th>
            <th>Created</th>
            <th>Expires</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {shares.length === 0 ? (
            <tr>
              <td colSpan={6}>No share links yet.</td>
            </tr>
          ) : (
            shares.map((share) => {
              const expired = share.expiresAt !== null && new Date(share.expiresAt) <= new Date()
              return (
                <tr key={share.id}>
                  <td>{share.label}</td>
                  <td>{share.lens}</td>
                  <td>{formatUtc(share.createdAt)}</td>
                  <td>{share.expiresAt ? formatUtc(share.expiresAt) : '—'}</td>
                  {/* Three states, not two. An EXPIRED link is dead but was never revoked, and
                      collapsing it into "active" would tell an operator a link is live when it is
                      not — the same class of mistake as a broken read rendering as an empty one. */}
                  <td>
                    {share.revokedAt
                      ? `revoked ${formatUtc(share.revokedAt)}`
                      : expired
                        ? 'expired'
                        : 'active'}
                  </td>
                  <td>
                    {!share.revokedAt && (
                      <button type="button" onClick={() => onRevoke(share.id)} disabled={pending}>
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
