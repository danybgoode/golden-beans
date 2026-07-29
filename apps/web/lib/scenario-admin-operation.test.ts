import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { test } from 'node:test'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown
const registerHooks = (Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void })
  .registerHooks
registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier === './scenario-definition') {
      return nextResolve('./scenario-definition.ts', context)
    }
    return nextResolve(specifier, context)
  },
})
const { parseScenarioAdminOperation } = await import('./scenario-admin-operation.ts')

const UUID = '11111111-1111-4111-8111-111111111111'
const REASON = '  approved internal drill  '

test('accepts only the closed scenario administration commands', () => {
  const commands = [
    {
      operation: 'register_target',
      targetKey: 'miyagi.frontend.resilience_probe',
      targetKind: 'miyagi_resilience_probe_v1',
      origin: 'https://miyagisanchez.com',
      reason: REASON,
    },
    { operation: 'verify_target', targetId: UUID, challenge: 'a'.repeat(64), reason: REASON },
    { operation: 'revoke_target', targetId: UUID, reason: REASON },
    {
      operation: 'approve_definition',
      scenarioVersionId: UUID,
      approvalKind: 'production_security',
      reason: REASON,
    },
    { operation: 'create_run', scenarioVersionId: UUID, reason: REASON },
    { operation: 'start_run', runId: UUID, expectedRevision: 1, reason: REASON },
    {
      operation: 'transition_run',
      runId: UUID,
      expectedRevision: 2,
      transition: 'abort',
      reason: REASON,
    },
  ]
  for (const command of commands) {
    assert.equal(parseScenarioAdminOperation(command)?.reason, 'approved internal drill')
  }
})

test('normalizes and accepts a fully typed scenario definition command', () => {
  const result = parseScenarioAdminOperation({
    operation: 'create_definition',
    scenarioKey: 'internal_probe',
    definition: {
      contractVersion: 1,
      kind: 'resilience',
      targetKey: 'miyagi.frontend.resilience_probe',
      environment: 'production',
      cohort: 'internal',
      startAt: '2026-07-29T01:00:00.000Z',
      expiresAt: '2026-07-29T01:10:00.000Z',
      limits: { requestCap: 5, concurrencyCap: 1, leaseTtlSeconds: 10 },
      guardrails: { abortAfterFailures: 2, maxErrorRateBasisPoints: 2_000 },
      flag: { key: 'resilience.probe', definitionVersion: 1 },
    },
    reason: REASON,
  })
  assert.equal(result?.operation, 'create_definition')
})

test('rejects arbitrary fields, targets, commands and coercions', () => {
  const validStart = {
    operation: 'start_run',
    runId: UUID,
    expectedRevision: 1,
    reason: 'x',
  }
  for (const command of [
    { ...validStart, arbitraryFlag: 'checkout.stripe_enabled' },
    { ...validStart, expectedRevision: '1' },
    { ...validStart, operation: 'delete_everything' },
    {
      operation: 'register_target',
      targetKey: 'probe',
      targetKind: 'caller_url_v1',
      origin: 'https://example.com',
      reason: 'x',
    },
    {
      operation: 'register_target',
      targetKey: 'probe',
      targetKind: 'miyagi_resilience_probe_v1',
      origin: 'https://example.com/path',
      reason: 'x',
    },
    { operation: 'verify_target', targetId: UUID, challenge: 'A'.repeat(64), reason: 'x' },
  ]) {
    assert.equal(parseScenarioAdminOperation(command), null, JSON.stringify(command))
  }
})
