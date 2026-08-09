'use client'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { formatUtc } from '@/lib/format-utc'
import { Field, FormSection } from '@/components/ui/FormSection'
import { allowedExperimentTargets } from '@/lib/experiment-registry-view'
import type { ExperimentRegistryRow, ExperimentTransitionTarget } from '@/lib/experiments'
import type { ExperimentFlagBinding } from '@/lib/experiment-flag-bindings'
import type { FlagRegistryRow } from '@/lib/flag-registry'
import {
  bindExperimentFlagVersionAction,
  createExperimentVersionAction,
  transitionExperimentVersionAction,
} from './actions'

// app-component-kit-adoption · Sprint 2, Story 2.2 — the FORM is converted to FormSection/Field.
// The per-experiment version tables are deliberately NOT converted to DataTable. See the D3 finding
// in sprint-2.md: this page renders one small table per experiment (1–5 rows each), and DataTable's
// frozen API always renders a filter box — so converting would put a filter above every one of them.
// D3 says a third route needing an API option is a finding to LOG, not a change to make silently,
// and this is that log entry rather than a quiet `showFilter` prop.

const EXAMPLE = JSON.stringify(
  {
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
  },
  null,
  2
)

const TARGET_LABEL: Record<ExperimentTransitionTarget, string> = {
  running: 'Start',
  stopped: 'Stop',
  invalid: 'Mark invalid',
}

function sameVariantKeys(
  experiment: { variants: Array<{ key: string }> },
  flag: { variants: Array<{ key: string }> }
): boolean {
  if (experiment.variants.length !== flag.variants.length) return false
  const experimentKeys = new Set(experiment.variants.map((variant) => variant.key))
  const flagKeys = new Set(flag.variants.map((variant) => variant.key))
  return (
    experimentKeys.size === experiment.variants.length &&
    flagKeys.size === flag.variants.length &&
    flagKeys.size === experimentKeys.size &&
    [...flagKeys].every((key) => experimentKeys.has(key))
  )
}

