// flags-visual-rule-builder · Sprint 3, Story 3.2 — the wording IS the acceptance criterion.
//
// Story 3.2 does not ask for a correct answer; `explainFlagEvaluation` already guarantees that and
// flags.test.ts pins it. It asks for a correct SENTENCE — "excluded by rollout" reading as clearly
// different from "no rule matched", the default variant named rather than called DEFAULT (A5), and
// every rollout in percent (D3). Those are the assertions here.
//
// Every explanation below comes from the REAL `explainFlagEvaluation` over a definition the REAL
// parser accepts. A fixture hand-written to the shape the prose expects would assert that this file
// agrees with itself.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'
import {
  explainFlagEvaluation,
  parseFlagDefinition,
  type FlagDefinition,
  type FlagEvaluationContext,
} from '@golden-frijoles/sdk'

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

const { describeEvaluationOutcome, describeRuleConditions, describeRuleOutcome } =
  await import('./flag-explanation-prose.ts')

const definition: FlagDefinition = {
  valueType: 'boolean',
  description: 'The Sprint 1 smoke flag, plus a rule that cannot be reached.',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [
    {
      priority: 10,
      clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
      rollout: { basisPoints: 1000 },
      variantKey: 'on',
    },
    {
      priority: 20,
      clauses: [{ field: 'region', operator: 'one_of', values: ['mx', 'us'] }],
      variantKey: 'on',
    },
  ],
}

const flag = { key: 'product.details', definitionVersion: 3, definition }

function explain(context: FlagEvaluationContext) {
  assert.equal(parseFlagDefinition(definition).ok, true, 'fixture rejected by the parser')
  return explainFlagEvaluation({ flag, context })
}

/** The subject that the 10% rollout on rule 10 lets through, found rather than assumed. */
function admittedSubject(): string {
  for (let index = 0; index < 500; index++) {
    const targetingKey = `subject-${index}`
    const explained = explain({ targetingKey, plan: 'pro' })
    if (explained.matched?.priority === 10) return targetingKey
  }
  throw new Error('no subject in 500 was admitted by the 10% rollout — the fixture is wrong')
}

function excludedSubject(): string {
  for (let index = 0; index < 500; index++) {
    const targetingKey = `subject-${index}`
    const explained = explain({ targetingKey, plan: 'pro' })
    if (explained.rules.some((rule) => rule.outcome === 'rollout_excluded')) return targetingKey
  }
  throw new Error('no subject in 500 was excluded by the 10% rollout — the fixture is wrong')
}

test('a rollout exclusion does not read like "no rule matched" — the whole point of the sprint', () => {
  // sprint-3.md: "the single most confusing outcome and the one a PM is most likely to report as a
  // bug". Told only that nothing matched, they go and edit the conditions that were already right.
  const explained = explain({ targetingKey: excludedSubject(), plan: 'pro' })
  const sentence = describeRuleOutcome(explained.rules.find((rule) => rule.priority === 10)!)

  assert.ok(sentence.includes('conditions all matched'), sentence)
  assert.ok(sentence.includes('excluded this context'), sentence)
  assert.ok(sentence.includes('10% rollout'), sentence)
  assert.ok(!sentence.includes('did not match'), 'a rollout exclusion must not read as a clause failure')
  assert.ok(!sentence.includes('1000'), 'basis points leaked into the prose')
})

test('a missing targeting key is its own sentence, not a rollout exclusion (A5)', () => {
  const explained = explain({ plan: 'pro' })
  const sentence = describeRuleOutcome(explained.rules.find((rule) => rule.priority === 10)!)

  assert.ok(sentence.includes('needs a targeting key'), sentence)
  assert.ok(sentence.includes('10% rollout'), sentence)
  assert.ok(!sentence.includes('excluded this context'), 'the two rollout outcomes must read apart')
})

