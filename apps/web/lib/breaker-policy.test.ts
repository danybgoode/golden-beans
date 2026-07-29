import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown

const registerHooks = (
  Module as typeof Module & {
    registerHooks: (hooks: { resolve: ResolveHook }) => void
  }
).registerHooks

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (
      typeof context.parentURL === 'string' &&
      context.parentURL.includes('/apps/web/lib/') &&
      specifier.startsWith('./') &&
      !specifier.endsWith('.ts')
    ) {
      return nextResolve(`${specifier}.ts`, context)
    }
    return nextResolve(specifier, context)
  },
})

const { breakerPolicyCanAutoTrip, parseBreakerPolicy } = await import('./breaker-policy.ts')

const POLICY = {
  contractVersion: 1,
  flag: {
    key: 'resilience.disposable_safe_flag',
    definitionVersion: 2,
    protectiveVariantKey: 'off',
    protectiveDirection: 'disable',
  },
  evidence: {
    resolver: 'scenario_impact_v1',
    scenario: { key: 'checkout_probe', definitionVersion: 3 },
    experiment: { key: 'checkout_probe_impact', definitionVersion: 1 },
    metricRole: 'guardrail',
    metricEvent: 'checkout_failed',
    adverseDirection: 'increase',
    thresholdBasisPoints: 1_000,
    minimumSamplePerVariant: 10,
    requiredIntegrity: 'valid',
  },
  windowSeconds: 900,
  cooldownSeconds: 3_600,
  maxTrips: 1,
  riskClass: 'standard',
  confirmationMode: 'manual',
}

test('breaker policy binds one immutable flag transition and canonical evidence resolver', () => {
  const result = parseBreakerPolicy(POLICY)
  assert.equal(result.ok, true)
  if (!result.ok) return
  assert.equal(result.definition.flag.key, 'resilience.disposable_safe_flag')
  assert.equal(result.definition.flag.protectiveVariantKey, 'off')
  assert.equal(result.definition.evidence.resolver, 'scenario_impact_v1')
  assert.equal(breakerPolicyCanAutoTrip(result.definition), false)
})

test('automatic trip is only possible when immutable owner approval is in the policy', () => {
  const result = parseBreakerPolicy({
    ...POLICY,
    confirmationMode: 'owner_preapproved_emergency',
  })
  assert.equal(result.ok, true)
  if (result.ok) assert.equal(breakerPolicyCanAutoTrip(result.definition), true)
})

test('callers cannot add a flag, value, query or evidence bypass to an invocation policy', () => {
  for (const changed of [
    { ...POLICY, flag: { ...POLICY.flag, protectiveValue: true } },
    { ...POLICY, arbitraryQuery: 'update flags' },
    { ...POLICY, evidence: { ...POLICY.evidence, requiredIntegrity: 'ignore_srm' } },
    {
      ...POLICY,
      evidence: { ...POLICY.evidence, resolver: 'caller_supplied_result' },
    },
    { ...POLICY, maxTrips: 0 },
  ]) {
    assert.equal(parseBreakerPolicy(changed).ok, false, JSON.stringify(changed))
  }
})
