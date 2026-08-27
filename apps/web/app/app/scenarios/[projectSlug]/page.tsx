import { ProductShell } from '@/components/product/ProductShell'
import { requireProjectMembership } from '@/lib/dashboard-auth'
import {
  isResilienceScenariosEnabled,
  isScenarioAuthoringEnabled,
  isSecuritySimulationsEnabled,
} from '@/lib/flags'
import { getScenarioDashboardView } from '@/lib/scenario-dashboard'
import { ScenarioWorkspace } from './scenario-workspace'

export const dynamic = 'force-dynamic'

export default async function ScenariosPage({ params }: { params: Promise<{ projectSlug: string }> }) {
  const { projectSlug } = await params
  const membership = await requireProjectMembership(projectSlug)
  const view = await getScenarioDashboardView(membership.projectId)
  const capabilities = {
    resilience: isResilienceScenariosEnabled(),
    security: isSecuritySimulationsEnabled(),
  }
  const canAuthor =
    membership.role === 'owner' &&
    isScenarioAuthoringEnabled() &&
    (capabilities.resilience || capabilities.security)

  return (
    <ProductShell projectSlug={projectSlug} section="measure">
      <ScenarioWorkspace
        projectSlug={projectSlug}
        view={view}
        canAuthor={canAuthor}
        capabilities={capabilities}
      />
    </ProductShell>
  )
}
