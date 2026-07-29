import { createHmac, timingSafeEqual } from 'node:crypto'
import { SCENARIO_SECURITY_TEMPLATES, type ScenarioSecurityTemplate } from '@golden-beans/sdk'

export const SCENARIO_SECURITY_REQUEST_HEADER = 'x-golden-beans-scenario-request'
export const SCENARIO_SECURITY_TARGET_PATH = '/api/internal/resilience/security-probe'
export const SCENARIO_SECURITY_REQUEST_CONTRACT_VERSION = 1 as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const TARGET_KEY = /^[a-z][a-z0-9_.-]{0,127}$/
const HEX_64 = /^[0-9a-f]{64}$/

export type ScenarioSecurityRequest = {
  contractVersion: 1
  runId: string
  leaseId: string
  runRevision: number
  targetKey: string
  template: ScenarioSecurityTemplate
  attempt: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function exactKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(value).sort()
  const sortedExpected = [...expected].sort()
  return (
    actual.length === sortedExpected.length && actual.every((key, index) => key === sortedExpected[index])
  )
}

function exactHttpsOrigin(value: string): boolean {
  try {
    const parsed = new URL(value)
    return (
      parsed.protocol === 'https:' &&
      !parsed.username &&
      !parsed.password &&
      parsed.pathname === '/' &&
      !parsed.search &&
      !parsed.hash &&
      parsed.origin === value
    )
  } catch {
    return false
  }
}

function isSecurityTemplateId(value: unknown): value is ScenarioSecurityTemplate {
  return typeof value === 'string' && (SCENARIO_SECURITY_TEMPLATES as readonly string[]).includes(value)
}

export function parseScenarioSecurityRequest(value: unknown): ScenarioSecurityRequest | null {
  if (
    !isRecord(value) ||
    !exactKeys(value, [
      'contractVersion',
      'runId',
      'leaseId',
      'runRevision',
      'targetKey',
      'template',
      'attempt',
    ]) ||
    value.contractVersion !== SCENARIO_SECURITY_REQUEST_CONTRACT_VERSION ||
    typeof value.runId !== 'string' ||
    !UUID.test(value.runId) ||
    typeof value.leaseId !== 'string' ||
    !UUID.test(value.leaseId) ||
    !Number.isSafeInteger(value.runRevision) ||
    Number(value.runRevision) < 1 ||
    typeof value.targetKey !== 'string' ||
    !TARGET_KEY.test(value.targetKey) ||
    !isSecurityTemplateId(value.template) ||
    !Number.isSafeInteger(value.attempt) ||
    Number(value.attempt) < 1 ||
    Number(value.attempt) > 3
  ) {
    return null
  }
  return {
    contractVersion: 1,
    runId: value.runId,
    leaseId: value.leaseId,
    runRevision: Number(value.runRevision),
    targetKey: value.targetKey,
    template: value.template,
    attempt: Number(value.attempt),
  }
}

function canonicalRequest(input: { origin: string; request: ScenarioSecurityRequest }): string {
  if (!exactHttpsOrigin(input.origin)) {
    throw new Error('Scenario security target origin must be an exact HTTPS origin')
  }
  const parsed = parseScenarioSecurityRequest(input.request)
  if (!parsed) throw new Error('Invalid scenario security request')
  return [
    'golden-beans-security-request-v1',
    input.origin,
    parsed.contractVersion,
    parsed.runId,
    parsed.leaseId,
    parsed.runRevision,
    parsed.targetKey,
    parsed.template,
    parsed.attempt,
  ].join('\n')
}

export function createScenarioSecurityRequestSignature(input: {
  secret: string
  origin: string
  request: ScenarioSecurityRequest
}): string {
  if (input.secret.length < 16) {
    throw new Error('Scenario security request secret is unavailable')
  }
  return createHmac('sha256', input.secret).update(canonicalRequest(input), 'utf8').digest('hex')
}

export function scenarioSecurityRequestSignatureMatches(
  input: {
    secret: string
    origin: string
    request: ScenarioSecurityRequest
  },
  received: unknown
): boolean {
  if (typeof received !== 'string' || !HEX_64.test(received)) return false
  let expected: string
  try {
    expected = createScenarioSecurityRequestSignature(input)
  } catch {
    return false
  }
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(received, 'hex'))
}
