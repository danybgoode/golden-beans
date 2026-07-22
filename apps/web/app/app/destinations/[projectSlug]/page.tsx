import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listDestinations } from '@/lib/destinations'
import { listRecentDeliveries, getDeliveryHealth } from '@/lib/deliveries'
import { DestinationManager } from './destination-manager'

// event-destination-router · Sprint 2, Story 2.1 — the per-project destination dashboard. OWNER-only,
// like API keys: a destination mints a signing secret and points our servers at an outbound URL, so
// it is credential-class administration. An ordinary member gets a 404 here even for a project they
// can otherwise read (requireProjectOwnership).
export const dynamic = 'force-dynamic'

export default async function DestinationsPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const [destinations, deliveries, health] = await Promise.all([
    listDestinations(projectId),
    listRecentDeliveries(projectId),
    getDeliveryHealth(projectId),
  ])

  return (
    <main>
      <h1>Destinations — {projectSlug}</h1>
      <p>
        <a href="/app">← Your projects</a>
      </p>
      <p>
        A destination reliably delivers this project&apos;s events to an external webhook. Each
        delivery is signed (HMAC-SHA256) so your receiver can verify it came from Golden Beans. New
        destinations start <strong>disabled</strong> — configure it, send a test, then enable it.
      </p>
      {/* event-destination-router · Sprint 3, Story 3.3 — the delivery operating view. Read-only, so
          it renders server-side here rather than travelling through the client manager component.
          Shows enabled sinks, success/failure/retry counts and the last delivery — and deliberately
          NO signing secret, NO target URL and no event payload: this answers "is delivery working?",
          which needs none of those. */}
      <h2>Delivery health</h2>
      {health.length === 0 ? (
        <p>No destinations configured yet.</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>Destination</th>
              <th>State</th>
              <th>Delivered</th>
              <th>Failed attempts</th>
              <th>Awaiting retry</th>
              <th>Dead-lettered</th>
              <th>Queued</th>
              <th>Total attempts</th>
              <th>Last delivery</th>
            </tr>
          </thead>
          <tbody>
            {health.map((h) => (
              <tr key={h.destinationId}>
                <td>{h.name}</td>
                <td>{h.enabled ? 'enabled' : 'disabled'}</td>
                {/* "Delivered" and "Failed attempts" are CUMULATIVE (from the attempt log, survive
                    replay); "Awaiting retry", "Dead-lettered" and "Queued" are CURRENT row state. */}
                <td>{h.delivered}</td>
                <td>{h.failedAttempts}</td>
                <td>{h.awaitingRetry}</td>
                <td>{h.dead}</td>
                <td>{h.pending + h.inFlight}</td>
                <td>{h.totalAttempts}</td>
                <td>
                  {h.lastDeliveryAt
                    ? `${new Date(h.lastDeliveryAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`
                    : 'never'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <DestinationManager slug={projectSlug} destinations={destinations} deliveries={deliveries} />
    </main>
  )
}
