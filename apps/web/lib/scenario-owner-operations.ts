import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { ScenarioAdminOperation } from './scenario-admin-operation'

type OwnerOperation = Extract<
  ScenarioAdminOperation,
  { operation: 'revoke_target' | 'create_definition' | 'create_run' | 'start_run' | 'transition_run' }
>

export type ScenarioOwnerOperationResult =
  ({ ok: true } & Record<string, unknown>) | { ok: false; error: string; conflict?: boolean }

function failure(code: string | undefined): ScenarioOwnerOperationResult {
  if (code === 'P0001')
    return { ok: false, conflict: true, error: 'This scenario changed. Refresh and try again.' }
  if (code === '42501') return { ok: false, error: 'Project ownership is required.' }
  if (code === '22023') return { ok: false, error: 'The scenario command is invalid.' }
  if (code === '55000' || code === '23505')
    return { ok: false, conflict: true, error: 'The scenario cannot make that transition now.' }
  return { ok: false, error: 'Could not update this scenario.' }
}

async function rpc(name: string, args: Record<string, unknown>): Promise<ScenarioOwnerOperationResult> {
  const { data, error } = await getSupabaseServiceClient().rpc(name, args)
  if (error) {
    if (!['P0001', '42501', '22023', '55000', '23505'].includes(error.code ?? ''))
      console.error('[scenario-owner] operation failed', { name, code: error.code ?? 'unknown' })
    return failure(error.code)
  }
  const row = data?.[0]
  if (!row || typeof row !== 'object' || Array.isArray(row))
    return { ok: false, error: 'The scenario was not found in this project.' }
  return { ok: true, ...row }
}

export async function executeScenarioOwnerOperation(input: {
  projectId: string
  environment: 'development' | 'preview' | 'production'
  actorUserId: string
  operation: OwnerOperation
}): Promise<ScenarioOwnerOperationResult> {
  const common = {
    p_project_id: input.projectId,
    p_actor_user_id: input.actorUserId,
    p_reason: input.operation.reason,
  }
  switch (input.operation.operation) {
    case 'revoke_target':
      return rpc('owner_revoke_scenario_target', {
        ...common,
        p_target_id: input.operation.targetId,
      })
    case 'create_definition':
      return rpc('owner_create_scenario_definition_version', {
        ...common,
        p_environment: input.environment,
        p_scenario_key: input.operation.scenarioKey,
        p_definition: input.operation.definition,
      })
    case 'create_run':
      return rpc('owner_create_scenario_run', {
        ...common,
        p_environment: input.environment,
        p_scenario_version_id: input.operation.scenarioVersionId,
      })
    case 'start_run':
      return rpc('owner_start_scenario_run', {
        ...common,
        p_environment: input.environment,
        p_run_id: input.operation.runId,
        p_expected_revision: input.operation.expectedRevision,
      })
    case 'transition_run':
      return rpc('owner_transition_scenario_run', {
        ...common,
        p_run_id: input.operation.runId,
        p_expected_revision: input.operation.expectedRevision,
        p_transition: input.operation.transition,
      })
  }
  const unreachable: never = input.operation
  console.error('[scenario-owner] unsupported operation', unreachable)
  return { ok: false, error: 'Unsupported scenario operation.' }
}
