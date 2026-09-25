// experiments-for-humans · Story 4.2 — the decide flow's writes, in order, with the variants they name.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'

type ResolveHook = (
  specifier: string,
  context: Record<string, unknown>,
  nextResolve: (specifier: string, context: Record<string, unknown>) => unknown
) => unknown
;(Module as typeof Module & { registerHooks: (hooks: { resolve: ResolveHook }) => void }).registerHooks({
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

const { planDecision, defaultReason, canRollOut, DECISION_REASONS } =
  await import('./experiment-decide-plan.ts')

const ship = { outcome: 'ship_treatment' as const, treatmentKey: 'on' }

test('running: stop, then record, then roll out the shipped treatment', () => {
  assert.deepEqual(planDecision({ lifecycle: 'running', choice: ship, controlKey: 'off', rollOut: true }), {
    steps: ['stop', 'record', 'rollout'],
    recordKind: 'decision',
    chosenVariantKey: 'on',
    rolloutVariantKey: 'on',
  })
})

test('stopped: never stops again; keep names the control for the record AND the rollout', () => {
  assert.deepEqual(
    planDecision({
      lifecycle: 'stopped',
      choice: { outcome: 'keep_control', treatmentKey: 'on' },
      controlKey: 'off',
      rollOut: true,
    }),
    {
      steps: ['record', 'rollout'],
      recordKind: 'decision',
      chosenVariantKey: 'off',
      rolloutVariantKey: 'off',
    }
  )
})

test('declining the roll-out records only — the flag is a separate, optional write', () => {
  assert.deepEqual(
    planDecision({ lifecycle: 'running', choice: ship, controlKey: 'off', rollOut: false }).steps,
    ['stop', 'record']
  )
})

test('iterate, inconclusive and invalid never roll out and never name a variant, even when asked', () => {
  for (const outcome of ['iterate', 'inconclusive', 'invalid'] as const) {
    const plan = planDecision({
      lifecycle: 'stopped',
      choice: { outcome, treatmentKey: 'on' },
      controlKey: 'off',
      rollOut: true,
    })
    assert.deepEqual(plan.steps, ['record'])
    assert.equal(plan.chosenVariantKey, null)
    assert.equal(plan.rolloutVariantKey, null)
    assert.equal(canRollOut(outcome), false)
  }
})

test('on a decided version it is a correction: no stop, record kind correction', () => {
  const plan = planDecision({ lifecycle: 'decided', choice: ship, controlKey: 'off', rollOut: false })
  assert.deepEqual(plan.steps, ['record'])
  assert.equal(plan.recordKind, 'correction')
})

test('a ship with no treatment named is not rolled out', () => {
  const plan = planDecision({
    lifecycle: 'stopped',
    choice: { outcome: 'ship_treatment', treatmentKey: null },
    controlKey: 'off',
    rollOut: true,
  })
  assert.deepEqual(plan.steps, ['record'])
})

test('the default reason follows the prototype', () => {
  assert.equal(defaultReason('ship_treatment'), DECISION_REASONS[0])
  assert.equal(defaultReason('keep_control'), DECISION_REASONS[1])
  assert.equal(defaultReason('iterate'), DECISION_REASONS[3])
})
