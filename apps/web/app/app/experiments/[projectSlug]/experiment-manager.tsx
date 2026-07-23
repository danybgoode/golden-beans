'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import {
  allowedExperimentTargets,
} from '@/lib/experiment-registry-view'
import type {
  ExperimentRegistryRow,
  ExperimentTransitionTarget,
} from '@/lib/experiments'
import {
  createExperimentVersionAction,
  transitionExperimentVersionAction,
} from './actions'

const EXAMPLE = JSON.stringify({
  hypothesis: 'A clearer founding-store promise increases completed applications.',
  assignmentEntityType: 'merchant',
  eligibility: {
    description: 'Consented founding-store applicants in Mexico.',
    tags: { region: 'mx', plan: 'founding' },
  },
  variants: [
    { key: 'control', weight: 1 },
    { key: 'new-copy', weight: 1 },
  ],
  controlVariantKey: 'control',
  primaryMetric: { event: 'founding_application_completed', direction: 'increase' },
  guardrailMetrics: [{ event: 'founding_application_abandoned', direction: 'decrease' }],
  segmentFields: ['source', 'channel', 'region'],
  plannedWindow: {
    startAt: '2026-07-01T00:00:00Z',
    endAt: '2026-08-01T00:00:00Z',
  },
  minimumSamplePerVariant: 100,
}, null, 2)

const TARGET_LABEL: Record<ExperimentTransitionTarget, string> = {
  running: 'Start',
  stopped: 'Stop',
  invalid: 'Mark invalid',
}

export function ExperimentManager({
  slug,
  experiments,
  canManage,
}: {
  slug: string
  experiments: ExperimentRegistryRow[]
  canManage: boolean
}) {
  const router = useRouter()
  const [key, setKey] = useState('founding-message-v2')
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
        const result = await createExperimentVersionAction(slug, key, definition)
        if (result.ok) {
          setNotice(`Created ${key} version ${result.version} as a draft.`)
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not create this experiment version. Try again.')
      }
    })
  }

  function onTransition(
    experimentId: string,
    versionId: string,
    version: number,
    target: ExperimentTransitionTarget,
  ) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await transitionExperimentVersionAction(
          slug,
          experimentId,
          versionId,
          target,
        )
        if (result.ok) {
          setNotice(
            result.changed
              ? `Version ${version} is now ${result.status}.`
              : `Version ${version} was already ${result.status}.`,
          )
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not change this experiment lifecycle. Try again.')
      }
    })
  }

  return (
    <section>
      {canManage ? (
        <form onSubmit={onCreate}>
          <h2>Create a draft version</h2>
          <p>
            Plans are immutable. Reuse a stable key to create the next version; starting and
            stopping are separate audited actions.
          </p>
          <label>
            Experiment key
            <input value={key} onChange={(event) => setKey(event.target.value)} required />
          </label>
          <label>
            Definition JSON
            <textarea
              value={definition}
              onChange={(event) => setDefinition(event.target.value)}
              rows={24}
              spellCheck={false}
              required
              style={{ display: 'block', width: '100%', fontFamily: 'monospace' }}
            />
          </label>
          <button type="submit" disabled={pending}>{pending ? 'Working…' : 'Create draft'}</button>
        </form>
      ) : (
        <p><strong>Read-only access.</strong> A project owner manages experiment plans.</p>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <h2>Governed experiments</h2>
      {experiments.length === 0 ? (
        <p>No governed experiment definitions yet.</p>
      ) : experiments.map((experiment) => (
        <article key={experiment.id} style={{ margin: '1.5rem 0' }}>
          <h3><code>{experiment.key}</code></h3>
          <table>
            <thead>
              <tr>
                <th>Version</th><th>State</th><th>Created</th><th>Actual window</th><th />
              </tr>
            </thead>
            <tbody>
              {experiment.versions.map((version) => (
                <tr key={version.id}>
                  <td>v{version.version}</td>
                  <td>{version.status}</td>
                  <td>{formatUtc(version.createdAt)} by <code>{version.createdBy}</code></td>
                  <td>
                    {version.startedAt ? formatUtc(version.startedAt) : 'Not started'}
                    {' → '}
                    {version.endedAt ? formatUtc(version.endedAt) : 'Open'}
                  </td>
                  <td>
                    <details>
                      <summary>Plan</summary>
                      <p>
                        Primary direction: <strong>{version.definition.primaryMetric.direction}</strong>
                        {' · '}minimum sample: <strong>{version.definition.minimumSamplePerVariant} per variant</strong>
                      </p>
                      <pre>{JSON.stringify(version.definition, null, 2)}</pre>
                    </details>
                    {canManage && allowedExperimentTargets(experiment, version).map((target) => (
                      <button
                        key={target}
                        type="button"
                        disabled={pending}
                        onClick={() => onTransition(
                          experiment.id,
                          version.id,
                          version.version,
                          target,
                        )}
                      >
                        {TARGET_LABEL[target]} v{version.version}
                      </button>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </article>
      ))}
    </section>
  )
}
