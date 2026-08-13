'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import { isScenarioAuthoringEnabled } from '@/lib/flags'
import { parseScenarioAdminOperation } from '@/lib/scenario-admin-operation'
import { executeScenarioOwnerOperation } from '@/lib/scenario-owner-operations'

type Environment = 'development' | 'preview' | 'production'

function environment(value: unknown): Environment | null {
  return value === 'development' || value === 'preview' || value === 'production' ? value : null
}

export async function scenarioOwnerOperationAction(
  slug: unknown,
  selectedEnvironment: unknown,
  rawOperation: unknown
) {
  // Gate first: an OFF deployment cannot reveal project membership or mutate through this seam.
  if (!isScenarioAuthoringEnabled())
    return { ok: false as const, error: 'Scenario authoring is unavailable in this deployment.' }
  if (typeof slug !== 'string') return { ok: false as const, error: 'Invalid project.' }
  const { projectId, userId } = await requireProjectOwnership(slug)
  const safeEnvironment = environment(selectedEnvironment)
  const operation = parseScenarioAdminOperation(rawOperation)
  if (
    !safeEnvironment ||
    !operation ||
    operation.operation === 'register_target' ||
    operation.operation === 'verify_target' ||
    operation.operation === 'approve_definition'
  ) {
    return { ok: false as const, error: 'Invalid scenario command.' }
  }
  if (operation.operation === 'create_definition' && operation.definition.environment !== safeEnvironment)
    return { ok: false as const, error: 'The definition environment does not match the command.' }
  const result = await executeScenarioOwnerOperation({
    projectId,
    environment: safeEnvironment,
    actorUserId: userId,
    operation,
  })
  if (result.ok) revalidatePath(`/app/scenarios/${slug}`)
  return result
}
