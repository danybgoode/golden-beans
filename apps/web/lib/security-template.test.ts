import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SECURITY_TEMPLATE_IDS, getSecurityTemplateSpec, isSecurityTemplateId } from './security-template.ts'

test('security templates are a closed catalog with tiny server-owned request counts', () => {
  assert.deepEqual(SECURITY_TEMPLATE_IDS, [
    'malformed_payload_v1',
    'rate_limit_v1',
    'invalid_credential_v1',
    'revoked_credential_v1',
  ])

  for (const templateId of SECURITY_TEMPLATE_IDS) {
    assert.equal(isSecurityTemplateId(templateId), true)
    const spec = getSecurityTemplateSpec(templateId, 'miyagi_resilience_probe_v1')
    assert.equal(spec?.id, templateId)
    assert.ok((spec?.requestCount ?? 0) >= 1)
    assert.ok((spec?.requestCount ?? 0) <= 3)
  }
})

test('callers cannot select an arbitrary target kind or security command', () => {
  assert.equal(isSecurityTemplateId('caller_request_builder'), false)
  assert.equal(getSecurityTemplateSpec('malformed_payload_v1', 'https://third-party.example'), null)
  assert.equal(getSecurityTemplateSpec({ command: 'delete' }, 'miyagi_resilience_probe_v1'), null)
})
