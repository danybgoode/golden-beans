import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isJourneyProjectionsEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { listJourneyRegistries } from '@/lib/journeys'
import { JourneyManager } from './journey-manager'

export const dynamic = 'force-dynamic'

export default async function JourneysPage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  // Dark means nonexistent, before auth or project lookup. Old surfaces remain untouched.
  if (!isJourneyProjectionsEnabled()) notFound()
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const journeys = await listJourneyRegistries(membership.projectId)

  return (
    <main>
      <h1>Journey definitions — {projectSlug}</h1>
      <p><a href="/app">← Your projects</a></p>
      <p>
        Definitions turn canonical subject events into an ordered lifecycle. Versions are immutable:
        create a new draft for every change, then activate it when its meaning is ready to use.
      </p>
      <JourneyManager
        slug={projectSlug}
        journeys={journeys}
        canManage={isOwner({ projectId: membership.projectId, role: membership.role })}
      />
    </main>
  )
}
