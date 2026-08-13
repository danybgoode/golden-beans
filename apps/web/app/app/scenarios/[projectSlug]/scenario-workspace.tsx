'use client'
import { useEffect, useMemo, useState, useTransition } from 'react'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { DataTable, type DataTableColumn } from '@/components/ui/DataTable'
import { Field, FormSection } from '@/components/ui/FormSection'
import { Panel } from '@/components/ui/Panel'
import { StatCard } from '@/components/ui/StatCard'
import {
  MAX_SCENARIO_DELAY_MS,
  SCENARIO_FAULT_KINDS,
  SCENARIO_KINDS,
  SCENARIO_SECURITY_TEMPLATES,
  type ScenarioFaultKind,
} from '@/lib/scenario-definition'
import {
  buildScenarioDefinition,
  firstCompatibleFaultFlag,
  SCENARIO_AUTHORING_COHORTS,
  SCENARIO_AUTHORING_LIMITS,
  type ScenarioAuthoringDraft,
} from '@/lib/scenario-authoring-draft'
import type {
  ScenarioDashboardImpact,
  ScenarioDashboardRun,
  ScenarioDashboardView,
} from '@/lib/scenario-dashboard'
import { scenarioImpactExperimentKey } from '@/lib/scenario-impact-link'
import { launchScenarioRunAction, scenarioOwnerOperationAction } from './actions'

