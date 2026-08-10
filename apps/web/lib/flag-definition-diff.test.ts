// flags-visual-rule-builder · Sprint 2, Story 2.3 — the four cases the story names, plus the bound.
//
// The claim under test is D8's: the diff describes six parts and ADMITS when a change falls outside
// them. Both halves are assertions here, because a diff that only ever produces prose is the
// appetite trap the seed named — it stops being evidence the moment it cannot be wrong.
//
// Every fixture below round-trips through the REAL parser before it is diffed. A diff computed over
// a definition the backend would reject describes a version that could never exist, and the four
// cases would then be asserting the shape of a test fixture rather than the shape of stored data.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { parseFlagDefinition, type FlagDefinition } from '@golden-beans/sdk'

// The extensionless-import hook, verbatim from flag-rule-draft.test.ts — flag-definition-diff
// imports ./rollout-percent, which is D3's single-conversion rule expressed as a dependency.
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

const { diffFlagDefinitions, UNEXPLAINED_DIFF_TEXT } = await import('./flag-definition-diff.ts')

/** The Sprint 1 smoke flag: `plan is pro`, 10% rollout, serving `on`. */
function base(): FlagDefinition {
  return {
    valueType: 'boolean',
    description: 'Reveal the new product details layout.',
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
    ],
  }
}

/** Diff two definitions the parser accepts. A fixture it rejects is not a version. */
function diff(before: FlagDefinition, after: FlagDefinition) {
  for (const definition of [before, after]) {
    const checked = parseFlagDefinition(definition)
    assert.equal(checked.ok, true, `fixture rejected by the parser: ${JSON.stringify(definition)}`)
  }
  return diffFlagDefinitions(before, after)
}

function sentences(result: { changes: string[] }): string {
  return result.changes.join(' | ')
}

test('a rollout change reads in percent on BOTH sides, never in basis points', () => {
  // Smoke walkthrough step 4, and the mutation check sprint-2.md names: make the diff report basis
  // points and this is the assertion that goes red. 1000 → 5000 is the stored change; "10% → 50%"
  // is the only true statement about what the PM did.
  const after = base()
  after.rules[0].rollout = { basisPoints: 5000 }

  const result = diff(base(), after)
  assert.equal(result.unexplained, false)
  assert.deepEqual(result.changes, ['rule 10: rollout 10% → 50%'])
  assert.ok(!sentences(result).includes('1000'), 'a basis-points value leaked into the prose')
  assert.ok(!sentences(result).includes('5000'), 'a basis-points value leaked into the prose')
})

test('a narrowed clause names both the old and the new condition', () => {
  const after = base()
  after.rules[0].clauses = [
    { field: 'plan', operator: 'equals', value: 'pro' },
    { field: 'region', operator: 'one_of', values: ['mx', 'us'] },
  ]

  const result = diff(base(), after)
  assert.equal(result.unexplained, false)
  assert.deepEqual(result.changes, [
    'rule 10: conditions changed from plan is "pro" to plan is "pro" and region is one of "mx", "us"',
  ])
})

test('a scalar that changes TYPE is described as a change, because the evaluator treats it as one', () => {
  // `sameScalar` compares typeof as well as value, so a clause holding 5 stops matching a context
  // holding "5". Rendering both sides unquoted would describe a real behaviour change as no change.
  const before = base()
  before.rules[0].clauses = [{ field: 'plan', operator: 'equals', value: 5 }]
  const after = base()
  after.rules[0].clauses = [{ field: 'plan', operator: 'equals', value: '5' }]

  const result = diff(before, after)
  assert.deepEqual(result.changes, ['rule 10: conditions changed from plan is 5 to plan is "5"'])
})

test('a variant added is named with the value it serves', () => {
  const after = base()
  after.variants = [...after.variants, { key: 'holdback', value: false }]

  const result = diff(base(), after)
  assert.equal(result.unexplained, false)
  assert.deepEqual(result.changes, ['variant "holdback" added, serving false'])
})

