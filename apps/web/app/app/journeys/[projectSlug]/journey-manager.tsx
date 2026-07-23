'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import type { JourneyRegistryRow } from '@/lib/journeys'
import { canActivateJourneyVersion } from '@/lib/journey-registry-view'
import { activateJourneyVersionAction, createJourneyVersionAction } from './actions'

const EXAMPLE = JSON.stringify(
  {
    entityType: 'merchant',
    description: 'Founding merchant activation',
    stages: [
      { key: 'signed_up', event: 'merchant_signed_up', tags: { source: 'organic' } },
      { key: 'published', event: 'store_published', tags: { plan: 'founding' } },
    ],
    cohortEntry: { stageKey: 'signed_up' },
    retention: { stageKey: 'published', anchorStageKey: 'signed_up', withinDays: 30 },
  },
  null,
  2,
)

export function JourneyManager({
  slug,
  journeys,
  canManage,
}: {
  slug: string
  journeys: JourneyRegistryRow[]
  canManage: boolean
}) {
  const router = useRouter()
  const [key, setKey] = useState('merchant_activation')
  const [definition, setDefinition] = useState(EXAMPLE)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function onCreate(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await createJourneyVersionAction(slug, key, definition)
        if (result.ok) {
          setNotice(`Created ${key} version ${result.version} as a draft.`)
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not create this journey version. Try again.')
      }
    })
  }

  function onActivate(journeyId: string, versionId: string, version: number) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await activateJourneyVersionAction(slug, journeyId, versionId)
        if (result.ok) {
          setNotice(`Activated version ${version}.`)
          router.refresh()
        } else setError(result.error ?? 'Could not activate this version.')
      } catch {
        setError('Could not activate this version. Try again.')
      }
    })
  }

  return (
    <section>
      {canManage ? (
        <form onSubmit={onCreate}>
          <h2>Create a draft version</h2>
          <p>
            Reuse an existing journey key to create its next immutable version. Activation is a
            separate audited action.
          </p>
          <label>
            Journey key
            <input value={key} onChange={(event) => setKey(event.target.value)} required />
          </label>
          <label>
            Definition JSON
            <textarea
              value={definition}
              onChange={(event) => setDefinition(event.target.value)}
              rows={18}
              spellCheck={false}
              required
              style={{ display: 'block', width: '100%', fontFamily: 'monospace' }}
            />
          </label>
          <button type="submit" disabled={pending}>{pending ? 'Working…' : 'Create draft'}</button>
        </form>
      ) : (
        <p><strong>Read-only access.</strong> A project owner manages journey definitions.</p>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <h2>Definitions</h2>
      {journeys.length === 0 ? (
        <p>No journey definitions yet.</p>
      ) : (
        journeys.map((journey) => (
          <article key={journey.id} style={{ margin: '1.5rem 0' }}>
            <h3><code>{journey.key}</code></h3>
            {journey.activeVersionId && (
              <p><a href={`/app/journeys/${encodeURIComponent(slug)}/${encodeURIComponent(journey.key)}`}>Open active cohort</a></p>
            )}
            <table>
              <thead><tr><th>Version</th><th>State</th><th>Created</th><th>Activated</th><th /></tr></thead>
              <tbody>
                {journey.versions.map((version) => (
                  <tr key={version.id}>
                    <td>v{version.version}</td>
                    <td>{version.state}</td>
                    <td>{formatUtc(version.createdAt)} by <code>{version.createdBy}</code></td>
                    <td>
                      {version.activatedAt
                        ? <>{formatUtc(version.activatedAt)} by <code>{version.activatedBy}</code></>
                        : '—'}
                    </td>
                    <td>
                      <details>
                        <summary>Definition</summary>
                        <pre>{JSON.stringify(version.definition, null, 2)}</pre>
                      </details>
                      {canManage && canActivateJourneyVersion(journey, version) && (
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => onActivate(journey.id, version.id, version.version)}
                        >
                          Activate v{version.version}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </article>
        ))
      )}
    </section>
  )
}