function timestamp(value: string | null): string {
  return value ? `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '—'
}
function shortId(value: string): string {
  return value.slice(0, 8)
}
function durationSeconds(startAt: string, expiresAt: string): number {
  return Math.round((Date.parse(expiresAt) - Date.parse(startAt)) / 1_000)
}
function localStart(): string {
  const date = new Date()
  date.setSeconds(0, 0)
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16)
}

function ElapsedTime({ since }: { since: string }) {
  const [seconds, setSeconds] = useState(0)
  useEffect(() => {
    const update = () => setSeconds(Math.max(0, Math.floor((Date.now() - Date.parse(since)) / 1_000)))
    update()
    const timer = window.setInterval(update, 1_000)
    return () => window.clearInterval(timer)
  }, [since])
  return <>{seconds}s</>
}

type Confirmation =
  | { kind: 'revoke'; id: string; label: string }
  | { kind: 'launch'; id: string; label: string; target: string; blastRadius: string }
  | { kind: 'stop'; id: string; label: string; revision: number; environment: string }

export function ScenarioWorkspace({
  projectSlug,
  view,
  canAuthor,
}: {
  projectSlug: string
  view: ScenarioDashboardView
  canAuthor: boolean
}) {
  const defaultTarget = view.targets.find((target) => target.status === 'verified')?.key ?? ''
  const defaultFlag = firstCompatibleFaultFlag('delay', view.faultFlags)
  const [draft, setDraft] = useState<ScenarioAuthoringDraft>({
    kind: 'resilience',
    cohort: 'synthetic',
    targetKey: defaultTarget,
    environment: 'production',
    startAt: localStart(),
    durationSeconds: 300,
    requestCap: 10,
    concurrencyCap: 2,
    leaseTtlSeconds: 10,
    abortAfterFailures: 2,
    maxErrorRatePercent: 10,
    flagKey: defaultFlag?.key ?? '',
    flagVersion: defaultFlag?.version ?? 1,
  })
  const [scenarioKey, setScenarioKey] = useState('')
  const [reason, setReason] = useState('')
  const [operationReason, setOperationReason] = useState('')
  const [faultKind, setFaultKind] = useState<ScenarioFaultKind>('delay')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null)
  const [pending, startTransition] = useTransition()
  const parsed = useMemo(() => buildScenarioDefinition(draft), [draft])
  const selectedDefinition = view.definitions.find((item) => item.id === confirmation?.id)

  const compatibleFlags = view.faultFlags.filter((flag) => flag.faultKinds.includes(faultKind))
  const update = <K extends keyof ScenarioAuthoringDraft>(key: K, value: ScenarioAuthoringDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }))
  const act = (
    task: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
    clearOperationReason = false
  ) => {
    startTransition(async () => {
      const result = await task()
      setConfirmation(null)
      if (result.ok && clearOperationReason) setOperationReason('')
      setFeedback(result.ok ? success : (result.error ?? 'Could not complete that scenario command.'))
    })
  }

  const targetColumns: DataTableColumn<(typeof view.targets)[number]>[] = [
    { key: 'target', header: 'Target', value: (row) => row.key },
    { key: 'kind', header: 'Kind', value: (row) => row.kind },
    { key: 'origin', header: 'Origin', value: (row) => row.origin },
    {
      key: 'state',
      header: 'Ownership',
      value: (row) => row.status,
      cell: (row) => (
        <>
          {row.status === 'pending' ? 'awaiting verification' : row.status}
          {row.status === 'pending' ? (
            <small>
              <br />
              Someone with target access must complete the challenge at /api/internal/resilience/ownership.
            </small>
          ) : null}
        </>
      ),
    },
    {
      key: 'verified',
      header: 'Verified',
      value: (row) => row.verifiedAt,
      cell: (row) => timestamp(row.verifiedAt),
    },
    ...(canAuthor
      ? [
          {
            key: 'actions',
            header: 'Actions',
            cell: (row) =>
              row.status === 'revoked' ? null : (
                <button
                  className="btn btn-ghost"
                  type="button"
                  onClick={() => {
                    setOperationReason('')
                    setConfirmation({ kind: 'revoke', id: row.id, label: row.key })
                  }}
                >
                  Revoke
                </button>
              ),
          } satisfies DataTableColumn<(typeof view.targets)[number]>,
        ]
      : []),
  ]

  const runColumns: DataTableColumn<ScenarioDashboardRun>[] = [
    {
      key: 'scenario',
      header: 'Scenario',
      value: (row) => row.scenarioKey,
      cell: (row) => (
        <>
          <a href={`#definition-${row.scenarioKey}-${row.definitionVersion}`}>
            {row.scenarioKey} v{row.definitionVersion}
          </a>
          {view.impacts.find((impact) => impact.runId === row.id) ? (
            <>
              <br />
              <a href={`#impact-${view.impacts.find((impact) => impact.runId === row.id)?.id}`}>
                View impact evidence
              </a>
            </>
          ) : null}
        </>
      ),
    },
    {
      key: 'kind',
      header: 'Kind / cohort',
      value: (row) => `${row.kind} ${row.cohort}`,
      cell: (row) => `${row.kind} / ${row.cohort}`,
    },
    {
      key: 'target',
      header: 'Target',
      value: (row) => row.targetKey,
      cell: (row) => (
        <>
          {row.targetKey}
          <br />
          <small>{row.environment}</small>
        </>
      ),
    },
    {
      key: 'state',
      header: 'State',
      value: (row) => row.status,
      cell: (row) => (
        <>
          {row.status} · r{row.revision}
          {row.status === 'running'
            ? (() => {
                const definition = view.definitions.find(
                  (item) => item.id === row.scenarioVersionId
                )?.definition
                return definition ? (
                  <small>
                    <br />
                    Elapsed <ElapsedTime since={row.startedAt ?? row.createdAt} /> · abort at{' '}
                    {definition.guardrails.abortAfterFailures} failures or{' '}
                    {(definition.guardrails.maxErrorRateBasisPoints / 100).toFixed(2)}% errors
                  </small>
                ) : null
              })()
            : null}
        </>
      ),
    },
    { key: 'requests', header: 'Requests', value: (row) => row.requestCount },
    {
      key: 'outcomes',
      header: 'Outcomes',
      value: (row) => row.successCount + row.failureCount,
      cell: (row) => `${row.successCount} ok / ${row.failureCount} failed`,
    },
    {
      key: 'started',
      header: 'Started',
      value: (row) => row.startedAt,
      cell: (row) => timestamp(row.startedAt),
    },
    {
      key: 'stopped',
      header: 'Stopped',
      value: (row) => row.stoppedAt,
      cell: (row) => (
        <>
          {timestamp(row.stoppedAt)}
          {row.stopReason ? (
            <>
              <br />
              <small>{row.stopReason}</small>
            </>
          ) : null}
        </>
      ),
    },
    ...(canAuthor
      ? [
          {
            key: 'actions',
            header: 'Actions',
            cell: (row) =>
              row.status === 'running' ? (
                <button
                  className="btn btn-gold"
                  type="button"
                  onClick={() => {
                    setOperationReason('')
                    setConfirmation({
                      kind: 'stop',
                      id: row.id,
                      label: `${row.scenarioKey} run ${shortId(row.id)}`,
                      revision: row.revision,
                      environment: row.environment,
                    })
                  }}
                >
                  Stop run
                </button>
              ) : null,
          } satisfies DataTableColumn<ScenarioDashboardRun>,
        ]
      : []),
  ]

  return (
    <main>
      <header className="page-header">
        <div>
          <p className="eyebrow">OPERATE · LEARN · PROTECT</p>
          <h1>Scenarios &amp; breakers — {projectSlug}</h1>
          <p>
            Bounded resilience and defensive-security exercises for <strong>{projectSlug}</strong>. Runtime
            gates may stay OFF while definitions, stopped runs, immutable impact snapshots and breaker
            decisions remain inspectable.
          </p>
        </div>
      </header>

      <div className="stat-grid">
        <StatCard
          label="Verified targets"
          value={String(view.targets.filter((item) => item.status === 'verified').length)}
          caveat="Challenge-proven origins only"
        />
        <StatCard
          label="Active runs"
          value={String(view.runs.filter((item) => item.status === 'running').length)}
          caveat="Bounded by TTL and guardrails"
        />
        <StatCard label="Impact snapshots" value={String(view.impacts.length)} caveat="Immutable evidence" />
        <StatCard
          label="Breaker trips"
          value={String(view.trips.length)}
          caveat="Separate from stopping a run"
        />
      </div>

      {feedback ? (
        <p role="status" className="notice">
          {feedback}
        </p>
      ) : null}

      {canAuthor ? (
        <Panel>
          <form
            onSubmit={(event) => {
              event.preventDefault()
              if (!parsed.ok || !scenarioKey || !reason) {
                setFeedback(
                  !parsed.ok ? parsed.error : 'A scenario key and human-written reason are required.'
                )
                return
              }
              act(
                () =>
                  scenarioOwnerOperationAction(projectSlug, draft.environment, {
                    operation: 'create_definition',
                    scenarioKey,
                    definition: parsed.definition,
                    reason,
                  }),
                'Scenario definition saved.'
              )
            }}
          >
            <FormSection
              title="Define a scenario"
              description="Choose a verified target and an existing immutable fault-injector flag version. Target registration and ownership verification remain an engineering handshake."
            >
              <Field label="Scenario key" error={null}>
                {(control) => (
                  <input
                    {...control}
                    value={scenarioKey}
                    pattern="[a-z][a-z0-9_-]{0,63}"
                    onChange={(event) => setScenarioKey(event.target.value)}
                  />
                )}
              </Field>
              <Field label="Kind" error={null}>
                {(control) => (
                  <select
                    {...control}
                    value={draft.kind}
                    onChange={(event) => update('kind', event.target.value as ScenarioAuthoringDraft['kind'])}
                  >
                    {SCENARIO_KINDS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label="Cohort"
                hint="External cohorts require the separate credential approval flow and are not offered here."
                error={null}
              >
                {(control) => (
                  <select
                    {...control}
                    value={draft.cohort}
                    onChange={(event) =>
                      update('cohort', event.target.value as ScenarioAuthoringDraft['cohort'])
                    }
                  >
                    {SCENARIO_AUTHORING_COHORTS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label="Verified target"
                error={!draft.targetKey ? 'A verified target is required.' : null}
              >
                {(control) => (
                  <select
                    {...control}
                    value={draft.targetKey}
                    onChange={(event) => update('targetKey', event.target.value)}
                  >
                    <option value="">Select a target</option>
                    {view.targets
                      .filter((target) => target.status === 'verified')
                      .map((target) => (
                        <option key={target.id} value={target.key}>
                          {target.key}
                        </option>
                      ))}
                  </select>
                )}
              </Field>
              <Field label="Environment" error={null}>
                {(control) => (
                  <select
                    {...control}
                    value={draft.environment}
                    onChange={(event) =>
                      update('environment', event.target.value as ScenarioAuthoringDraft['environment'])
                    }
                  >
                    {['development', 'preview', 'production'].map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label="Fault"
                hint={`Delay payloads are bounded to ${MAX_SCENARIO_DELAY_MS} ms by the SDK. The selected immutable flag owns its actual payloads and targeting.`}
                error={null}
              >
                {(control) => (
                  <select
                    {...control}
                    value={faultKind}
                    onChange={(event) => {
                      const nextKind = event.target.value as ScenarioFaultKind
                      const nextFlag = firstCompatibleFaultFlag(nextKind, view.faultFlags)
                      setFaultKind(nextKind)
                      setDraft((current) => ({
                        ...current,
                        flagKey: nextFlag?.key ?? '',
                        flagVersion: nextFlag?.version ?? 1,
                      }))
                    }}
                  >
                    {SCENARIO_FAULT_KINDS.map((value) => (
                      <option key={value}>{value}</option>
                    ))}
                  </select>
                )}
              </Field>
              <Field
                label="Fault-injector flag version"
                error={!draft.flagKey ? 'A compatible immutable flag version is required.' : null}
              >
                {(control) => (
                  <select
                    {...control}
                    value={`${draft.flagKey}:${draft.flagVersion}`}
                    onChange={(event) => {
                      const selected = view.faultFlags.find(
                        (flag) => `${flag.key}:${flag.version}` === event.target.value
                      )
                      if (selected)
                        setDraft((current) => ({
                          ...current,
                          flagKey: selected.key,
                          flagVersion: selected.version,
                        }))
                      else
                        setDraft((current) => ({
                          ...current,
                          flagKey: '',
                          flagVersion: 1,
                        }))
                    }}
                  >
                    <option value="">Select a version</option>
                    {compatibleFlags.map((flag) => (
                      <option key={`${flag.key}:${flag.version}`} value={`${flag.key}:${flag.version}`}>
                        {flag.key} v{flag.version} · {flag.faultKinds.join(', ')}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
              {draft.kind === 'security' ? (
                <Field
                  label="Defensive template"
                  error={draft.securityTemplate ? null : 'A closed defensive template is required.'}
                >
                  {(control) => (
                    <select
                      {...control}
                      value={draft.securityTemplate ?? ''}
                      onChange={(event) =>
                        update(
                          'securityTemplate',
                          event.target.value as NonNullable<ScenarioAuthoringDraft['securityTemplate']>
                        )
                      }
                    >
                      <option value="">Select a template</option>
                      {SCENARIO_SECURITY_TEMPLATES.map((value) => (
                        <option key={value}>{value}</option>
                      ))}
                    </select>
                  )}
                </Field>
              ) : null}
              <Field label="Starts at" error={parsed.ok || parsed.field !== 'startAt' ? null : parsed.error}>
                {(control) => (
                  <input
                    {...control}
                    type="datetime-local"
                    value={draft.startAt}
                    onChange={(event) => update('startAt', event.target.value)}
                  />
                )}
              </Field>
              <Field
                label="Duration (seconds)"
                hint={`Maximum ${SCENARIO_AUTHORING_LIMITS.durationSeconds}.`}
                error={parsed.ok || parsed.field !== 'durationSeconds' ? null : parsed.error}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    min={1}
                    max={SCENARIO_AUTHORING_LIMITS.durationSeconds}
                    value={draft.durationSeconds}
                    onChange={(event) => update('durationSeconds', Number(event.target.value))}
                  />
                )}
              </Field>
              <Field
                label="Request cap"
                error={parsed.ok || parsed.field !== 'requestCap' ? null : parsed.error}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    min={1}
                    max={SCENARIO_AUTHORING_LIMITS.requestCap}
                    value={draft.requestCap}
                    onChange={(event) => update('requestCap', Number(event.target.value))}
                  />
                )}
              </Field>
              <Field
                label="Concurrency cap"
                error={parsed.ok || parsed.field !== 'concurrencyCap' ? null : parsed.error}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    min={1}
                    max={SCENARIO_AUTHORING_LIMITS.concurrencyCap}
                    value={draft.concurrencyCap}
                    onChange={(event) => update('concurrencyCap', Number(event.target.value))}
                  />
                )}
              </Field>
              <Field
                label="Lease TTL (seconds)"
                error={parsed.ok || parsed.field !== 'leaseTtlSeconds' ? null : parsed.error}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    min={1}
                    max={SCENARIO_AUTHORING_LIMITS.leaseTtlSeconds}
                    value={draft.leaseTtlSeconds}
                    onChange={(event) => update('leaseTtlSeconds', Number(event.target.value))}
                  />
                )}
              </Field>
              <Field
                label="Abort after failures"
                error={parsed.ok || parsed.field !== 'abortAfterFailures' ? null : parsed.error}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    min={1}
                    max={SCENARIO_AUTHORING_LIMITS.abortAfterFailures}
                    value={draft.abortAfterFailures}
                    onChange={(event) => update('abortAfterFailures', Number(event.target.value))}
                  />
                )}
              </Field>
              <Field
                label="Maximum error rate (%)"
                hint="Stored as basis points through the shared percent conversion."
                error={parsed.ok || parsed.field !== 'maxErrorRatePercent' ? null : parsed.error}
              >
                {(control) => (
                  <input
                    {...control}
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={draft.maxErrorRatePercent}
                    onChange={(event) => update('maxErrorRatePercent', Number(event.target.value))}
                  />
                )}
              </Field>
              <Field
                label="Reason"
                hint="Written to the immutable lifecycle audit."
                error={!reason ? 'A human-written reason is required.' : null}
              >
                {(control) => (
                  <textarea
                    {...control}
                    maxLength={500}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                )}
              </Field>
              <button
                className="btn btn-gold"
                disabled={pending || !parsed.ok || !scenarioKey || !reason}
                type="submit"
              >
                {pending ? 'Saving…' : 'Save definition'}
              </button>
            </FormSection>
          </form>
        </Panel>
      ) : null}

      <Panel>
        <h2>Registered targets</h2>
        <DataTable
          caption="Registered scenario targets"
          columns={targetColumns}
          rows={view.targets}
          rowKey={(row) => row.id}
          empty="No scenario targets registered."
        />
      </Panel>

      <Panel>
        <h2>Scenario definitions</h2>
        {view.definitions.length === 0 ? (
          <p>No scenario definitions yet.</p>
        ) : (
          view.definitions.map((item) => {
            const target = view.targets.find((candidate) => candidate.key === item.definition.targetKey)
            const duration = durationSeconds(item.definition.startAt, item.definition.expiresAt)
            const launchable = target?.status === 'verified' && item.definition.cohort !== 'external'
            return (
              <article id={`definition-${item.scenarioKey}-${item.version}`} key={item.id} className="panel">
                <h3>
                  {item.scenarioKey} v{item.version}
                </h3>
                <p>
                  {item.definition.kind} · {item.definition.cohort} · {item.definition.targetKey}
                </p>
                <p>
                  Blast radius: {item.definition.limits.requestCap} requests,{' '}
                  {item.definition.limits.concurrencyCap} concurrent, {duration} seconds.
                </p>
                {canAuthor ? (
                  <button
                    className="btn btn-gold"
                    disabled={!launchable || pending}
                    title={launchable ? undefined : 'Only verified, non-external targets can launch here.'}
                    type="button"
                    onClick={() => {
                      setOperationReason('')
                      setConfirmation({
                        kind: 'launch',
                        id: item.id,
                        label: `${item.scenarioKey} v${item.version}`,
                        target: item.definition.targetKey,
                        blastRadius: `${item.definition.limits.requestCap} requests, ${item.definition.limits.concurrencyCap} concurrent, ${duration} seconds`,
                      })
                    }}
                  >
                    Launch run
                  </button>
                ) : null}
              </article>
            )
          })
        )}
      </Panel>

      <Panel>
        <h2>Recent runs</h2>
        <p>
          Running scenarios are bounded by their visible request, concurrency, time and failure guardrails.
          “Stop run” transitions that run; it does not trip a flag breaker policy.
        </p>
        <DataTable
          caption="Recent scenario runs"
          columns={runColumns}
          rows={view.runs}
          rowKey={(row) => row.id}
          empty="No scenario runs yet."
        />
      </Panel>

      <Panel>
        <h2>Defensive simulation results</h2>
        <DataTable
          caption="Defensive simulation results"
          columns={[
            {
              key: 'when',
              header: 'When',
              value: (row) => row.createdAt,
              cell: (row) => timestamp(row.createdAt),
            },
            { key: 'template', header: 'Template', value: (row) => row.template },
            { key: 'expected', header: 'Expected', value: (row) => row.expectedOutcome },
            {
              key: 'observed',
              header: 'Observed',
              value: (row) => row.observedOutcome,
              cell: (row) => (row.succeeded ? 'expected guard observed' : row.observedOutcome),
            },
            { key: 'http', header: 'HTTP', value: (row) => row.observedStatuses.join(', ') },
            {
              key: 'latency',
              header: 'Latency',
              value: (row) => row.latencyMs,
              cell: (row) => `${row.latencyMs}ms`,
            },
          ]}
          rows={view.securityResults}
          rowKey={(row) => row.id}
          empty="No defensive simulations recorded."
        />
      </Panel>

      <Panel>
        <h2>Canonical product-impact evidence</h2>
        <p>
          <strong>Internal and synthetic cohorts never produce a causal customer claim.</strong>
        </p>
        {view.impacts.length === 0 ? (
          <p>No impact snapshots captured.</p>
        ) : (
          view.impacts.map((impact: ScenarioDashboardImpact) => {
            const comparable =
              impact.evidence.technical.control.attempts > 0 && impact.evidence.technical.fault.attempts > 0
            const experimentKey = scenarioImpactExperimentKey(impact.evidence)
            return (
              <article id={`impact-${impact.id}`} key={impact.id} className="panel">
                <h3>
                  {impact.scenarioKey} v{impact.scenarioVersion} · {impact.evidence.cohort} cohort
                </h3>
                <p>
                  <strong>Claim status: {impact.evidence.claim.status}</strong>
                </p>
                <p>
                  <strong>Blockers: {impact.evidence.claim.blockers.join(', ') || 'none'}</strong>
                </p>
                {comparable ? (
                  <table>
                    <caption>Control versus treatment technical evidence</caption>
                    <thead>
                      <tr>
                        <th>Arm</th>
                        <th>Attempts</th>
                        <th>Failures</th>
                        <th>Latency p95</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr>
                        <th>Control</th>
                        <td>{impact.evidence.technical.control.attempts}</td>
                        <td>{impact.evidence.technical.control.failures}</td>
                        <td>{impact.evidence.technical.control.latencyP95Ms ?? 'unrecorded'}</td>
                      </tr>
                      <tr>
                        <th>Fault treatment</th>
                        <td>{impact.evidence.technical.fault.attempts}</td>
                        <td>{impact.evidence.technical.fault.failures}</td>
                        <td>{impact.evidence.technical.fault.latencyP95Ms ?? 'unrecorded'}</td>
                      </tr>
                    </tbody>
                  </table>
                ) : (
                  <p>Evidence is insufficient for a control-versus-treatment comparison.</p>
                )}
                <p>
                  <a href={`#definition-${impact.scenarioKey}-${impact.scenarioVersion}`}>
                    Open the producing definition
                  </a>{' '}
                  ·{' '}
                  {experimentKey ? (
                    <a href={`/app/experiments/${projectSlug}/${encodeURIComponent(experimentKey)}`}>
                      Open downstream experiment analysis
                    </a>
                  ) : (
                    <span>No downstream experiment reference was captured.</span>
                  )}
                </p>
              </article>
            )
          })
        )}
      </Panel>

      <Panel>
        <h2>Automatic circuit-breaker policies</h2>
        <p>
          These policies can change a bound flag when their evidence threshold is met. They are separate from
          the human “Stop run” transition above.
        </p>
        <DataTable
          caption="Automatic circuit-breaker policies"
          columns={[
            { key: 'policy', header: 'Policy', value: (row) => row.key },
            {
              key: 'state',
              header: 'State',
              value: (row) => row.status,
              cell: (row) => `${row.status} · r${row.revision}`,
            },
            { key: 'trips', header: 'Trips', value: (row) => row.tripCount },
            {
              key: 'confirmation',
              header: 'Confirmation',
              value: (row) => String(row.definition.confirmationMode ?? 'unknown'),
            },
            {
              key: 'last',
              header: 'Last trip',
              value: (row) => row.lastTrippedAt,
              cell: (row) => timestamp(row.lastTrippedAt),
            },
          ]}
          rows={view.policies}
          rowKey={(row) => row.id}
          empty="No breaker policies configured."
        />
      </Panel>

      <Panel>
        <h2>Immutable breaker trips</h2>
        <DataTable
          caption="Immutable breaker trips"
          columns={[
            {
              key: 'when',
              header: 'When',
              value: (row) => row.createdAt,
              cell: (row) => timestamp(row.createdAt),
            },
            { key: 'mode', header: 'Mode', value: (row) => row.mode },
            {
              key: 'observed',
              header: 'Observed',
              value: (row) => row.observedBasisPoints,
              cell: (row) => `${row.observedBasisPoints} bp`,
            },
            {
              key: 'snapshot',
              header: 'Snapshot',
              value: (row) => row.newSnapshotVersion,
              cell: (row) => `${row.oldSnapshotVersion} → ${row.newSnapshotVersion}`,
            },
            { key: 'reason', header: 'Reason', value: (row) => row.reason },
          ]}
          rows={view.trips}
          rowKey={(row) => row.id}
          empty="No breaker trips recorded."
        />
      </Panel>

      <ConfirmDialog
        open={confirmation !== null}
        verb={confirmation?.kind === 'revoke' ? 'Revoke' : confirmation?.kind === 'stop' ? 'Stop' : 'Launch'}
        noun={confirmation?.kind === 'revoke' ? 'target' : confirmation?.kind === 'stop' ? 'run' : 'scenario'}
        subject={confirmation?.label ?? 'scenario'}
        consequence={
          confirmation?.kind === 'revoke'
            ? 'New runs cannot use this target after revocation.'
            : confirmation?.kind === 'stop'
              ? 'This run stops admitting bounded fault executions.'
              : confirmation?.kind === 'launch'
                ? `${confirmation.target}. Blast radius: ${confirmation.blastRadius}.`
                : ''
        }
        pending={pending}
        confirmDisabled={!operationReason.trim()}
        details={
          <Field label="Operation reason" hint="Written to the immutable lifecycle audit." error={null}>
            {(control) => (
              <textarea
                {...control}
                maxLength={500}
                value={operationReason}
                onChange={(event) => setOperationReason(event.target.value)}
              />
            )}
          </Field>
        }
        onCancel={() => {
          setConfirmation(null)
          setOperationReason('')
        }}
        onConfirm={() => {
          if (!confirmation) return
          if (!operationReason.trim()) return
          if (confirmation.kind === 'revoke')
            act(
              () =>
                scenarioOwnerOperationAction(projectSlug, 'production', {
                  operation: 'revoke_target',
                  targetId: confirmation.id,
                  reason: operationReason,
                }),
              'Target revoked.',
              true
            )
          if (confirmation.kind === 'launch' && selectedDefinition)
            act(
              () =>
                launchScenarioRunAction(
                  projectSlug,
                  selectedDefinition.definition.environment,
                  confirmation.id,
                  operationReason
                ),
              'Scenario run launched.',
              true
            )
          if (confirmation.kind === 'stop')
            act(
              () =>
                scenarioOwnerOperationAction(projectSlug, confirmation.environment, {
                  operation: 'transition_run',
                  runId: confirmation.id,
                  expectedRevision: confirmation.revision,
                  transition: 'stop',
                  reason: operationReason,
                }),
              'Scenario run stopped.',
              true
            )
        }}
      />
    </main>
  )
}
