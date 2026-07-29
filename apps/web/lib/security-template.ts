import { SCENARIO_SECURITY_TEMPLATES, type ScenarioSecurityTemplate } from '@golden-beans/sdk'

// Closed defensive-security templates. Callers choose only a registered template identifier;
// request construction, caps and success classification remain server-owned.

export const SECURITY_TEMPLATE_IDS = SCENARIO_SECURITY_TEMPLATES

export type SecurityTemplateId = ScenarioSecurityTemplate
export type SecurityTargetKind = 'miyagi_resilience_probe_v1'

export type SecurityTemplateSpec = {
  id: SecurityTemplateId
  targetKind: SecurityTargetKind
  requestCount: number
  expectedOutcome:
    'validation_rejected' | 'rate_limited' | 'credential_rejected' | 'revoked_credential_rejected'
}

const TEMPLATE_SPECS: Readonly<Record<SecurityTemplateId, SecurityTemplateSpec>> = Object.freeze({
  malformed_payload_v1: Object.freeze({
    id: 'malformed_payload_v1',
    targetKind: 'miyagi_resilience_probe_v1',
    requestCount: 1,
    expectedOutcome: 'validation_rejected',
  }),
  rate_limit_v1: Object.freeze({
    id: 'rate_limit_v1',
    targetKind: 'miyagi_resilience_probe_v1',
    requestCount: 3,
    expectedOutcome: 'rate_limited',
  }),
  invalid_credential_v1: Object.freeze({
    id: 'invalid_credential_v1',
    targetKind: 'miyagi_resilience_probe_v1',
    requestCount: 1,
    expectedOutcome: 'credential_rejected',
  }),
  revoked_credential_v1: Object.freeze({
    id: 'revoked_credential_v1',
    targetKind: 'miyagi_resilience_probe_v1',
    requestCount: 1,
    expectedOutcome: 'revoked_credential_rejected',
  }),
})

export function isSecurityTemplateId(value: unknown): value is SecurityTemplateId {
  return typeof value === 'string' && (SECURITY_TEMPLATE_IDS as readonly string[]).includes(value)
}

export function getSecurityTemplateSpec(
  templateId: unknown,
  targetKind: unknown
): SecurityTemplateSpec | null {
  if (!isSecurityTemplateId(templateId) || targetKind !== 'miyagi_resilience_probe_v1') {
    return null
  }
  const spec = TEMPLATE_SPECS[templateId]
  return spec.targetKind === targetKind ? spec : null
}
