import type { JourneyCohortQueryResult } from '@/lib/journey-query'

// The journey cohort's full diagnostic detail — design-system-rails · Sprint 5, Story 5.5.
//
// ── Why this moved into its own file rather than being deleted ────────────────────────────────
// `entity-journeys` shipped the window semantics, the drilldowns, the query-evidence telemetry, the
// materialisation tripwires, the retention rule and the ten-column stage table. The approved
// `measure-journey` state draws none of it: it draws the stage bars, the drop-off, and the version
// history.
//
// So the page leads with the approved design and keeps ALL of this one keystroke below it. The
// numbers here are the same numbers the bars are drawn from — `cohort.stages` — which is what makes
// this a second VIEW rather than a second source: a reader who wants the exact figure, the median
// age, or the subjects behind a count gets them, and cannot be shown a figure that disagrees with
// the picture above.
//
// ⚠️ Moved **verbatim in substance**. The only edits are the ones extraction forces.

type CohortSuccess = Extract<JourneyCohortQueryResult, { ok: true }>

export function JourneyCohortDetail({
  result,
  drilldownHref,
}: {
  result: CohortSuccess
  drilldownHref: (key: string, cursor?: string | null) => string
}) {
  const { journey, cohort, diagnostics } = result
  return (
    <>
      <dl>
        <dt>Definition</dt>
        <dd>
          v{journey.definitionVersion} · <code>{journey.entityType}</code>
        </dd>
        <dt>Cohort window</dt>
        <dd>
          {formatInTimezone(cohort.cohort.from, cohort.cohort.timezone)} ≤ entry &lt;{' '}
          {formatInTimezone(cohort.cohort.to, cohort.cohort.timezone)}
        </dd>
        <dt>As of</dt>
        <dd>{formatInTimezone(cohort.cohort.asOf, cohort.cohort.timezone)}</dd>
        <dt>Display timezone</dt>
        <dd>{cohort.cohort.timezone} (window semantics use the explicit instants above)</dd>
        <dt>Entry rule</dt>
        <dd>
          {cohort.cohort.entryMode}
          {cohort.cohort.entryStageKey ? ` · ${cohort.cohort.entryStageKey}` : ''}
        </dd>
        <dt>Subjects</dt>
        <dd>
          <a href={drilldownHref(cohort.cohort.drilldown)}>{cohort.cohort.subjectCount}</a>
        </dd>
        <dt>Source freshness</dt>
        <dd>
          {cohort.freshness.latestReceiptAt
            ? formatInTimezone(cohort.freshness.latestReceiptAt, cohort.cohort.timezone)
            : 'No matching source facts'}{' '}
          · {cohort.freshness.status}
        </dd>
        <dt>Relevant events</dt>
        <dd>{diagnostics.relevantEventCount}</dd>
        <dt>Current query time</dt>
        <dd>{diagnostics.queryDurationMs} ms</dd>
        <dt>Query evidence</dt>
        <dd>
          {diagnostics.telemetryStatus === 'available'
            ? `${diagnostics.sampleCount} bounded samples · p50 ${diagnostics.p50QueryDurationMs} ms · p95 ${diagnostics.p95QueryDurationMs} ms · max ${diagnostics.maxRelevantEventCount?.toLocaleString('en-US') ?? 'unknown'} relevant events`
            : 'Telemetry unavailable; this analytical result is still valid.'}
        </dd>
        <dt>Scale decision</dt>
        <dd>
          {diagnostics.materializationDecision} · tripwires are p95 &gt;{' '}
          {diagnostics.thresholds.p95QueryDurationMs} ms or relevant events &gt;{' '}
          {diagnostics.thresholds.relevantEventCount.toLocaleString('en-US')}
        </dd>
      </dl>

      {cohort.populationStatus === 'no_qualifying_events' && (
        <p role="status">No qualifying events match this definition before the window end.</p>
      )}
      {cohort.populationStatus === 'zero_subjects' && (
        <p role="status">Qualifying events exist, but zero subjects entered this cohort window.</p>
      )}
      {cohort.freshness.status === 'stale' && (
        <p role="alert">
          Source receipts are older than the {cohort.freshness.staleAfterHours}-hour freshness threshold.
        </p>
      )}

      <h2>Stage conversion and aging</h2>
      <table>
        <thead>
          <tr>
            <th>Stage</th>
            <th>Actually satisfied</th>
            <th>Actual cohort conversion</th>
            <th>Continuation from previous</th>
            <th>Positional at or beyond</th>
            <th>At-or-beyond share</th>
            <th>Current</th>
            <th>Missing next</th>
            <th>Median age</th>
            <th>P90 age</th>
          </tr>
        </thead>
        <tbody>
          {cohort.stages.map((stage) => (
            <tr key={stage.key}>
              <th scope="row">
                <code>{stage.key}</code>
              </th>
              <td>
                <a href={drilldownHref(stage.drilldowns.satisfied)}>{stage.satisfiedCount}</a>
              </td>
              <td>{formatRate(stage.cohortConversionRate)}</td>
              <td>{formatRate(stage.continuationFromPreviousRate)}</td>
              <td>
                <a href={drilldownHref(stage.drilldowns.atOrBeyond)}>{stage.atOrBeyondCount}</a>
              </td>
              <td>{formatRate(stage.atOrBeyondShare)}</td>
              <td>
                <a href={drilldownHref(stage.drilldowns.current)}>{stage.currentCount}</a>
              </td>
              <td>
                {stage.drilldowns.missingNext ? (
                  <a href={drilldownHref(stage.drilldowns.missingNext)}>{stage.missingNextStageCount}</a>
                ) : (
                  '—'
                )}
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
          <dt>Rule</dt>
          <dd>
            {cohort.retention.stageKey} within {cohort.retention.withinDays} days of{' '}
            {cohort.retention.anchorStageKey}
          </dd>
          <dt>Eligible</dt>
          <dd>
            <a href={drilldownHref(cohort.retention.drilldowns.eligible)}>{cohort.retention.eligibleCount}</a>
          </dd>
          <dt>Matured</dt>
          <dd>{cohort.retention.maturedCount}</dd>
          <dt>Met</dt>
          <dd>
            <a href={drilldownHref(cohort.retention.drilldowns.met)}>{cohort.retention.metCount}</a>
          </dd>
          <dt>Missed</dt>
          <dd>
            <a href={drilldownHref(cohort.retention.drilldowns.missed)}>{cohort.retention.missedCount}</a>
          </dd>
          <dt>Pending</dt>
          <dd>
            <a href={drilldownHref(cohort.retention.drilldowns.pending)}>{cohort.retention.pendingCount}</a>
          </dd>
          <dt>Rate</dt>
          <dd>{formatRate(cohort.retention.rate)}</dd>
        </dl>
      ) : (
        <p>No retention rule is configured for definition v{journey.definitionVersion}.</p>
      )}

      {cohort.drilldown && (
        <section>
          <h2>
            Opaque subject drilldown — <code>{cohort.drilldown.key}</code>
          </h2>
          <p>{cohort.drilldown.total} total; showing a bounded page.</p>
          {cohort.drilldown.subjectIds.length === 0 ? (
            <p>No subjects on this page.</p>
          ) : (
            <ul>
              {cohort.drilldown.subjectIds.map((id) => (
                <li key={id}>
                  <code>{id}</code>
                </li>
              ))}
            </ul>
          )}
          {cohort.drilldown.nextCursor && (
            <p>
              <a href={drilldownHref(cohort.drilldown.key, cohort.drilldown.nextCursor)}>Next page</a>
            </p>
          )}
        </section>
      )}
    </>
  )
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
