'use client'

// mockups-as-built · Story 2.5 — the drill evidence tables, declared ONCE.
//
// ── Why this file exists ──────────────────────────────────────────────────────────────────────
// Story 2.2 put the whole `ScenarioWorkspace` — the authoring form AND the run history, the
// defensive-simulation results, the impact snapshots and the breaker trips — behind the approved
// `▸ Run a drill` control. That control says it authors. A member who cannot author still needs the
// evidence, and `scenario-authoring-dark.authed.spec.ts` exists to prove exactly that stays
// readable.
//
// Daniel's ruling for the identical case on Destinations (2026-09-09) was per-row evidence,
// separate from the authoring control, and he extended it to Scenarios on 2026-09-10. So a drill's
// evidence opens from the drill's own row (`DrillEvidence`), and `▸ Run a drill` goes back to
// authoring only.
//
// ⚠️ **The columns live here rather than in either consumer.** Both the read-only per-row dialog and
// the operator's workspace draw the same run table, and two column lists in two files that
// currently agree is CODE-QUALITY #2 — the failure the block vocabulary in `state-contract-core.mjs`
// is also written to avoid. One list, and the workspace APPENDS its actions column to it.

import type { DataTableColumn } from '@/components/ui/DataTable'
import type {
  ScenarioDashboardRun,
  ScenarioDashboardSecurityResult,
  ScenarioDashboardView,
} from '@/lib/scenario-dashboard'

export function timestamp(value: string | null): string {
  return value ? `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '—'
}

export function shortId(value: string): string {
  return value.slice(0, 8)
}

/**
 * The run table's read-only columns.
 *
 * `elapsed` is injected rather than imported: the live "Elapsed 00:41" counter is a client-only
 * ticking component that belongs to the workspace, and the read-only dialog renders the started
 * time instead of a counter. A parameter keeps the other seven columns identical either way.
 */
export function scenarioRunColumns({
  view,
  elapsed,
}: {
  view: ScenarioDashboardView
  elapsed?: (run: ScenarioDashboardRun) => React.ReactNode
}): DataTableColumn<ScenarioDashboardRun>[] {
  return [
    {
      key: 'scenario',
      header: 'Scenario',
      value: (row) => row.scenarioKey,
      cell: (row) => {
        const impact = view.impacts.find((entry) => entry.runId === row.id)
        return (
          <span id={`run-${row.id}`}>
            {row.scenarioKey} v{row.definitionVersion}
            <br />
            <small>run {shortId(row.id)}</small>
            {impact ? (
              <>
                <br />
                <a href={`#impact-${impact.id}`}>View impact evidence</a>
              </>
            ) : null}
          </span>
        )
      },
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
          {row.status === 'running' && elapsed ? elapsed(row) : null}
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
  ]
}

/** The defensive-simulation table. Read-only on both sides — a security result has no control. */
export function scenarioSecurityColumns(): DataTableColumn<ScenarioDashboardSecurityResult>[] {
  return [
    {
      key: 'when',
      header: 'When',
      value: (row) => row.createdAt,
      cell: (row) => timestamp(row.createdAt),
    },
    {
      key: 'run',
      header: 'Run',
      value: (row) => row.runId,
      cell: (row) => <a href={`#run-${row.runId}`}>{shortId(row.runId)}</a>,
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
  ]
}
