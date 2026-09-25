import assert from 'node:assert/strict'
import test from 'node:test'
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
    )
      return nextResolve(`${specifier}.ts`, context)
    return nextResolve(specifier, context)
  },
})

const { builderReducer, deserializeBuilderState, initialBuilderState, serializeBuilderState } =
  await import('./experiment-builder-state.ts')
type EventCatalog = import('./event-catalog.ts').EventCatalog

const catalog: EventCatalog = {
  events: [
    { event: 'checkout_completed', count14d: 20, count24h: 2, daily: Array(14).fill(1), reserved: false },
  ],
  segments: [],
  entities: [{ type: 'merchant', subjects14d: 10 }],
  baselines: [],
  flagEvaluations: [],
  observedDays: 14,
  truncated: false,
  rowCap: 50_000,
  windowDays: 14,
  asOf: '2026-01-01T00:00:00.000Z',
  segmentCombos: { rows: 0, combos: [], complete: true },
}

test('template selection resolves fresh defaults without moving the current step', () => {
  const state = initialBuilderState('copy', { catalog, served: null })
  assert.ok(state)
  const moved = builderReducer(
    { ...state, step: 4 },
    { type: 'template', template: 'rollout', context: { catalog, served: null } }
  )
  assert.equal(moved.step, 4)
  assert.equal(moved.answers.template, 'rollout')
  assert.equal(moved.answers.split, 10)
})

test('renaming a version to an existing name swaps them and new-feature versions cap at four', () => {
  const state = initialBuilderState('copy', { catalog, served: null })
  assert.ok(state)
  const swapped = builderReducer(state, { type: 'version-rename', index: 0, name: state.answers.versions[1] })
  assert.deepEqual(swapped.answers.versions, [state.answers.versions[1], state.answers.versions[0]])
  const three = builderReducer(swapped, { type: 'version-add' })
  const four = builderReducer(three, { type: 'version-add' })
  assert.equal(builderReducer(four, { type: 'version-add' }).answers.versions.length, 4)
})

test('stored state is accepted only through the closed answers parser', () => {
  const state = initialBuilderState('copy', { catalog, served: null })
  assert.ok(state)
  assert.deepEqual(
    deserializeBuilderState(serializeBuilderState(state), { catalog, served: null })?.answers,
    state.answers
  )
  assert.equal(deserializeBuilderState('{"answers":{"template":"nope"}}', { catalog, served: null }), null)
})

test('a check fix changes only the answer it owns', () => {
  const state = initialBuilderState('copy', { catalog, served: null })
  assert.ok(state)
  const withCondition = builderReducer(state, { type: 'condition-add', field: 'region' })
  const fixed = builderReducer(withCondition, {
    type: 'check-fix',
    fix: { kind: 'remove-condition', field: 'region' },
  })
  assert.equal(fixed.answers.who.conditions.length, 0)
  assert.equal(fixed.answers.metric, state.answers.metric)
})
