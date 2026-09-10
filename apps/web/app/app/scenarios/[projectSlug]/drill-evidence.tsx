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
import {
  durationSeconds,
  scenarioRunColumns,
  scenarioSecurityColumns,
  shortId,
  timestamp,
} from './scenario-evidence-columns'

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
  const definitions = view.definitions.filter((item) => item.scenarioKey === scenarioKey)

  return (
    <NewThingDialog
      variant="secondary"
      size="sm"
      label="Evidence"
      title={`Evidence — ${scenarioKey}`}
      lede="Every run of this drill, what the defensive simulations observed, and the impact snapshots they produced. Read-only."
    >
      {/* ── The immutable DEFINITIONS this drill has had ────────────────────────────────────────
          ⚠️ **This section exists because moving the impact evidence here dropped a link**
          (cross-agent review, Codex, round 5). The workspace's impact article carried
          `Open the producing definition` → `#definition-KEY-VERSION`, and the anchor's target lives
          in `ScenarioWorkspace`, which a read-only reader is not in.
          The half-fix would have been to delete the link and call the provenance "stated"; the other
          half-fix would have been to keep the anchor pointing at nothing, which is the defect round 3
          of this same review corrected one component over. Bringing the TARGET here is what actually
          loses nothing: the definition is what bounded the run, so on a page of evidence it is the
          most load-bearing piece of it.

          Read-only by construction — the launch control stays in the workspace with its confirmation
          and its capability gates. */}
      <h2>Definitions</h2>
      {definitions.length === 0 ? (
        <p>No definition is on file for this drill.</p>
      ) : (
        definitions.map((item) => {
          const duration = durationSeconds(item.definition.startAt, item.definition.expiresAt)
          const flag = view.faultFlags.find(
            (candidate) =>
              candidate.key === item.definition.flag.key &&
              candidate.version === item.definition.flag.definitionVersion
          )
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
              {flag ? (
                <p>
                  <strong>Payloads:</strong> {flag.payloadSummary}
                  <br />
                  <strong>Targeting:</strong> {flag.targetingSummary}
                </p>
              ) : null}
            </article>
          )
        })
      )}

      <h2>Runs</h2>
      <DataTable
        caption={`Runs of ${scenarioKey}`}
        // Both anchor targets are rendered in THIS dialog — the definitions above and the impact
        // articles below — so both links resolve. `ScenarioWorkspace` opts into `definitionAnchors`
        // for its own copy of the definitions, and into neither anchor it does not render.
        columns={scenarioRunColumns({ view, impactAnchors: true, definitionAnchors: true })}
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
                {/* Restored — the target is the `Definitions` section above, in this same dialog. */}
                <a href={`#definition-${impact.scenarioKey}-${impact.scenarioVersion}`}>
                  Open the producing definition
                </a>{' '}
                · <a href={`#run-${impact.runId}`}>Open the producing run</a> ·{' '}
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
