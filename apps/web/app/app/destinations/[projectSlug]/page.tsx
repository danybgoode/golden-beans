import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { listDestinations } from '@/lib/destinations'
import { listRecentDeliveries, listRecentAttempts, getDeliveryHealth } from '@/lib/deliveries'
import { DestinationManager } from './destination-manager'
import { ProductShell } from '@/components/product/ProductShell'

// event-destination-router · Sprint 2, Story 2.1 — the per-project destination dashboard. OWNER-only,
// like API keys: a destination mints a signing secret and points our servers at an outbound URL, so
// it is credential-class administration. An ordinary member gets a 404 here even for a project they
// can otherwise read (requireProjectOwnership).
export const dynamic = 'force-dynamic'

export default async function DestinationsPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const { projectId } = await requireProjectOwnership(projectSlug)
  const [destinations, deliveries, attempts, health] = await Promise.all([
    listDestinations(projectId),
    listRecentDeliveries(projectId),
    listRecentAttempts(projectId),
    getDeliveryHealth(projectId),
  ])

  return (
    <ProductShell projectSlug={projectSlug} section="setup" railActive={'destinations'}>
      <main>
        {/* ── design-system-rails · Sprint 4, Story 4.6 — reference state `setup-destinations` ───
            The head, the answer line, the list and the create form all live in the manager now,
            because every one of them is either driven by or gated on client state. What stays here
            is the read and the ATTEMPT LOG, which is read-only and therefore server-rendered.

            ⚠️ **Two nine-column tables left the top of this page.** "Delivery health" is now the
            split bar on each row — the approved state puts it beside the destination it describes,
            rather than in a second table a reader had to join by name. The attempt log moved onto
            the rows too in Story 2.4 — this said "below, behind a disclosure" and that disclosure
            is gone (fresh reviewer, Minor: a comment describing markup the same diff deleted). */}
        <DestinationManager
          slug={projectSlug}
          destinations={destinations}
          deliveries={deliveries}
          attempts={attempts}
          health={health}
        />

        {/* ── The append-only attempt log moved INTO each destination's row ─────────────────
            It was a `<details>` here, holding the immutable record of every send. The approved
            `setup-destinations` state draws no such table, and deleting it would have removed the
            only record of what actually happened — so Daniel's call (2026-09-09) put it, and the
            recent-deliveries table that owns `replayDeliveryAction`, behind a per-row `Deliveries`
            action. Evidence belongs to the destination it describes; see `deliveries-dialog.tsx`. */}
      </main>
    </ProductShell>
  )
}
