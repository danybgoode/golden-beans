import { notFound } from 'next/navigation'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { listExperimentRegistries } from '@/lib/experiments'
import { isExperimentGovernanceEnabled } from '@/lib/flags'
import { isOwner } from '@/lib/roles'
import { ExperimentManager } from './experiment-manager'

export const dynamic = 'force-dynamic'

export default async function ExperimentGovernancePage({
  params,
}: {
  params: Promise<{ projectSlug: string }>
}) {
  // New governance management is nonexistent while dark. The nested legacy comparison page remains.
  if (!isExperimentGovernanceEnabled()) notFound()
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const experiments = await listExperimentRegistries(membership.projectId)

  return (
    <main>
      <h1>Experiment governance — {projectSlug}</h1>
      <p><a href="/app">← Your projects</a></p>
      <p>
        Declare hypothesis, assignment, metrics, direction, planned window and minimum sample per
        variant before exposure. Assignment remains local in the SDK; this registry governs trust,
        not feature flags.
      </p>
      <ExperimentManager
        slug={projectSlug}
        experiments={experiments}
        canManage={isOwner({ projectId: membership.projectId, role: membership.role })}
      />
    </main>
  )
}
