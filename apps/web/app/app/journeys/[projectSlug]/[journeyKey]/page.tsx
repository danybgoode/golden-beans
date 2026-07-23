import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { parseJourneyCohortRequest } from '@/lib/journey-cohort-request'
import { validateJourneyKey } from '@/lib/journey-definition'
import {
  getActiveJourneyVersionByProjectId,
  getJourneyCohortByProjectId,
} from '@/lib/journey-query'

export const dynamic = 'force-dynamic'

type Query = Record<string, string | string[] | undefined>

export default async function JourneyCohortPage({
  params,
  searchParams,
}: {
  params: Promise<{ projectSlug: string; journeyKey: string }>
  searchParams: Promise<Query>
}) {
  if (!isJourneyProjectionsEnabled()) notFound()
  const { projectSlug, journeyKey } = await params
  if (!validateJourneyKey(journeyKey)) notFound()
  const membership = await requireProjectMembership(projectSlug)
  const raw = await searchParams
  const defaults = defaultWindow()

  let rawVersion = scalar(raw.version)
  if (!rawVersion) {
    const active = await getActiveJourneyVersionByProjectId(membership.projectId, journeyKey)
    if (!active.ok) {
      if (active.reason === 'query_failed') throw new Error('Journey version lookup failed')
      notFound()
    }
    rawVersion = String(active.version)
  }

  const parsed = parseJourneyCohortRequest({
    version: rawVersion,
    from: scalar(raw.from) ?? defaults.from,
    to: scalar(raw.to) ?? defaults.to,
    asOf: scalar(raw.asOf) ?? defaults.asOf,
    timezone: scalar(raw.timezone) ?? 'UTC',
    staleAfterHours: scalar(raw.staleAfterHours),
    drilldown: scalar(raw.drilldown),
    cursor: scalar(raw.cursor),
    pageSize: scalar(raw.pageSize),
  })
  if (!parsed.ok) {
    return (
      <main>
        <h1>Journey cohort — {journeyKey}</h1>
        <p role="alert">{parsed.error}</p>
        <p><a href={`/app/journeys/${encodeURIComponent(projectSlug)}/${encodeURIComponent(journeyKey)}`}>Reset the cohort window</a></p>
      </main>
    )
  }

  const result = await getJourneyCohortByProjectId(
    membership.projectId,
    journeyKey,
    parsed.version,
    parsed.options,
  )
  if (!result.ok) {
    if (result.reason === 'query_failed') throw new Error('Journey cohort lookup failed')
    if (result.reason === 'invalid_request') {
      return <main><h1>Journey cohort — {journeyKey}</h1><p role="alert">That drilldown is not valid for this journey definition.</p></main>
    }
    if (result.reason === 'resource_limit') {
      return <main><h1>Journey cohort — {journeyKey}</h1><p role="alert">This journey exceeds the query-time raw-fact safety limit. Reduce matching history or split the definition before retrying.</p></main>
    }
    notFound()
  }

  const { journey, cohort, diagnostics } = result
  const baseQuery = new URLSearchParams({
    version: String(journey.definitionVersion),
    from: cohort.cohort.from,
    to: cohort.cohort.to,
    asOf: cohort.cohort.asOf,
    timezone: cohort.cohort.timezone,
    staleAfterHours: String(cohort.freshness.staleAfterHours),
    pageSize: String(parsed.options.pageSize),
  })
  const drilldownHref = (key: string, cursor?: string | null) => {
    const query = new URLSearchParams(baseQuery)
    query.set('drilldown', key)
    if (cursor) query.set('cursor', cursor)
    return `?${query.toString()}`
  }

  return (
    <main>
      <h1>Journey cohort — {journey.key} <small>({projectSlug})</small></h1>
      <p><a href={`/app/journeys/${encodeURIComponent(projectSlug)}`}>← Journey definitions</a></p>
      <dl>
        <dt>Definition</dt><dd>v{journey.definitionVersion} · <code>{journey.entityType}</code></dd>
        <dt>Cohort window</dt><dd>{formatInTimezone(cohort.cohort.from, cohort.cohort.timezone)} ≤ entry &lt; {formatInTimezone(cohort.cohort.to, cohort.cohort.timezone)}</dd>
        <dt>As of</dt><dd>{formatInTimezone(cohort.cohort.asOf, cohort.cohort.timezone)}</dd>
        <dt>Display timezone</dt><dd>{cohort.cohort.timezone} (window semantics use the explicit instants above)</dd>
        <dt>Entry rule</dt><dd>{cohort.cohort.entryMode}{cohort.cohort.entryStageKey ? ` · ${cohort.cohort.entryStageKey}` : ''}</dd>
        <dt>Subjects</dt><dd><a href={drilldownHref(cohort.cohort.drilldown)}>{cohort.cohort.subjectCount}</a></dd>
        <dt>Source freshness</dt>
        <dd>{cohort.freshness.latestReceiptAt ? formatInTimezone(cohort.freshness.latestReceiptAt, cohort.cohort.timezone) : 'No matching source facts'} · {cohort.freshness.status}</dd>
        <dt>Relevant events</dt><dd>{diagnostics.relevantEventCount}</dd>
        <dt>Current query time</dt><dd>{diagnostics.queryDurationMs} ms</dd>
        <dt>Query evidence</dt>
        <dd>
          {diagnostics.telemetryStatus === 'available'
            ? `${diagnostics.sampleCount} bounded samples · p50 ${diagnostics.p50QueryDurationMs} ms · p95 ${diagnostics.p95QueryDurationMs} ms · max ${diagnostics.maxRelevantEventCount} relevant events`
            : 'Telemetry unavailable; this analytical result is still valid.'}
        </dd>
        <dt>Scale decision</dt>
        <dd>
          {diagnostics.materializationDecision} · tripwires are p95 &gt; {diagnostics.thresholds.p95QueryDurationMs} ms
          {' '}or relevant events &gt; {diagnostics.thresholds.relevantEventCount.toLocaleString('en-US')}
        </dd>
      </dl>

      {cohort.populationStatus === 'no_qualifying_events' && (
        <p role="status">No qualifying events match this definition before the window end.</p>
      )}
      {cohort.populationStatus === 'zero_subjects' && (
        <p role="status">Qualifying events exist, but zero subjects entered this cohort window.</p>
      )}
      {cohort.freshness.status === 'stale' && (
        <p role="alert">Source receipts are older than the {cohort.freshness.staleAfterHours}-hour freshness threshold.</p>
      )}

      <h2>Stage conversion and aging</h2>
      <table>
        <thead>
          <tr>
            <th>Stage</th><th>Actually satisfied</th><th>Actual cohort conversion</th><th>Continuation from previous</th>
            <th>Positional at or beyond</th><th>At-or-beyond share</th>
            <th>Current</th><th>Missing next</th><th>Median age</th><th>P90 age</th>
          </tr>
        </thead>
        <tbody>
          {cohort.stages.map((stage) => (
            <tr key={stage.key}>
              <th scope="row"><code>{stage.key}</code></th>
              <td><a href={drilldownHref(stage.drilldowns.satisfied)}>{stage.satisfiedCount}</a></td>
              <td>{formatRate(stage.cohortConversionRate)}</td>
              <td>{formatRate(stage.continuationFromPreviousRate)}</td>
              <td><a href={drilldownHref(stage.drilldowns.atOrBeyond)}>{stage.atOrBeyondCount}</a></td>
              <td>{formatRate(stage.atOrBeyondShare)}</td>
              <td><a href={drilldownHref(stage.drilldowns.current)}>{stage.currentCount}</a></td>
              <td>
                {stage.drilldowns.missingNext
                  ? <a href={drilldownHref(stage.drilldowns.missingNext)}>{stage.missingNextStageCount}</a>
                  : '—'}
              </td>
              <td>{formatHours(stage.medianAgeHours)}</td>
              <td>{formatHours(stage.p90AgeHours)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2>Retention</h2>
      {cohort.retention ? (
        <dl>
          <dt>Rule</dt><dd>{cohort.retention.stageKey} within {cohort.retention.withinDays} days of {cohort.retention.anchorStageKey}</dd>
          <dt>Eligible</dt><dd><a href={drilldownHref(cohort.retention.drilldowns.eligible)}>{cohort.retention.eligibleCount}</a></dd>
          <dt>Matured</dt><dd>{cohort.retention.maturedCount}</dd>
          <dt>Met</dt><dd><a href={drilldownHref(cohort.retention.drilldowns.met)}>{cohort.retention.metCount}</a></dd>
          <dt>Missed</dt><dd><a href={drilldownHref(cohort.retention.drilldowns.missed)}>{cohort.retention.missedCount}</a></dd>
          <dt>Pending</dt><dd><a href={drilldownHref(cohort.retention.drilldowns.pending)}>{cohort.retention.pendingCount}</a></dd>
          <dt>Rate</dt><dd>{formatRate(cohort.retention.rate)}</dd>
        </dl>
      ) : <p>No retention rule is configured for definition v{journey.definitionVersion}.</p>}

      {cohort.drilldown && (
        <section>
          <h2>Opaque subject drilldown — <code>{cohort.drilldown.key}</code></h2>
          <p>{cohort.drilldown.total} total; showing a bounded page.</p>
          {cohort.drilldown.subjectIds.length === 0
            ? <p>No subjects on this page.</p>
            : <ul>{cohort.drilldown.subjectIds.map((id) => <li key={id}><code>{id}</code></li>)}</ul>}
          {cohort.drilldown.nextCursor && (
            <p><a href={drilldownHref(cohort.drilldown.key, cohort.drilldown.nextCursor)}>Next page</a></p>
          )}
        </section>
      )}
    </main>
  )
}

function scalar(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined
}

function defaultWindow(): { from: string; to: string; asOf: string } {
  const to = new Date()
  const from = new Date(to.getTime() - 30 * 24 * 60 * 60 * 1_000)
  return { from: from.toISOString(), to: to.toISOString(), asOf: to.toISOString() }
}

function formatRate(value: number | null): string {
  return value === null ? '—' : `${(value * 100).toFixed(1)}%`
}

function formatHours(value: number | null): string {
  return value === null ? '—' : `${value.toFixed(1)} h`
}

function formatInTimezone(value: string, timezone: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    dateStyle: 'medium',
    timeStyle: 'long',
  }).format(new Date(value))
}
