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
import { formatUtc } from '@/lib/format-utc'
import type {
  ScenarioDashboardRun,
  ScenarioDashboardSecurityResult,
  ScenarioDashboardView,
} from '@/lib/scenario-dashboard'

/**
 * A run's timestamp, or a dash.
 *
 * ⚠️ **`formatUtc`, not a local re-derivation** (cross-agent review, agy). The inline version this
 * replaced was `new Date(value).toISOString()`, which THROWS `RangeError: Invalid time value` on a
 * malformed row — and `format-utc.ts`'s own header says it exists so that "a bad historical row
 * cannot crash a dashboard". Same output for every valid value; the difference is entirely in what
 * happens to the one bad row nobody has yet.
 *
 * The `null → '—'` case stays here: absent and unreadable are different facts, and `formatUtc`
 * answers the second.
 */
export function timestamp(value: string | null): string {
  return value === null ? '—' : formatUtc(value)
}

export function shortId(value: string): string {
  return value.slice(0, 8)
}

/**
 * How long a scenario definition's window is, in seconds.
 *
 * ⚠️ Exported HERE rather than left inline in two places (cross-agent review, agy). `DrillEvidence`
 * re-derived the same subtraction, and two copies of "how long is this window" is the shape that
 * drifts the first time one of them learns about, say, a clamped maximum.
 */
export function durationSeconds(startAt: string, expiresAt: string): number {
  return Math.round((Date.parse(expiresAt) - Date.parse(startAt)) / 1_000)
}

/**
 * The run table's read-only columns.
 *
 * `elapsed` is injected rather than imported: the live "Elapsed 00:41" counter is a client-only
 * ticking component that belongs to the workspace. Omitting it renders NOTHING extra in the state
 * cell — the started time has its own column and is shown either way (cross-agent review, agy: an
 * earlier version of this sentence claimed the dialog rendered the time "instead of" the counter,
 * which is not what the cell does). A parameter keeps the other seven columns identical.
 */
export function scenarioRunColumns({
  view,
  elapsed,
  impactAnchors = false,
  definitionAnchors = false,
}: {
  view: ScenarioDashboardView
  elapsed?: (run: ScenarioDashboardRun) => React.ReactNode
  /**
   * Whether a `View impact evidence` anchor has anything to jump TO in this render.
   *
   * ⚠️ **Default `false`, and the default is the safe one** (cross-agent review, Codex, round 2).
   * Story 2.5 moved the impact articles out of `ScenarioWorkspace` and into the per-drill
   * `DrillEvidence` dialog — and this column kept emitting `href="#impact-…"` in both places, so in
   * the workspace it pointed at an id that is either absent or inside a closed dialog. A link that
   * goes nowhere is worse than no link.
   *
   * Only the render that CONTAINS those articles opts in — `DrillEvidence` does, and the workspace
   * does not. A caller that starts rendering them has to say so, rather than a caller that stops
   * having to remember to turn it off.
   */
  impactAnchors?: boolean
  /**
   * Whether a `#definition-…` anchor has anything to jump TO in this render.
   *
   * ⚠️ **The extraction DROPPED this link, and that is a capability lost in a refactor**
   * (cross-agent review, Codex, round 3). The workspace's original run column linked each run to the
   * immutable definition that produced it — `<a href="#definition-KEY-VERSION">` — and the shared
   * version rendered plain text, so the authoring modal lost an in-modal navigation path it had.
   * "Moved, not rewritten" is this epic's own rule for exactly this failure.
   *
   * Same default and same reasoning as `impactAnchors`: only the render that CONTAINS those
   * `<article id="definition-…">` elements opts in. Both the workspace and `DrillEvidence` do —
   * the dialog grew its own read-only `Definitions` section in review round 5, precisely so this
   * link would have a target there rather than being deleted.
   */
  definitionAnchors?: boolean
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
            {definitionAnchors ? (
              <a href={`#definition-${row.scenarioKey}-${row.definitionVersion}`}>
                {row.scenarioKey} v{row.definitionVersion}
              </a>
            ) : (
              <>
                {row.scenarioKey} v{row.definitionVersion}
              </>
            )}
            <br />
            <small>run {shortId(row.id)}</small>
            {impact && impactAnchors ? (
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
