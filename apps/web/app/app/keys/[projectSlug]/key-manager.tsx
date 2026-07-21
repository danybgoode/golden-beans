'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import type { ApiKeyRow } from '@/lib/api-keys'
import { issueKeyAction, revokeKeyAction } from './actions'

// multi-tenant-activation · Sprint 1, Story 1.3 — issue / rotate / revoke UI. The key list renders
// straight from the `keys` prop (refreshed by router.refresh() after each mutation, since the
// server actions revalidate the path). Only the just-issued plaintext lives in local state — it's
// shown ONCE and never re-fetchable.
export function KeyManager({ slug, keys }: { slug: string; keys: ApiKeyRow[] }) {
  const router = useRouter()
  const [label, setLabel] = useState('')
  const [issued, setIssued] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onIssue(event: FormEvent) {
    event.preventDefault()
    setError(null)
    const desired = label
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

  function onRevoke(keyId: string) {
    setError(null)
    startTransition(async () => {
      const { ok } = await revokeKeyAction(slug, keyId)
      if (!ok) setError('Could not revoke that key (already revoked?).')
      router.refresh()
    })
  }

  return (
    <section>
      {issued && (
        <div role="alert" style={{ border: '1px solid', padding: '0.75rem', margin: '0.75rem 0' }}>
          <strong>Copy your new key now — it won&apos;t be shown again:</strong>
          <pre>{issued}</pre>
          <button type="button" onClick={() => setIssued(null)}>
            I&apos;ve saved it
          </button>
        </div>
      )}

      <form onSubmit={onIssue}>
        <label>
          New key label
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. production, ci, rotated-2026-07"
          />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Working…' : 'Issue key'}
        </button>
      </form>

      {error && <p role="status">{error}</p>}

      <table>
        <thead>
          <tr>
            <th>Label</th>
            <th>Created</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {keys.length === 0 ? (
            <tr>
              <td colSpan={4}>No keys yet — issue one above.</td>
            </tr>
          ) : (
            keys.map((key) => (
              <tr key={key.id}>
                <td>{key.label}</td>
                <td>{new Date(key.createdAt).toLocaleString('en-US')}</td>
                <td>{key.revokedAt ? `revoked ${new Date(key.revokedAt).toLocaleDateString('en-US')}` : 'active'}</td>
                <td>
                  {!key.revokedAt && (
                    <button type="button" onClick={() => onRevoke(key.id)} disabled={pending}>
                      Revoke
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </section>
  )
}
