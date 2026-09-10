'use client'

// mockups-as-built · Story 2.5 — ONE drill's evidence, from that drill's own row.
//
// ── The ruling this implements ────────────────────────────────────────────────────────────────
// Story 2.2 deleted the `<details>` labelled "Evidence, breakers and the full run history" and put
// everything that was inside it behind the approved `▸ Run a drill` control. That removed the
// disclosure and kept the capability, which is what D3 asks for — but it left read-only evidence
// behind a control that says it authors, and a member who cannot author reads all of this.
//
// Daniel ruled the identical case on Destinations (2026-09-09) as per-row evidence separate from the
// authoring control, and extended it to Scenarios on 2026-09-10. `deliveries-dialog.tsx` is the
// pattern; this is the same shape one surface over.
//
// ⚠️ **Scoped by `scenarioKey`, and the security results by RUN ID.** A defensive simulation carries
// only the run it belongs to, so this joins through this drill's runs rather than guessing from a
// name — the same reason `DeliveriesDialog` filters attempts by destination id and not by name.
//
// ⚠️ **This component holds NO control.** Launching, stopping and retrying a run stay in
// `ScenarioWorkspace` behind `▸ Run a drill`, where the confirmation dialogs and the capability
// gates already live. A read-only surface that grew a mutation would be the split undone.

import { DataTable } from '@/components/ui/DataTable'
import { NewThingDialog } from '@/components/product/NewThingDialog'
import type { ScenarioDashboardView } from '@/lib/scenario-dashboard'
import { scenarioImpactExperimentReference } from '@/lib/scenario-impact-link'
import { scenarioRunColumns, scenarioSecurityColumns, shortId, timestamp } from './scenario-evidence-columns'

export function DrillEvidence({
  projectSlug,
  scenarioKey,
  view,
}: {
  projectSlug: string
  scenarioKey: string
  view: ScenarioDashboardView
}) {
  const runs = view.runs.filter((run) => run.scenarioKey === scenarioKey)
  const runIds = new Set(runs.map((run) => run.id))
  const securityResults = view.securityResults.filter((result) => runIds.has(result.runId))
  const impacts = view.impacts.filter((impact) => impact.scenarioKey === scenarioKey)

  return (
    <NewThingDialog
      variant="secondary"
      size="sm"
      label="Evidence"
      title={`Evidence — ${scenarioKey}`}
      lede="Every run of this drill, what the defensive simulations observed, and the impact snapshots they produced. Read-only."
    >
      <h2>Runs</h2>
      <DataTable
        caption={`Runs of ${scenarioKey}`}
        columns={scenarioRunColumns({ view })}
        rows={runs}
        rowKey={(row) => row.id}
        empty="This drill has never run — an untested control is an assumption, not evidence."
      />

      <h2>Defensive simulation results</h2>
      <DataTable
        caption={`Defensive simulation results for ${scenarioKey}`}
        columns={scenarioSecurityColumns()}
        rows={securityResults}
        rowKey={(row) => row.id}
        empty="No defensive simulations recorded for this drill."
      />

      <h2>Canonical product-impact evidence</h2>
      <p>
        <strong>Internal and synthetic cohorts never produce a causal customer claim.</strong>
      </p>
      {impacts.length === 0 ? (
        <p>No impact snapshots captured for this drill.</p>
      ) : (
        impacts.map((impact) => {
          const comparable =
            impact.evidence.technical.control.attempts > 0 && impact.evidence.technical.fault.attempts > 0
          const experiment = scenarioImpactExperimentReference(impact.evidence)
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
              <p>
                Captured {timestamp(impact.createdAt)} · run {shortId(impact.runId)} · {impact.reason}
                <br />
                Technical delta: {impact.evidence.technical.nonZeroDifference ? 'non-zero' : 'none'} · failure
                Δ {impact.evidence.technical.failureRateDelta ?? '—'} · latency Δ{' '}
                {impact.evidence.technical.latencyP95DeltaMs ?? '—'}ms
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
                <a href={`#run-${impact.runId}`}>Open the producing run</a> ·{' '}
                {experiment ? (
                  <a
                    href={`/app/experiments/${projectSlug}/${encodeURIComponent(experiment.key)}?version=${experiment.definitionVersion}`}
                  >
                    Open downstream experiment analysis v{experiment.definitionVersion}
                  </a>
                ) : (
                  <span>No downstream experiment reference was captured.</span>
                )}
              </p>
            </article>
          )
        })
      )}
      {view.malformedImpactCount > 0 ? (
        <p role="status">
          {view.malformedImpactCount} malformed impact evidence{' '}
          {view.malformedImpactCount === 1 ? 'record was' : 'records were'} omitted across this project
          because the stored contract could not be verified.
        </p>
      ) : null}
    </NewThingDialog>
  )
}
