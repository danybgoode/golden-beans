import { ProductShell } from '@/components/product/ProductShell'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { getScenarioDashboardView } from '@/lib/scenario-dashboard'

export const dynamic = 'force-dynamic'

function timestamp(value: string | null): string {
  return value ? `${new Date(value).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '—'
}

function shortId(value: string): string {
  return value.slice(0, 8)
}

export default async function ScenariosPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const view = await getScenarioDashboardView(membership.projectId)
  const policyKeys = new Map(view.policies.map((policy) => [policy.id, policy.key]))

  return (
    <ProductShell>
      <main>
        <h1>Scenarios &amp; breakers — {projectSlug}</h1>
        <p>
          <a href="/app">← Your projects</a>
        </p>
        <p>
          Read-only operating evidence for bounded resilience and defensive-security exercises.
          Runtime gates may stay OFF while definitions, stopped runs, immutable impact snapshots and
          breaker decisions remain inspectable.
        </p>

        <h2>Registered targets</h2>
        <table>
          <thead>
            <tr><th>Target</th><th>Kind</th><th>Origin</th><th>Ownership</th><th>Verified</th></tr>
          </thead>
          <tbody>
            {view.targets.length === 0 ? (
              <tr><td colSpan={5}>No scenario targets registered.</td></tr>
            ) : view.targets.map((target) => (
              <tr key={target.id}>
                <td>{target.key}</td>
                <td>{target.kind}</td>
                <td>{target.origin}</td>
                <td>{target.status}</td>
                <td>{timestamp(target.verifiedAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Recent runs</h2>
        <table>
          <thead>
            <tr>
              <th>Scenario</th><th>Kind / cohort</th><th>Target</th><th>State</th>
              <th>Requests</th><th>Outcomes</th><th>Started</th><th>Stopped</th>
            </tr>
          </thead>
          <tbody>
            {view.runs.length === 0 ? (
              <tr><td colSpan={8}>No scenario runs yet.</td></tr>
            ) : view.runs.map((run) => (
              <tr key={run.id}>
                <td>{run.scenarioKey} v{run.definitionVersion}<br /><small>{shortId(run.id)}</small></td>
                <td>{run.kind} / {run.cohort}</td>
                <td>{run.targetKey}<br /><small>{run.environment}</small></td>
                <td>{run.status} · r{run.revision}</td>
                <td>{run.requestCount}</td>
                <td>{run.successCount} ok / {run.failureCount} failed</td>
                <td>{timestamp(run.startedAt)}</td>
                <td>{timestamp(run.stoppedAt)}{run.stopReason ? <><br /><small>{run.stopReason}</small></> : null}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Defensive simulation results</h2>
        <table>
          <thead>
            <tr><th>When</th><th>Template</th><th>Expected</th><th>Observed</th><th>HTTP</th><th>Latency</th></tr>
          </thead>
          <tbody>
            {view.securityResults.length === 0 ? (
              <tr><td colSpan={6}>No defensive simulations recorded.</td></tr>
            ) : view.securityResults.map((result) => (
              <tr key={result.id}>
                <td>{timestamp(result.createdAt)}<br /><small>run {shortId(result.runId)}</small></td>
                <td>{result.template}</td>
                <td>{result.expectedOutcome}</td>
                <td>{result.succeeded ? 'expected guard observed' : result.observedOutcome}</td>
                <td>{result.observedStatuses.join(', ')}</td>
                <td>{result.latencyMs}ms</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Canonical product-impact evidence</h2>
        <p><small>Internal and synthetic cohorts never produce a causal customer claim.</small></p>
        <table>
          <thead>
            <tr><th>When</th><th>Scenario</th><th>Cohort</th><th>Technical delta</th><th>Claim</th><th>Blockers</th></tr>
          </thead>
          <tbody>
            {view.impacts.length === 0 ? (
              <tr><td colSpan={6}>No impact snapshots captured.</td></tr>
            ) : view.impacts.map((impact) => (
              <tr key={impact.id}>
                <td>{timestamp(impact.createdAt)}<br /><small>{impact.reason}</small></td>
                <td>{impact.scenarioKey} v{impact.scenarioVersion}<br /><small>run {shortId(impact.runId)}</small></td>
                <td>{impact.evidence.cohort}</td>
                <td>
                  {impact.evidence.technical.nonZeroDifference ? 'non-zero' : 'none'}
                  <br />
                  <small>
                    failure Δ {impact.evidence.technical.failureRateDelta ?? '—'} · latency Δ{' '}
                    {impact.evidence.technical.latencyP95DeltaMs ?? '—'}ms
                  </small>
                </td>
                <td>{impact.evidence.claim.status}</td>
                <td>{impact.evidence.claim.blockers.join(', ') || 'none'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <h2>Circuit-breaker policies</h2>
        <table>
          <thead>
            <tr><th>Policy</th><th>Bound flag</th><th>State</th><th>Trips</th><th>Confirmation</th><th>Last trip</th></tr>
          </thead>
          <tbody>
            {view.policies.length === 0 ? (
              <tr><td colSpan={6}>No breaker policies configured.</td></tr>
            ) : view.policies.map((policy) => {
              const flag = policy.definition.flag
              const flagLabel = typeof flag === 'object' && flag !== null && 'key' in flag
                ? String(flag.key)
                : 'unknown'
              return (
                <tr key={policy.id}>
                  <td>{policy.key}<br /><small>{shortId(policy.id)}</small></td>
                  <td>{flagLabel}</td>
                  <td>{policy.status} · r{policy.revision}</td>
                  <td>{policy.tripCount}</td>
                  <td>{String(policy.definition.confirmationMode ?? 'unknown')}</td>
                  <td>{timestamp(policy.lastTrippedAt)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <h2>Immutable breaker trips</h2>
        <table>
          <thead>
            <tr><th>When</th><th>Policy</th><th>Mode</th><th>Observed</th><th>Snapshot</th><th>Reason</th></tr>
          </thead>
          <tbody>
            {view.trips.length === 0 ? (
              <tr><td colSpan={6}>No breaker trips recorded.</td></tr>
            ) : view.trips.map((trip) => (
              <tr key={trip.id}>
                <td>{timestamp(trip.createdAt)}</td>
                <td>{policyKeys.get(trip.policyId) ?? shortId(trip.policyId)}</td>
                <td>{trip.mode}</td>
                <td>{trip.observedBasisPoints} bp</td>
                <td>{trip.oldSnapshotVersion} → {trip.newSnapshotVersion}</td>
                <td>{trip.reason}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </ProductShell>
  )
}
