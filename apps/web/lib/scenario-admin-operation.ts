import { parseScenarioDefinition, type ScenarioDefinition } from './scenario-definition'

const KEY = /^[a-z][a-z0-9_.-]{0,127}$/
const SCENARIO_KEY = /^[a-z][a-z0-9_-]{0,63}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HEX_64 = /^[0-9a-f]{64}$/

type Reasoned = { reason: string }

export type ScenarioAdminOperation =
  | (Reasoned & {
      operation: 'register_target'
      targetKey: string
      targetKind: 'miyagi_resilience_probe_v1'
      origin: string
    })
  | (Reasoned & {
      operation: 'verify_target'
      targetId: string
      challenge: string
    })
  | (Reasoned & { operation: 'revoke_target'; targetId: string })
  | (Reasoned & {
      operation: 'create_definition'
      scenarioKey: string
      definition: ScenarioDefinition
    })
  | (Reasoned & {
      operation: 'approve_definition'
      scenarioVersionId: string
      approvalKind: 'external_cohort' | 'production_security'
    })
  | (Reasoned & {
      operation: 'create_run'
      scenarioVersionId: string
    })
  | (Reasoned & {
      operation: 'start_run'
      runId: string
      expectedRevision: number
    })
  | (Reasoned & {
      operation: 'transition_run'
      runId: string
      expectedRevision: number
      transition: 'stop' | 'abort'
    })

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(input: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(input).sort()
  const expected = [...keys].sort()
  return actual.length === expected.length && actual.every((key, index) => key === expected[index])
}

function reason(input: Record<string, unknown>): string | null {
  const value = typeof input.reason === 'string' ? input.reason.trim() : ''
  return value.length >= 1 && value.length <= 500 ? value : null
}

function positiveRevision(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) >= 1
}

function exactHttpsOrigin(value: unknown): value is string {
  if (typeof value !== 'string') return false
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      url.pathname === '/' &&
      !url.search &&
      !url.hash &&
      url.origin === value
    )
  } catch {
    return false
  }
}

export function parseScenarioAdminOperation(value: unknown): ScenarioAdminOperation | null {
  if (!isRecord(value) || typeof value.operation !== 'string') return null
  const normalizedReason = reason(value)
  if (!normalizedReason) return null

  if (value.operation === 'register_target') {
    if (
      !exactKeys(value, ['operation', 'targetKey', 'targetKind', 'origin', 'reason']) ||
      typeof value.targetKey !== 'string' ||
      !KEY.test(value.targetKey) ||
      value.targetKind !== 'miyagi_resilience_probe_v1' ||
      !exactHttpsOrigin(value.origin)
    ) {
      return null
    }
    return {
      operation: 'register_target',
      targetKey: value.targetKey,
      targetKind: value.targetKind,
      origin: value.origin,
      reason: normalizedReason,
    }
  }
  if (value.operation === 'verify_target') {
    if (
      !exactKeys(value, ['operation', 'targetId', 'challenge', 'reason']) ||
      typeof value.targetId !== 'string' ||
      !UUID.test(value.targetId) ||
      typeof value.challenge !== 'string' ||
      !HEX_64.test(value.challenge)
    ) {
      return null
    }
    return {
      operation: 'verify_target',
      targetId: value.targetId,
      challenge: value.challenge,
      reason: normalizedReason,
    }
  }
  if (value.operation === 'revoke_target') {
    if (
      !exactKeys(value, ['operation', 'targetId', 'reason']) ||
      typeof value.targetId !== 'string' ||
      !UUID.test(value.targetId)
    ) {
      return null
    }
    return { operation: 'revoke_target', targetId: value.targetId, reason: normalizedReason }
  }
  if (value.operation === 'create_definition') {
    if (
      !exactKeys(value, ['operation', 'scenarioKey', 'definition', 'reason']) ||
      typeof value.scenarioKey !== 'string' ||
      !SCENARIO_KEY.test(value.scenarioKey)
    ) {
      return null
    }
    const parsed = parseScenarioDefinition(value.definition)
    if (!parsed.ok) return null
    return {
      operation: 'create_definition',
      scenarioKey: value.scenarioKey,
      definition: parsed.definition,
      reason: normalizedReason,
    }
  }
  if (value.operation === 'approve_definition') {
    if (
      !exactKeys(value, ['operation', 'scenarioVersionId', 'approvalKind', 'reason']) ||
      typeof value.scenarioVersionId !== 'string' ||
      !UUID.test(value.scenarioVersionId) ||
      (value.approvalKind !== 'external_cohort' && value.approvalKind !== 'production_security')
    ) {
      return null
    }
    return {
      operation: 'approve_definition',
      scenarioVersionId: value.scenarioVersionId,
      approvalKind: value.approvalKind,
      reason: normalizedReason,
    }
  }
  if (value.operation === 'create_run') {
    if (
      !exactKeys(value, ['operation', 'scenarioVersionId', 'reason']) ||
      typeof value.scenarioVersionId !== 'string' ||
      !UUID.test(value.scenarioVersionId)
    ) {
      return null
    }
    return {
      operation: 'create_run',
      scenarioVersionId: value.scenarioVersionId,
      reason: normalizedReason,
    }
  }
  if (value.operation === 'start_run') {
    if (
      !exactKeys(value, ['operation', 'runId', 'expectedRevision', 'reason']) ||
      typeof value.runId !== 'string' ||
      !UUID.test(value.runId) ||
      !positiveRevision(value.expectedRevision)
    ) {
      return null
    }
    return {
      operation: 'start_run',
      runId: value.runId,
      expectedRevision: value.expectedRevision,
      reason: normalizedReason,
    }
  }
  if (value.operation === 'transition_run') {
    if (
      !exactKeys(value, ['operation', 'runId', 'expectedRevision', 'transition', 'reason']) ||
      typeof value.runId !== 'string' ||
      !UUID.test(value.runId) ||
      !positiveRevision(value.expectedRevision) ||
      (value.transition !== 'stop' && value.transition !== 'abort')
    ) {
      return null
    }
    return {
      operation: 'transition_run',
      runId: value.runId,
      expectedRevision: value.expectedRevision,
      transition: value.transition,
      reason: normalizedReason,
    }
  }
  return null
}
