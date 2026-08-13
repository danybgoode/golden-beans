import 'server-only'
import { getSupabaseServiceClient } from './supabase'
import type { ScenarioAdminOperation } from './scenario-admin-operation'
import { parseScenarioDefinition, type ScenarioDefinition } from './scenario-definition'
import { summarizeScenarioFaultFlag, type ScenarioFaultFlagSummary } from './scenario-fault-flag-summary'

type OwnerOperation = Extract<
  ScenarioAdminOperation,
  { operation: 'revoke_target' | 'create_definition' | 'create_run' | 'start_run' | 'transition_run' }
>

export type ScenarioOwnerOperationResult =
  ({ ok: true } & Record<string, unknown>) | { ok: false; error: string; conflict?: boolean }

export type ScenarioOwnerDefinitionContext = {
  definition: ScenarioDefinition
  faultSummary: ScenarioFaultFlagSummary
  productionSecurityApproved: boolean
  targetVerified: boolean
}

export type ScenarioOwnerRunContext = ScenarioOwnerDefinitionContext & {
  environment: 'development' | 'preview' | 'production'
  revision: number
  status: string
}

export async function getScenarioOwnerDefinitionContext(
  projectId: string,
  scenarioVersionId: string
): Promise<ScenarioOwnerDefinitionContext | null> {
  const supabase = getSupabaseServiceClient()
  const { data: version, error } = await supabase
    .from('scenario_definition_versions')
    .select('definition')
    .eq('project_id', projectId)
    .eq('id', scenarioVersionId)
    .maybeSingle()
  if (error) {
    console.error('[scenario-owner] definition policy read failed', { code: error.code })
    return null
  }
  const parsed = parseScenarioDefinition(version?.definition)
  if (!parsed.ok) return null
  const { data: flagRegistry, error: flagRegistryError } = await supabase
    .from('flag_registries')
    .select('id')
    .eq('project_id', projectId)
    .eq('key', parsed.definition.flag.key)
    .maybeSingle()
  if (flagRegistryError || !flagRegistry) {
    if (flagRegistryError)
      console.error('[scenario-owner] fault registry eligibility read failed', { code: flagRegistryError.code })
    return null
  }
  const [
    { data: approval, error: approvalError },
    { data: target, error: targetError },
    { data: flagVersion, error: flagVersionError },
  ] = await Promise.all([
    supabase
      .from('scenario_owner_approvals')
      .select('id')
      .eq('project_id', projectId)
      .eq('scenario_version_id', scenarioVersionId)
      .eq('approval_kind', 'production_security')
      .maybeSingle(),
    supabase
      .from('scenario_targets')
      .select('status')
      .eq('project_id', projectId)
      .eq('key', parsed.definition.targetKey)
      .maybeSingle(),
    supabase
      .from('flag_definition_versions')
      .select('definition')
      .eq('project_id', projectId)
      .eq('flag_id', flagRegistry.id)
      .eq('version', parsed.definition.flag.definitionVersion)
      .maybeSingle(),
  ])
  const faultSummary = summarizeScenarioFaultFlag(flagVersion?.definition)
  if (approvalError || targetError || flagVersionError || !faultSummary) {
    console.error('[scenario-owner] definition eligibility read failed', {
      approvalCode: approvalError?.code,
      targetCode: targetError?.code,
      flagVersionCode: flagVersionError?.code,
      faultSummaryAvailable: faultSummary !== null,
    })
    return null
  }
  return {
    definition: parsed.definition,
    faultSummary,
    productionSecurityApproved: approval !== null,
    targetVerified: target?.status === 'verified',
  }
}

export async function getScenarioOwnerRunContext(
  projectId: string,
  runId: string
): Promise<ScenarioOwnerRunContext | null> {
  const { data: run, error } = await getSupabaseServiceClient()
    .from('scenario_runs')
    .select('scenario_version_id, environment, revision, status')
    .eq('project_id', projectId)
    .eq('id', runId)
    .maybeSingle()
  if (error || !run) {
    if (error) console.error('[scenario-owner] run policy read failed', { code: error.code })
    return null
  }
  if (run.environment !== 'development' && run.environment !== 'preview' && run.environment !== 'production')
    return null
  const context = await getScenarioOwnerDefinitionContext(projectId, String(run.scenario_version_id))
  return context
    ? {
        ...context,
        environment: run.environment,
        revision: Number(run.revision),
        status: String(run.status),
      }
    : null
}

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