test('a change OUTSIDE the six parts falls back, and says so rather than showing nothing', () => {
  // D8's bound, asserted. `description` is a real, valid, common change and it is deliberately not
  // one of the six — so the honest output is the fallback, not silence and not a guess.
  const after = base()
  after.description = 'Reveal the new product details layout to paying customers.'

  const result = diff(base(), after)
  assert.equal(result.unexplained, true)
  assert.deepEqual(result.changes, [])
  assert.equal(UNEXPLAINED_DIFF_TEXT, 'definition changed — show JSON')
})

test('an out-of-scope change does not SUPPRESS the part the diff can explain', () => {
  // The failure mode of a naive fallback: one describable change plus one undescribable one, and
  // the reader is shown only "definition changed". Both facts are reported.
  const after = base()
  after.description = 'Now with a wider rollout.'
  after.rules[0].rollout = { basisPoints: 5000 }

  const result = diff(base(), after)
  assert.equal(result.unexplained, true)
  assert.deepEqual(result.changes, ['rule 10: rollout 10% → 50%'])
})

test('metadata is outside the six parts — the textarea can write it and the diff must admit that', () => {
  // Smoke walkthrough step 5 exactly: add a metadata entry through the JSON textarea, then diff.
  const after = base()
  after.metadata = { owner: 'growth' }

  const result = diff(base(), after)
  assert.equal(result.unexplained, true)
})

test('identical versions produce no sentences and no fallback', () => {
  const result = diff(base(), base())
  assert.deepEqual(result.changes, [])
  assert.equal(result.unexplained, false)
})

test('a rollout removed is not the same statement as a rollout set to zero', () => {
  // "no rollout" means everyone who matches; 0% means nobody. rollout-percent.ts keeps the two
  // apart, and the diff has to as well or a PM reads a total switch-off as a widening.
  const withoutRollout = base()
  delete withoutRollout.rules[0].rollout

  const removed = diff(base(), withoutRollout)
  assert.deepEqual(removed.changes, [
    'rule 10: rollout removed — it now serves everyone who matches (was 10%)',
  ])

  const zeroed = base()
  zeroed.rules[0].rollout = { basisPoints: 0 }
  assert.deepEqual(diff(base(), zeroed).changes, ['rule 10: rollout 10% → 0%'])

  const added = diff(withoutRollout, base())
  assert.deepEqual(added.changes, [
    'rule 10: rollout limited to 10% — it previously served everyone who matched',
  ])
})

test('a rule that only changes priority reads as a move, not as a removal plus an addition', () => {
  // D9: priority IS the evaluation order, so renumbering is the change a PM most needs named. Two
  // sentences ("rule 10 removed", "rule 30 added") describe it truthfully and hide it completely.
  const after = base()
  after.rules[0].priority = 30

  const result = diff(base(), after)
  assert.deepEqual(result.changes, [
    'the rule serving "on" to plan is "pro" (10%) moved from priority 10 to 30',
  ])
})

test('a rule added and a rule removed are each named with what they served', () => {
  const after = base()
  after.rules = [
    ...after.rules,
    {
      priority: 20,
      clauses: [{ field: 'region', operator: 'equals', value: 'mx' }],
      variantKey: 'off',
    },
  ]

  const added = diff(base(), after)
  assert.deepEqual(added.changes, ['rule 20 added — it serves "off" to region is "mx" (everyone)'])

  const removed = diff(after, base())
  assert.deepEqual(removed.changes, ['rule 20 removed — it served "off" to region is "mx" (everyone)'])
})

test('the default variant change is named in the words the flags page uses', () => {
  const after = base()
  after.defaultVariantKey = 'on'

  const result = diff(base(), after)
  assert.deepEqual(result.changes, ['when no rule matches, this flag now serves "on" (was "off")'])
})

test('duplicate priorities cannot be paired, so the diff refuses rather than guesses', () => {
  // The parser rejects this, which is why the fixtures here bypass `diff()`'s parser assertion. It
  // is still reachable: the diff reads rows written by an OLDER parser, and a pairing we know is
  // wrong produces sentences that are worse than the fallback.
  const before = base()
  const after = base()
  after.rules = [after.rules[0], { ...after.rules[0] }]

  assert.equal(parseFlagDefinition(after).ok, false, 'the fixture should be one the parser rejects')
  const result = diffFlagDefinitions(before, after)
  assert.equal(result.unexplained, true)
})
