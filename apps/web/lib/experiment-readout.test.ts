// experiments-for-humans · Story 4.1 — the readout's words, from the REAL governed analysis.

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

const { buildReadout } = await import('./experiment-readout.ts')
const { computeExperimentAnalysis } = await import('./experiment-analysis.ts')
const { sentenceText } = await import('./experiment-builder-plan.ts')
type Definition = import('./experiment-definition.ts').ExperimentDefinition
type Fact = import('./experiment-analysis.ts').ExperimentAnalysisFact

const START = '2026-09-01T00:00:00.000Z'
const definition: Definition = {
  hypothesis:
    'We believe showing New copy to merchants will raise signup completed because the funnel drops most at this step.',
  assignmentEntityType: 'merchant',
  eligibility: { description: '100% of merchants who reach it' },
  variants: [
    { key: 'off', weight: 50, label: 'Current' },
    { key: 'on', weight: 50, label: 'New copy' },
  ],
  controlVariantKey: 'off',
  primaryMetric: { event: 'signup_completed', direction: 'increase' },
  guardrailMetrics: [],
  segmentFields: [],
  plannedWindow: { startAt: START, endAt: '2026-09-29T00:00:00.000Z' },
  minimumSamplePerVariant: 100,
}

const at = (minute: number) => new Date(Date.parse(START) + minute * 60_000).toISOString()
function exposures(perArm: number, convertedControl: number, convertedTreatment: number): Fact[] {
  const facts: Fact[] = []
  for (const [arm, converted] of [
    ['off', convertedControl],
    ['on', convertedTreatment],
  ] as const) {
    for (let i = 0; i < perArm; i += 1) {
      const id = `${arm}-${i}`
      facts.push({
        id: `x-${id}`,
        event: 'experiment_exposed',
        featureId: 'copy_test',
        tags: { variant: arm, experiment_definition_version: 1 },
        subjectType: 'merchant',
        subjectId: id,
        occurredAt: at(i + 1),
        createdAt: at(i + 1),
      })
      if (i < converted)
        facts.push({
          id: `c-${id}`,
          event: 'signup_completed',
          featureId: null,
          tags: null,
          subjectType: 'merchant',
          subjectId: id,
          occurredAt: at(i + 2),
          createdAt: at(i + 2),
        })
    }
  }
  return facts
}

function readout(
  facts: Fact[],
  extras: {
    serving?: boolean
    now?: string
    decision?: { outcome: string; chosenVariantKey: string | null; rationale: string } | null
    lifecycle?: 'running' | 'stopped' | 'decided'
  } = {}
) {
  const now = extras.now ?? '2026-09-10T00:00:00.000Z'
  const analysis = computeExperimentAnalysis({
    experimentKey: 'copy_test',
    definitionVersion: 1,
    definition,
    lifecycle: { status: extras.lifecycle ?? 'running', startedAt: START, endedAt: null },
    asOf: now,
    facts,
  })
  return buildReadout({
    definition,
    analysis,
    lifecycle: extras.lifecycle ?? 'running',
    decision: extras.decision ?? null,
    serving: extras.serving ?? true,
    now: new Date(now),
  })
}

test('waiting: live, no exposures yet — the approved first line', () => {
  const result = readout([])
  assert.equal(result.state, 'waiting')
  assert.equal(
    sentenceText(result.answer),
    'It’s live. Results start tomorrow. Merchants are being split 50 / 50 from now. It needs 100 per version.'
  )
  assert.equal(result.verdict.actions.includes('rollout'), false)
})

test('gathering: ahead, with the range, the share of the sample and the days left — and NO roll-out', () => {
  const result = readout(exposures(40, 10, 16))
  assert.equal(result.state, 'gathering')
  assert.match(
    sentenceText(result.answer),
    /^New copy is ahead, \+60\.0% \(range .+ to .+\)\. Guardrails fine, split checks out\. 40% of the planned sample, so don’t call it yet\. About 14 more days\.$/
  )
  assert.equal(result.verdict.actions.includes('rollout'), false)
})

test('ready and favourable: the verdict offers the roll-out; unfavourable or flat never does', () => {
  const winning = readout(exposures(150, 30, 75))
  assert.equal(winning.state, 'ready')
  assert.deepEqual(winning.verdict.actions, ['rollout', 'keep'])
  assert.match(sentenceText(winning.answer), /you can call it\.$/)
  const flat = readout(exposures(150, 30, 31))
  assert.equal(flat.state, 'ready')
  assert.equal(flat.verdict.actions.includes('rollout'), false)
  assert.match(sentenceText(flat.answer), /didn’t move\.$/)
})

test('running but not serving is its own state, with retry — before any number', () => {
  const result = readout(exposures(40, 10, 16), { serving: false })
  assert.equal(result.state, 'not_serving')
  assert.deepEqual(result.verdict.actions, ['retry-serving'])
})

test('decided: the answer names the decision; the roll-out stays available as its own write', () => {
  const result = readout(exposures(150, 30, 75), {
    lifecycle: 'decided',
    decision: {
      outcome: 'ship_treatment',
      chosenVariantKey: 'on',
      rationale: 'The main number improved and guardrails held',
    },
  })
  assert.equal(result.state, 'decided')
  assert.equal(
    sentenceText(result.answer),
    'Decided: ship New copy. The decision and its reason are recorded.'
  )
  assert.deepEqual(result.verdict.actions, ['rollout'])
})

test('stopped, undecided: never "live" or "keep it running" — the next step is the decision', () => {
  const gathering = readout(exposures(40, 10, 16), { lifecycle: 'stopped' })
  assert.equal(gathering.state, 'stopped')
  assert.match(
    sentenceText(gathering.answer),
    /^Stopped — nobody new is counted\. .* It stopped at 40% of the planned sample/
  )
  assert.doesNotMatch(sentenceText(gathering.answer), /live|keep it running|don’t call it yet/i)
  assert.equal(gathering.verdict.title, 'Record the decision.')
  assert.equal(gathering.verdict.actions.includes('stop'), false)
  assert.equal(gathering.verdict.actions.includes('rollout'), false)
  const empty = readout([], { lifecycle: 'stopped' })
  assert.equal(sentenceText(empty.answer).includes('Results start tomorrow'), false)
  const winning = readout(exposures(150, 30, 75), { lifecycle: 'stopped' })
  assert.deepEqual(winning.verdict.actions, ['rollout', 'keep'])
})

test('a decided iterate / inconclusive does not claim the control "stays"', () => {
  const result = readout(exposures(150, 30, 31), {
    lifecycle: 'decided',
    decision: {
      outcome: 'inconclusive',
      chosenVariantKey: null,
      rationale: 'Something outside the test decided it',
    },
  })
  assert.equal(result.verdict.title, 'No clear answer.')
  assert.deepEqual(result.verdict.actions, [])
})
