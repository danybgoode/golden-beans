import type { ScenarioDefinition, ScenarioKind } from './scenario-definition'

export type ScenarioCapabilityGates = {
  resilience: boolean
  security: boolean
}

export type ScenarioLaunchFacts = Pick<ScenarioDefinition, 'kind' | 'cohort' | 'environment'> & {
  targetVerified: boolean
  productionSecurityApproved: boolean
  faultSummaryAvailable: boolean
}

export function isScenarioKindEnabled(kind: ScenarioKind, capabilities: ScenarioCapabilityGates): boolean {
  return kind === 'resilience' ? capabilities.resilience : capabilities.security
}

export function scenarioLaunchBlocker(
  facts: ScenarioLaunchFacts,
  capabilities: ScenarioCapabilityGates
): string | null {
  if (!isScenarioKindEnabled(facts.kind, capabilities))
    return `${facts.kind === 'resilience' ? 'Resilience scenarios' : 'Security simulations'} are disabled.`
  if (facts.cohort === 'external') return 'External-cohort runs are not available in owner authoring.'
  if (!facts.faultSummaryAvailable)
    return 'The immutable fault payload or targeting rules cannot be disclosed, so this definition cannot run.'
  if (!facts.targetVerified) return 'The scenario target is not verified.'
  if (facts.kind === 'security' && facts.environment === 'production' && !facts.productionSecurityApproved)
    return 'Production security approval is required before this definition can run.'
  return null
}

export function isOwnerDirectScenarioOperation(operation: string, transition?: string): boolean {
  return (
    operation === 'revoke_target' ||
    operation === 'create_definition' ||
    (operation === 'transition_run' && transition === 'stop')
  )
}
