import { ProductShell } from '@/components/product/ProductShell'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import { isScenarioAuthoringEnabled } from '@/lib/flags'
import { getScenarioDashboardView } from '@/lib/scenario-dashboard'
import { ScenarioWorkspace } from './scenario-workspace'

export const dynamic = 'force-dynamic'

export default async function ScenariosPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const view = await getScenarioDashboardView(membership.projectId)
  const canAuthor = membership.role === 'owner' && isScenarioAuthoringEnabled()

  return (
    <ProductShell projectSlug={projectSlug}>
      <ScenarioWorkspace projectSlug={projectSlug} view={view} canAuthor={canAuthor} />
    </ProductShell>
  )
}
