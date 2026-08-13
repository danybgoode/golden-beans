'use server'
import { revalidatePath } from 'next/cache'
import { requireProjectOwnership } from '@/lib/dashboard-auth'
import {
  isResilienceScenariosEnabled,
  isScenarioAuthoringEnabled,
  isSecuritySimulationsEnabled,
} from '@/lib/flags'
import { parseScenarioAdminOperation } from '@/lib/scenario-admin-operation'
import {
  isOwnerDirectScenarioOperation,
  isScenarioKindEnabled,
  scenarioLaunchBlocker,
  type ScenarioCapabilityGates,
} from '@/lib/scenario-authoring-policy'
import {
  executeScenarioOwnerOperation,
  getScenarioOwnerDefinitionContext,
  getScenarioOwnerRunContext,
} from '@/lib/scenario-owner-operations'

type Environment = 'development' | 'preview' | 'production'

function environment(value: unknown): Environment | null {
  return value === 'development' || value === 'preview' || value === 'production' ? value : null
}

function capabilities(): ScenarioCapabilityGates {
  return {
    resilience: isResilienceScenariosEnabled(),
    security: isSecuritySimulationsEnabled(),
  }
}

function unavailable(kind: 'resilience' | 'security') {
  return {
    ok: false as const,
    error: `${kind === 'resilience' ? 'Resilience scenarios' : 'Security simulations'} are unavailable in this deployment.`,
  }
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
  if (!safeEnvironment || !operation) {
    return { ok: false as const, error: 'Invalid scenario command.' }
  }
  if (
    (operation.operation !== 'revoke_target' &&
      operation.operation !== 'create_definition' &&
      operation.operation !== 'transition_run') ||
    !isOwnerDirectScenarioOperation(
      operation.operation,
      operation.operation === 'transition_run' ? operation.transition : undefined
    )
  )
    return { ok: false as const, error: 'Invalid scenario command.' }
  const gates = capabilities()
  if (operation.operation === 'create_definition') {
    if (operation.definition.environment !== safeEnvironment)
      return { ok: false as const, error: 'The definition environment does not match the command.' }
    if (operation.definition.cohort === 'external')
      return { ok: false as const, error: 'External cohorts are unavailable in owner authoring.' }
    if (!isScenarioKindEnabled(operation.definition.kind, gates))
      return unavailable(operation.definition.kind)
  }
  if (operation.operation === 'revoke_target' && !gates.resilience && !gates.security)
    return { ok: false as const, error: 'Scenario capabilities are unavailable in this deployment.' }
  if (operation.operation === 'transition_run') {
    const context = await getScenarioOwnerRunContext(projectId, operation.runId)
    if (!context || context.environment !== safeEnvironment)
      return { ok: false as const, error: 'The scenario run is unavailable.' }
    if (!isScenarioKindEnabled(context.definition.kind, gates)) return unavailable(context.definition.kind)
  }
  const result = await executeScenarioOwnerOperation({
    projectId,
    environment: safeEnvironment,
    actorUserId: userId,
    operation,
  })
  if (result.ok) revalidatePath(`/app/scenarios/${slug}`)
  return result
}

export async function launchScenarioRunAction(slug: unknown, scenarioVersionId: unknown, reason: unknown) {
  if (!isScenarioAuthoringEnabled())
    return { ok: false as const, error: 'Scenario authoring is unavailable in this deployment.' }
  if (typeof slug !== 'string') return { ok: false as const, error: 'Invalid project.' }
  const { projectId, userId } = await requireProjectOwnership(slug)
  const create = parseScenarioAdminOperation({
    operation: 'create_run',
    scenarioVersionId,
    reason,
  })
  if (!create || create.operation !== 'create_run')
    return { ok: false as const, error: 'Invalid launch command.' }
  const context = await getScenarioOwnerDefinitionContext(projectId, create.scenarioVersionId)
  if (!context) return { ok: false as const, error: 'The scenario definition is unavailable.' }
  const blocker = scenarioLaunchBlocker(
    {
      ...context.definition,
      targetVerified: context.targetVerified,
      productionSecurityApproved: context.productionSecurityApproved,
    },
    capabilities()
  )
  if (blocker) return { ok: false as const, error: blocker }
  const safeEnvironment = context.definition.environment
  const draft = await executeScenarioOwnerOperation({
    projectId,
    environment: safeEnvironment,
    actorUserId: userId,
    operation: create,
  })
  if (!draft.ok) return draft
  if (typeof draft.run_id !== 'string' || typeof draft.revision !== 'number')
    return { ok: false as const, error: 'The run draft response was incomplete.' }
  // Starting can still fail after the draft transaction commits. Revalidate now so the honest
  // partial state is visible and the owner can retry instead of seeing a stale page.
  revalidatePath(`/app/scenarios/${slug}`)
  const start = parseScenarioAdminOperation({
    operation: 'start_run',
    runId: draft.run_id,
    expectedRevision: draft.revision,
    reason,
  })
  if (!start || start.operation !== 'start_run')
    return { ok: false as const, error: 'Could not prepare the run start.' }
  const result = await executeScenarioOwnerOperation({
    projectId,
    environment: safeEnvironment,
    actorUserId: userId,
    operation: start,
  })
  if (result.ok) revalidatePath(`/app/scenarios/${slug}`)
  return result
}

export async function startScenarioRunAction(
  slug: unknown,
  runId: unknown,
  expectedRevision: unknown,
  reason: unknown
) {
  if (!isScenarioAuthoringEnabled())
    return { ok: false as const, error: 'Scenario authoring is unavailable in this deployment.' }
  if (typeof slug !== 'string') return { ok: false as const, error: 'Invalid project.' }
  const { projectId, userId } = await requireProjectOwnership(slug)
  const start = parseScenarioAdminOperation({ operation: 'start_run', runId, expectedRevision, reason })
  if (!start || start.operation !== 'start_run')
    return { ok: false as const, error: 'Invalid start command.' }
  const context = await getScenarioOwnerRunContext(projectId, start.runId)
  if (!context || context.status !== 'draft' || context.revision !== start.expectedRevision)
    return { ok: false as const, conflict: true, error: 'This draft run changed. Refresh and try again.' }
  const blocker = scenarioLaunchBlocker(
    {
      ...context.definition,
      environment: context.environment,
      targetVerified: context.targetVerified,
      productionSecurityApproved: context.productionSecurityApproved,
    },
    capabilities()
  )
  if (blocker) return { ok: false as const, error: blocker }
  const result = await executeScenarioOwnerOperation({
    projectId,
    environment: context.environment,
    actorUserId: userId,
    operation: start,
  })
  if (result.ok) revalidatePath(`/app/scenarios/${slug}`)
  return result
}