test('no rule matched names the default VARIANT and never says DEFAULT (A5)', () => {
  // 'DEFAULT' is the SDK's error-fallback reason. A context that simply matched nothing is STATIC,
  // and telling a PM "DEFAULT" would name an error state for a perfectly ordinary outcome.
  const explained = explain({ plan: 'free' })
  const sentence = describeEvaluationOutcome(explained)

  assert.equal(explained.reason, 'STATIC')
  assert.ok(sentence.startsWith('No rule matched.'), sentence)
  assert.ok(sentence.includes('"off"'), sentence)
  assert.ok(!/DEFAULT/.test(sentence), 'the word DEFAULT must not appear — it means an error here')
})

test('a match names the rule by priority and the variant it serves', () => {
  const explained = explain({ region: 'mx' })
  const sentence = describeEvaluationOutcome(explained)

  assert.equal(sentence, 'Rule 20 matched. This context gets "on".')
  assert.deepEqual(describeRuleConditions(explained.matched!), ['region is one of "mx", "us"'])
})

test('a matched rule that also passed a rollout says so, in percent', () => {
  const explained = explain({ targetingKey: admittedSubject(), plan: 'pro' })
  const sentence = describeRuleOutcome(explained.rules.find((rule) => rule.priority === 10)!)

  assert.ok(sentence.includes('10% rollout admitted this context'), sentence)
  assert.ok(!sentence.includes('1000'), 'basis points leaked into the prose')
})

test('a failing clause is named with the same words the version diff uses', () => {
  // One vocabulary across the epic: `describeFlagClause` is shared with flag-definition-diff, so a
  // reader sees one description of a condition on both panels rather than two.
  const explained = explain({ plan: 'free', region: 'br' })
  const twenty = describeRuleOutcome(explained.rules.find((rule) => rule.priority === 20)!)

  assert.equal(twenty, 'Rule 20 did not match: region is one of "mx", "us".')
})

test('a rule below the match is "never consulted", not "did not match"', () => {
  // The difference between teaching a PM about priority and lying to them about their conditions:
  // rule 20 WOULD have matched, and saying it did not would send them to fix a rule that is fine.
  const explained = explain({ targetingKey: admittedSubject(), plan: 'pro', region: 'mx' })
  const twenty = explained.rules.find((rule) => rule.priority === 20)!

  assert.equal(twenty.outcome, 'not_reached')
  assert.equal(
    describeRuleOutcome(twenty),
    'Rule 20 was never consulted — a lower-numbered rule matched first.'
  )
})

test('every refusal has its own sentence, and none of them guesses a variant', () => {
  assert.ok(
    describeEvaluationOutcome(explainFlagEvaluation({ flag: undefined })).includes('not in this environment')
  )
  const badDefinition = explainFlagEvaluation({
    flag: { ...flag, definition: { ...definition, defaultVariantKey: 'nope' } },
  })
  assert.ok(describeEvaluationOutcome(badDefinition).includes('cannot be evaluated'))

  const badContext = explainFlagEvaluation({ flag, context: { nonsense: 'x' } as never })
  assert.ok(describeEvaluationOutcome(badContext).includes('refused that context'))
})

test('no sentence anywhere in the epic renders a rollout in basis points', () => {
  // The mutation check, as a sweep: every outcome this file can produce, over every rule shape, and
  // none of them may contain the stored unit. A rollout described as "1000" is a true statement
  // about the database and a false one about what the PM configured.
  const contexts: FlagEvaluationContext[] = [
    {},
    { plan: 'pro' },
    { plan: 'free' },
    { region: 'mx' },
    { targetingKey: admittedSubject(), plan: 'pro' },
    { targetingKey: excludedSubject(), plan: 'pro' },
  ]
  for (const context of contexts) {
    const explained = explain(context)
    const sentences = [describeEvaluationOutcome(explained), ...explained.rules.map(describeRuleOutcome)]
    for (const sentence of sentences) {
      assert.ok(!sentence.includes('1000'), `basis points in: ${sentence}`)
      assert.ok(!sentence.includes('basis'), `the stored unit was named in: ${sentence}`)
    }
  }
})
