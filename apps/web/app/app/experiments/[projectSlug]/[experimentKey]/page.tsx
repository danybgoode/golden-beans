import type { ReactNode } from 'react'
import { notFound } from 'next/navigation'
import { getExperimentComparison } from '@/lib/ab-query'
import { requireDashboardAccess, requireProjectMembership } from '@/lib/dashboard-auth'
import { getExperimentAnalysisByProjectId } from '@/lib/experiment-analysis-query'
import type { GovernedExperimentAnalysisResult } from '@/lib/experiment-analysis-query'
import { parseExperimentAnalysisRequest } from '@/lib/experiment-analysis-request'
import { blockerWords } from '@/lib/experiment-blocker-words'
import { createBuilderIo } from '@/lib/experiment-builder-io'
import { eventWords, planSentence, versionWeights, type SentencePart } from '@/lib/experiment-builder-plan'
import type { ExperimentDefinition } from '@/lib/experiment-definition'
import { buildReadout, type Readout } from '@/lib/experiment-readout'
import { listExperimentRegistries } from '@/lib/experiments'
import { isExperimentBuilderWritable, isExperimentGovernanceEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { getSupabaseServiceClient } from '@/lib/supabase'
import { ProductShell } from '@/components/product/ProductShell'
import { Icon } from '@/components/ui/Icon'
import { ComparisonBars, IntervalBar } from '@/design-system/charts'
import { Answer, Crumb, Crumbs, PageHead, Pill, Tab } from '@/design-system/primitives'
import { ExperimentBuilder } from '../experiment-builder'
import { RetryServing } from '../retry-serving'
import { DecideFlow } from './decide-flow'
import { LifecycleAction } from './lifecycle-action'

// experiments-for-humans · Story 4.1 (epic README D10) — the decision-first experiment page, on the
// approved states `experiment-results` (gathering), `experiment-results-ready` and
// `experiment-decided`: crumbs → head → answer → tabs → lift + verdict → KPI tiles → "How sure we
// are" + "Who saw what". Every sentence, state and action comes from `buildReadout` over the ONE
// governed analysis (`lib/experiment-readout.ts`); nothing here computes a second statistic.
//
// ⚠️ Two routes share this file, and only one of them is gated. With `?version=` it is the governed
// page (EXPERIMENT_GOVERNANCE_ENABLED). Without it, it is the v1 LEGACY comparison, which by the
// gate's contract does not read the governance flag (AGENTS, key env vars) — keep that branch intact.
//
// The cumulative chart is the story's named first cut: it needs a per-day pass inside the governed
// analysis, which this epic does not change. The lift card says so instead of drawing a chart.

type GovernedSuccess = Extract<GovernedExperimentAnalysisResult, { ok: true }>

type SearchParams = {
  metricEvent?: string | string[]
  version?: string | string[]
  asOf?: string | string[]
  segmentField?: string | string[]
  segmentValue?: string | string[]
  tab?: string | string[]
}

const OUTCOME_WORDS: Record<string, string> = {
  ship_treatment: 'Ship the new version',
  keep_control: 'Keep the current version',
  iterate: 'Change it and run again',
  inconclusive: 'Inconclusive',
  invalid: 'Invalid',
}

function scalar(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

function percent(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function signed(value: number | null): string {
  return value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(1)}%`
}

function day(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  })
}

function Runs({ parts }: { parts: SentencePart[] }) {
  return <>{parts.map((part, index) => (part.emphasis ? <b key={index}>{part.text}</b> : part.text))}</>
}

function Unavailable({ slug, title, body }: { slug: string; title: string; body: string }) {
  return (
    <ProductShell projectSlug={slug} section="ship" railActive={'experiments'}>
      <main>
        <h1>{title}</h1>
        <p>{body}</p>
      </main>
    </ProductShell>
  )
}

export const dynamic = 'force-dynamic'

export default async function ExperimentPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; experimentKey: string }>
  searchParams: Promise<SearchParams>
}) {
  const { projectSlug, experimentKey } = await params
  const raw = await searchParams
  const rawVersion = scalar(raw.version)?.trim()
  if (!rawVersion) return <LegacyComparison slug={projectSlug} experimentKey={experimentKey} raw={raw} />

  if (!isExperimentGovernanceEnabled()) notFound()
  const membership = await requireProjectMembership(projectSlug)
  const parsed = parseExperimentAnalysisRequest({
    version: rawVersion,
    asOf: scalar(raw.asOf),
    segmentField: scalar(raw.segmentField),
    segmentValue: scalar(raw.segmentValue),
  })
  if (!parsed.ok) {
    return <Unavailable slug={projectSlug} title="Invalid experiment analysis request" body={parsed.error} />
  }
  const experiment = (await listExperimentRegistries(membership.projectId)).find(
    (item) => item.key === experimentKey
  )
  const version = experiment?.versions.find((item) => item.version === parsed.request.version)
  if (!experiment || !version) notFound()

  const canManage = isOwner({ projectId: membership.projectId, role: membership.role })
  const io = createBuilderIo(getSupabaseServiceClient())
  const [answers, latest, builderData] = await Promise.all([
    io.versionAnswers(membership.projectId, version.id),
    io.loadDraft(membership.projectId, experimentKey),
    canManage && isExperimentBuilderWritable()
      ? io.loadBuilderPage(membership.projectId)
      : Promise.resolve(null),
  ])
  // The tabs keep the snapshot and segment the reader chose (Codex, #172 round 5) — only once the
  // request passed `parseExperimentAnalysisRequest` above; URLSearchParams re-encodes every value.
  const query = new URLSearchParams({ version: String(version.version) })
  for (const key of ['asOf', 'segmentField', 'segmentValue'] as const) {
    const value = scalar(raw[key])?.trim()
    if (value) query.set(key, value)
  }
  const base = `/app/experiments/${encodeURIComponent(projectSlug)}/${encodeURIComponent(experimentKey)}?${query}`

  // The retired manager's lifecycle capabilities without another home (Story 4.3): Invalidate, and
  // Start for a draft the builder did not make (it has no answers, so the builder cannot start it).
  const lifecycle = {
    slug: projectSlug,
    experimentId: experiment.id,
    versionId: version.id,
    version: version.version,
  }
  const invalidate = canManage ? (
    <>
      {version.status === 'draft' && answers === null ? (
        <LifecycleAction {...lifecycle} target="running" />
      ) : null}
      {version.status === 'draft' || version.status === 'running' || version.status === 'stopped' ? (
        <LifecycleAction {...lifecycle} target="invalid" />
      ) : null}
    </>
  ) : null
  // "Change the plan": the NEXT version, pre-filled from this one, opened at Review — only from the
  // latest version, only once it has started, only when the builder made it (its answers exist).
  const change =
    builderData &&
    answers &&
    latest &&
    latest.version === version.version &&
    (version.status === 'running' || version.status === 'stopped' || version.status === 'decided') ? (
      <ExperimentBuilder
        slug={projectSlug}
        projectId={membership.projectId}
        data={builderData}
        revise={{ experimentKey, answers, flagKey: latest.flagKey, version: latest.version }}
      />
    ) : null

  // A draft or an invalidated version has no readout to lead with: the plan is the page.
  if (version.status === 'draft' || version.status === 'invalid') {
    return (
      <Shell
        slug={projectSlug}
        experimentKey={experimentKey}
        hypothesis={version.definition.hypothesis}
        pill={
          <Pill state={version.status === 'draft' ? 'never' : 'off'}>
            {version.status === 'draft' ? 'Draft' : 'Invalidated'}
          </Pill>
        }
      >
        <Answer>
          {version.status === 'draft' ? (
            <>
              <b>Not started.</b> Nothing is counted until this version is started.
            </>
          ) : (
            <>
              <b>Invalidated.</b> This version&rsquo;s evidence is marked untrustworthy and is never judged.
            </>
          )}
        </Answer>
        <Plan
          definition={version.definition}
          answers={answers}
          decisions={null}
          invalidate={invalidate}
          change={change}
        />
      </Shell>
    )
  }

  const result = await getExperimentAnalysisByProjectId(
    membership.projectId,
    projectSlug,
    experimentKey,
    parsed.request
  )
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Experiment analysis lookup failed')
    if (result.reason === 'resource_limit') {
      return (
        <Unavailable
          slug={projectSlug}
          title="Experiment analysis is too large"
          body="The bounded query limit was exceeded."
        />
      )
    }
    if (result.reason === 'invalid_request' || result.reason === 'lifecycle_unavailable') {
      return (
        <Unavailable
          slug={projectSlug}
          title="Experiment analysis unavailable"
          body="This version has no valid observation window at the requested snapshot."
        />
      )
    }
    notFound()
  }

  // A version made outside the builder has no binding, so nothing may claim it is "not serving".
  const binding = await io.versionServing(membership.projectId, version.id)
  const serving = binding ?? true
  const current = result.decisions.current
  const readout = buildReadout({
    definition: result.experiment.definition,
    analysis: result.analysis,
    lifecycle: result.experiment.lifecycle,
    decision: current
      ? { outcome: current.outcome, chosenVariantKey: current.chosenVariantKey, rationale: current.rationale }
      : null,
    serving,
    now: new Date(),
  })
  const tab = scalar(raw.tab) === 'plan' ? 'plan' : 'results'
  // Only an owner may act; a member reads the same page without the controls (the actions would
  // refuse them server-side anyway — a button that can only fail is not drawn).
  const writable = isExperimentBuilderWritable()
  // A roll-out is drawn only where the server can do it (general pass, PR #172): the builder can write,
  // and Production serves THIS version's split — so not a JSON-made (unbound) version, not one whose
  // split another version or a feature edit replaced, and not after its own roll-out (the undo is the
  // toast's, not a second button).
  const canRollOut = writable && binding === true
  const actions = !canManage ? null : readout.verdict.actions.includes('retry-serving') ? (
    writable ? (
      <RetryServing slug={projectSlug} experimentKey={experimentKey} />
    ) : null
  ) : (
    <DecideFlow
      slug={projectSlug}
      experimentKey={experimentKey}
      experimentId={experiment.id}
      versionId={version.id}
      version={version.version}
      lifecycle={result.experiment.lifecycle}
      controlKey={result.experiment.definition.controlVariantKey}
      variants={result.experiment.definition.variants.map((variant) => ({
        key: variant.key,
        label: variant.label ?? variant.key,
      }))}
      currentDecisionId={current?.id ?? null}
      decision={current ? { outcome: current.outcome, chosenVariantKey: current.chosenVariantKey } : null}
      actions={readout.verdict.actions}
      canRollOut={canRollOut}
      leadTreatmentKey={readout.treatment.key}
    />
  )

  return (
    <Shell
      slug={projectSlug}
      experimentKey={experimentKey}
      hypothesis={version.definition.hypothesis}
      pill={
        <Pill
          state={
            readout.state === 'ready' || readout.state === 'decided'
              ? 'on'
              : readout.state === 'stopped'
                ? 'off'
                : 'never'
          }
        >
          {readout.state === 'decided'
            ? 'Decided'
            : readout.state === 'stopped'
              ? 'Stopped'
              : readout.state === 'ready'
                ? 'Ready to decide'
                : readout.state === 'not_serving'
                  ? 'Not serving'
                  : 'Still gathering'}
        </Pill>
      }
    >
      <Answer>
        <Runs parts={readout.answer} />
      </Answer>
      <nav className="ds-x-ptabs" role="tablist" aria-label="Experiment">
        <Tab href={base} selected={tab === 'results'}>
          Results
        </Tab>
        <Tab href={`${base}&tab=plan`} selected={tab === 'plan'}>
          Plan
        </Tab>
      </nav>
      {tab === 'plan' ? (
        <Plan
          definition={version.definition}
          answers={answers}
          decisions={result.decisions.history}
          invalidate={invalidate}
          change={change}
        />
      ) : (
        <Results readout={readout} result={result} actions={actions} />
      )}
    </Shell>
  )
}

function Shell({
  slug,
  experimentKey,
  hypothesis,
  pill,
  children,
}: {
  slug: string
  experimentKey: string
  hypothesis: string
  pill: ReactNode
  children: ReactNode
}) {
  return (
    <ProductShell projectSlug={slug} section="ship" railActive={'experiments'}>
      <main>
        <Crumbs back={{ href: `/app/experiments/${encodeURIComponent(slug)}`, label: 'Experiments' }}>
          <Crumb mono>{experimentKey}</Crumb>
        </Crumbs>
        {/* The approved head carries `action: null`: the state pill, never a primary button. */}
        <PageHead title={<span className="ds-mono">{experimentKey}</span>} lede={hypothesis} actions={pill} />
        {children}
      </main>
    </ProductShell>
  )
}

function Results({
  readout,
  result,
  actions,
}: {
  readout: Readout
  result: GovernedSuccess
  actions: ReactNode
}) {
  const definition = result.experiment.definition
  const interval = result.analysis.primaryMetric.variants.find(
    (variant) => variant.key === readout.treatment.key
  )?.liftInterval
  const blockers = result.analysis.blockers
  const clearWin =
    readout.lift !== null &&
    !readout.lift.crossesZero &&
    readout.lift.value > 0 === (definition.primaryMetric.direction === 'increase')
  return (
    <>
      <div className="ds-x-res-top">
        <section className="ds-x-card">
          <div className="ds-x-lift">
            <div>
              <p className="ds-x-number" data-tone={clearWin ? 'up' : 'flat'}>
                {readout.lift ? signed(readout.lift.value) : '—'}
              </p>
              <p className="ds-x-key">
                {eventWords(definition.primaryMetric.event)} · {readout.treatment.label} vs{' '}
                {readout.control.label}
              </p>
            </div>
            <div className="ds-x-legend" aria-label="Which colour is which version">
              <span>
                <i data-series="control" />
                {readout.control.label}
              </span>
              <span>
                <i data-series="treatment" />
                {readout.treatment.label}
              </span>
            </div>
          </div>
          <p className="ds-x-empty-chart">
            <b>The day-by-day line isn&rsquo;t drawn yet.</b>
            The number above and the range below are the evidence.
          </p>
        </section>
        <section
          className={`ds-x-verdict${readout.state === 'ready' || readout.state === 'decided' ? ' ds-x-verdict--ready' : ''}`}
        >
          <p className="ds-label">{readout.verdict.label}</p>
          <h2>{readout.verdict.title}</h2>
          <p className="ds-x-verdict-body">{readout.verdict.body}</p>
          {/* A blocked readout is a gathering state with its blockers NAMED (APPROVED.md, batch 6). */}
          {blockers.length > 0 && readout.state !== 'decided' ? (
            <ul className="ds-blockers">
              {blockers.map((blocker) => {
                const words = blockerWords(blocker)
                return (
                  <li key={blocker} className="ds-blocker">
                    <span className="ds-blocker-mark" aria-hidden="true">
                      <Icon name="warning" size={13} />
                    </span>
                    <span>
                      <strong>{words.what}</strong> {words.why}
                    </span>
                  </li>
                )
              })}
            </ul>
          ) : null}
          {readout.state === 'decided' ? null : (
            <div>
              <div className="ds-x-progress">
                <i style={{ width: `${(readout.progress.fraction * 100).toFixed(1)}%` }} />
              </div>
              <p className="ds-x-progress-cap">
                <span>{Math.round(readout.progress.fraction * 100)}% of the sample</span>
                <span>
                  day {readout.progress.day} of {readout.progress.plannedDays}
                </span>
              </p>
            </div>
          )}
          {actions}
        </section>
      </div>
      <div className="ds-x-kpis">
        {[readout.control, readout.treatment].map((arm) => (
          <Kpi
            key={arm.key}
            label={arm.label}
            value={percent(arm.rate)}
            detail={`${arm.exposed.toLocaleString('en-US')} people`}
          />
        ))}
        <Kpi
          label="Sample"
          value={`${Math.round(readout.progress.fraction * 100)}%`}
          detail={`needs ${readout.progress.needPerVersion.toLocaleString('en-US')} per version`}
        />
        {readout.guardrails.map((guard) => (
          <Kpi
            key={guard.event}
            label={`${guard.label} · guardrail`}
            value={signed(guard.delta)}
            detail={
              guard.status === 'fine'
                ? 'held'
                : guard.status === 'worse'
                  ? 'moved the wrong way'
                  : 'not enough yet'
            }
          />
        ))}
      </div>
      <div className="ds-x-two">
        <section className="ds-x-card">
          <p className="ds-label">How sure we are</p>
          {interval?.ok ? (
            <>
              <p className="ds-chart-hero-sub">
                {interval.crossesZero
                  ? 'The range still includes “no difference”.'
                  : 'The whole range sits on one side of zero.'}
              </p>
              <IntervalBar
                low={interval.low}
                high={interval.high}
                point={interval.lift}
                format={(value) => `${value >= 0 ? '+' : ''}${(value * 100).toFixed(1)}%`}
                unreadable="The range could not be drawn."
              />
            </>
          ) : (
            <p className="ds-chart-note">
              No range yet: there aren&rsquo;t enough people in both versions to compare.
            </p>
          )}
        </section>
        <section className="ds-x-card">
          <p className="ds-label">Who saw what</p>
          <ComparisonBars
            rows={[readout.control, readout.treatment].map((arm, index) => ({
              series: index === 0 ? 'control' : 'treatment',
              label: arm.label,
              observed: arm.exposed,
              needed: readout.progress.needPerVersion,
            }))}
          />
          <p className="ds-x-split">
            <Pill state={readout.srm === 'clear' ? 'on' : readout.srm === 'detected' ? 'off' : 'never'}>
              {readout.srm === 'clear'
                ? 'Split checks out'
                : readout.srm === 'detected'
                  ? 'Split is off'
                  : 'Split not checked yet'}
            </Pill>
            {readout.srm === 'clear'
              ? 'People were divided as planned.'
              : readout.srm === 'detected'
                ? 'The result can’t be trusted until the split is fixed.'
                : 'Too few people to check the split.'}
          </p>
        </section>
      </div>
    </>
  )
}

function Kpi({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <section className="ds-x-kpi">
      <p>{label}</p>
      <strong>{value}</strong>
      <small>{detail}</small>
    </section>
  )
}

function Plan({
  definition,
  answers,
  decisions,
  invalidate,
  change,
}: {
  definition: ExperimentDefinition
  answers: Awaited<ReturnType<ReturnType<typeof createBuilderIo>['versionAnswers']>>
  decisions: GovernedSuccess['decisions']['history'] | null
  invalidate: ReactNode
  change: ReactNode
}) {
  const names = definition.variants.map((variant) => variant.label ?? variant.key)
  const weights = definition.variants.map((variant) => variant.weight)
  return (
    <>
      <p className="ds-x-big-sentence">
        {answers ? (
          <Runs parts={planSentence(answers, names, versionWeights(names.length, answers.split))} />
        ) : (
          definition.hypothesis
        )}
      </p>
      <div className="ds-x-plan-grid">
        <dl className="ds-x-plan-list">
          <div>
            <dt>Who</dt>
            <dd>{definition.eligibility.description}</dd>
          </div>
          <div>
            <dt>Split</dt>
            <dd>{names.map((name, index) => `${name} ${weights[index]}%`).join(' · ')}</dd>
          </div>
          <div>
            <dt>Decides it</dt>
            <dd>{eventWords(definition.primaryMetric.event)}</dd>
          </div>
          <div>
            <dt>Guardrails</dt>
            <dd>
              {definition.guardrailMetrics.map((guard) => eventWords(guard.event)).join(' · ') || 'None'}
            </dd>
          </div>
          <div>
            <dt>Runs</dt>
            <dd>
              {day(definition.plannedWindow.startAt)} → {day(definition.plannedWindow.endAt)}
            </dd>
          </div>
          <div>
            <dt>Needs</dt>
            <dd>{definition.minimumSamplePerVariant.toLocaleString('en-US')} per version</dd>
          </div>
        </dl>
        <aside className="ds-x-plan-actions">
          <p className="ds-chart-note">
            A started plan can&rsquo;t be edited, so the result always matches what people saw.{' '}
            <b>Change the plan</b> makes the next version as a draft, pre-filled from this one.
          </p>
          {change}
          {invalidate}
        </aside>
      </div>
      {decisions ? (
        <section className="ds-x-ledger">
          <p className="ds-label">Decisions</p>
          {decisions.length === 0 ? (
            <p className="ds-chart-note">No decision has been recorded for this version.</p>
          ) : (
            <ol>
              {decisions.map((record) => (
                <li key={record.id}>
                  <b>
                    {record.recordKind === 'correction' ? 'Correction' : 'Decision'}:{' '}
                    {record.outcome === 'ship_treatment' && record.chosenVariantKey
                      ? `Ship ${definition.variants.find((variant) => variant.key === record.chosenVariantKey)?.label ?? record.chosenVariantKey}`
                      : (OUTCOME_WORDS[record.outcome] ?? record.outcome)}
                  </b>{' '}
                  — {record.rationale}. <small>{day(record.createdAt)}</small>
                </li>
              ))}
            </ol>
          )}
        </section>
      ) : null}
    </>
  )
}

// Growth Engine v1 · Sprint 4, Story 4.3 — the side-by-side variant comparison (no `?version=`).
// Behind per-tenant authorization (same gate as /funnel and /impact) and, by contract, NOT behind
// EXPERIMENT_GOVERNANCE_ENABLED. Unchanged by experiments-for-humans.
async function LegacyComparison({
  slug,
  experimentKey,
  raw,
}: {
  slug: string
  experimentKey: string
  raw: SearchParams
}) {
  await requireDashboardAccess(slug)
  const metricEvent = scalar(raw.metricEvent)?.trim()
  if (!metricEvent) {
    return (
      <ProductShell projectSlug={slug} section="ship" railActive={'experiments'}>
        <main>
          <h1>
            Experiment — {experimentKey} <small>({slug})</small>
          </h1>
          <p>
            Add a <code>?metricEvent=&lt;event name&gt;</code> query param naming the event that counts as a
            conversion for this experiment.
          </p>
        </main>
      </ProductShell>
    )
  }
  const result = await getExperimentComparison(slug, experimentKey, metricEvent)
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Experiment comparison lookup failed')
    notFound()
  }
  const { comparison } = result
  return (
    <ProductShell projectSlug={slug} section="ship" railActive={'experiments'}>
      <main>
        <h1>
          Experiment — {experimentKey} <small>({slug})</small>
        </h1>
        <p>Metric: {metricEvent}</p>
        {comparison.variants.length === 0 ? (
          <p>No exposure events yet for this experiment.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Variant</th>
                <th>Exposures</th>
                <th>Conversions</th>
                <th>Conversion rate</th>
                <th>Lift vs baseline</th>
              </tr>
            </thead>
            <tbody>
              {comparison.variants.map((variant) => (
                <tr key={variant.key}>
                  <td>
                    {variant.key}
                    {variant.key === comparison.baseline ? ' (baseline)' : ''}
                  </td>
                  <td>{variant.exposures}</td>
                  <td>{variant.conversions}</td>
                  <td>{(variant.conversionRate * 100).toFixed(1)}%</td>
                  <td>
                    {variant.lift === null
                      ? '—'
                      : `${variant.lift >= 0 ? '+' : ''}${(variant.lift * 100).toFixed(1)}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <p>
          <em>Basic lift only — no statistical-significance engine (that&rsquo;s a later epic).</em>
        </p>
      </main>
    </ProductShell>
  )
}