export function ExperimentManager({
  slug,
  experiments,
  flags,
  bindings,
  canManage,
}: {
  slug: string
  experiments: ExperimentRegistryRow[]
  flags: FlagRegistryRow[]
  bindings: ExperimentFlagBinding[]
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
    target: ExperimentTransitionTarget
  ) {
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await transitionExperimentVersionAction(slug, experimentId, versionId, target)
        if (result.ok) {
          setNotice(
            result.changed
              ? `Version ${version} is now ${result.status}.`
              : `Version ${version} was already ${result.status}.`
          )
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not change this experiment lifecycle. Try again.')
      }
    })
  }

  function onBind(experimentId: string, experimentVersionId: string, value: string) {
    const [flagId, flagVersionId] = value.split(':')
    if (!flagId || !flagVersionId) return
    setError(null)
    setNotice(null)
    startTransition(async () => {
      try {
        const result = await bindExperimentFlagVersionAction(
          slug,
          experimentId,
          experimentVersionId,
          flagId,
          flagVersionId
        )
        if (result.ok) {
          setNotice(
            result.created
              ? 'Bound the immutable flag version to this experiment.'
              : 'This immutable binding already exists.'
          )
          router.refresh()
        } else setError(result.error)
      } catch {
        setError('Could not bind this flag version to the experiment.')
      }
    })
  }

  return (
    <section>
      {canManage ? (
        <form onSubmit={onCreate}>
          <FormSection
            title="Create a draft version"
            description="Plans are immutable. Reuse a stable key to create the next version; starting and stopping are separate audited actions."
          >
            <Field label="Experiment key" hint="Stable across versions — reusing it creates v2, v3, …">
              {(control) => (
                <input {...control} value={key} onChange={(event) => setKey(event.target.value)} required />
              )}
            </Field>
            <Field
              label="Definition JSON"
              hint="The immutable plan: variants, primary metric, guardrails, minimum sample."
            >
              {(control) => (
                <textarea
                  {...control}
                  value={definition}
                  onChange={(event) => setDefinition(event.target.value)}
                  rows={24}
                  spellCheck={false}
                  required
                  className="code-input"
                />
              )}
            </Field>
            <div>
              <button type="submit" className="btn btn-gold" disabled={pending}>
                {pending ? 'Working…' : 'Create draft'}
              </button>
            </div>
          </FormSection>
        </form>
      ) : (
        <p>
          <strong>Read-only access.</strong> A project owner manages experiment plans.
        </p>
      )}

      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}

      <h2>Governed experiments</h2>
      {experiments.length === 0 ? (
        <p>No governed experiment definitions yet.</p>
      ) : (
        experiments.map((experiment) => (
          <article key={experiment.id} style={{ margin: '1.5rem 0' }}>
            <h3>
              <code>{experiment.key}</code>
            </h3>
            <table>
              <thead>
                <tr>
                  <th>Version</th>
                  <th>State</th>
                  <th>Created</th>
                  <th>Actual window</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {experiment.versions.map((version) => (
                  <tr key={version.id}>
                    <td>v{version.version}</td>
                    <td>{version.status}</td>
                    <td>
                      {formatUtc(version.createdAt)} by <code>{version.createdBy}</code>
                    </td>
                    <td>
                      {version.startedAt ? formatUtc(version.startedAt) : 'Not started'}
                      {' → '}
                      {version.endedAt ? formatUtc(version.endedAt) : 'Open'}
                    </td>
                    <td>
                      {(() => {
                        const binding = bindings.find(
                          (candidate) => candidate.experimentVersionId === version.id
                        )
                        const boundFlag = binding
                          ? flags.find((flag) => flag.id === binding.flagId)
                          : undefined
                        const boundVersion = boundFlag?.versions.find(
                          (candidate) => candidate.id === binding?.flagVersionId
                        )
                        const candidates = flags.flatMap((flag) =>
                          flag.versions
                            .filter((candidate) => sameVariantKeys(version.definition, candidate.definition))
                            .map((candidate) => ({ flag, version: candidate }))
                        )
                        return binding ? (
                          <p>
                            Bound flag: <code>{boundFlag?.key ?? binding.flagId}</code> v
                            {boundVersion?.version ?? binding.flagVersionId}
                            {' · '}bound {formatUtc(binding.createdAt)}
                          </p>
                        ) : canManage && version.status === 'draft' ? (
                          <label>
                            Bind compatible flag version
                            <select
                              defaultValue=""
                              disabled={pending || candidates.length === 0}
                              onChange={(event) => onBind(experiment.id, version.id, event.target.value)}
                            >
                              <option value="">
                                {candidates.length === 0
                                  ? 'No compatible flag versions'
                                  : 'Choose immutable flag version…'}
                              </option>
                              {candidates.map((candidate) => (
                                <option
                                  key={candidate.version.id}
                                  value={`${candidate.flag.id}:${candidate.version.id}`}
                                >
                                  {candidate.flag.key} v{candidate.version.version}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null
                      })()}
                      {(version.status === 'running' ||
                        version.status === 'stopped' ||
                        version.status === 'decided') && (
                        <p>
                          <a
                            href={`/app/experiments/${encodeURIComponent(slug)}/${encodeURIComponent(experiment.key)}?version=${version.version}`}
                          >
                            Open governed analysis
                          </a>
                        </p>
                      )}
                      <details>
                        <summary>Plan</summary>
                        <p>
                          Primary direction: <strong>{version.definition.primaryMetric.direction}</strong>
                          {' · '}minimum sample:{' '}
                          <strong>{version.definition.minimumSamplePerVariant} per variant</strong>
                        </p>
                        <pre>{JSON.stringify(version.definition, null, 2)}</pre>
                      </details>
                      {canManage &&
                        allowedExperimentTargets(experiment, version).map((target) => (
                          <button
                            key={target}
                            type="button"
                            disabled={pending}
                            onClick={() => onTransition(experiment.id, version.id, version.version, target)}
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
        ))
      )}
    </section>
  )
}
