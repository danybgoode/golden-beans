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

/** The same flag with a different rule list — the shape most of the reorder cases need. */
function withRules(rules: FlagDefinition['rules']): FlagDefinition {
  return { ...base(), rules }
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

test('two rules SWAPPING priorities read as two moves, not as four rewrites', () => {
  // Fresh review, PR #88 — the highest-value misleading sentence found. Pairing by priority alone
  // matched rule 10 to rule 10 and rule 20 to rule 20, so an edit that rewrote nothing produced
  // four sentences claiming both rules had had their conditions and their variant changed. D9's
  // "the evaluation order changed and nothing else did" was the one fact it hid completely.
  const before = withRules([
    { priority: 10, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    { priority: 20, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'off' },
  ])
  const after = withRules([
    { priority: 10, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'off' },
    { priority: 20, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
  ])

  const result = diff(before, after)
  assert.equal(result.unexplained, false)
  assert.deepEqual(result.changes, [
    'the rule serving "on" to plan is "pro" (everyone) moved from priority 10 to 20',
    'the rule serving "off" to region is "mx" (everyone) moved from priority 20 to 10',
  ])
  assert.ok(
    !sentences(result).includes('conditions changed'),
    'a reorder must never be described as a rewrite'
  )
})

test('reordering the rules ARRAY without changing any priority is no change at all', () => {
  // The evaluator sorts by priority, so array order is not behaviour. The reorder path must not
  // invent a move out of it.
  const before = withRules([
    { priority: 10, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    { priority: 20, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'off' },
  ])
  const after = withRules([...before.rules].reverse())

  const result = diff(before, after)
  assert.deepEqual(result.changes, [])
  assert.equal(result.unexplained, false)
})

test('two IDENTICAL rules that swap priorities produce no sentences — nothing distinguishes them', () => {
  // Bodies can legitimately repeat: the parser requires unique priorities, not unique rules. Paired
  // by sorted priority, so the diff reports the fewest moves rather than guessing which of two
  // indistinguishable rules the author "meant" to move.
  const body = {
    clauses: [{ field: 'plan' as const, operator: 'equals' as const, value: 'pro' }],
    variantKey: 'on',
  }
  const before = withRules([
    { priority: 10, ...body },
    { priority: 20, ...body },
  ])
  const after = withRules([
    { priority: 20, ...body },
    { priority: 10, ...body },
  ])

  assert.deepEqual(diff(before, after).changes, [])
})

test('reordering a CLAUSE list is not a change — the evaluator ANDs them', () => {
  // Cross-review (Codex, round 2). `matchesRule` loops the clauses and fails on the first miss, so
  // position carries no meaning. Reporting "conditions changed from … to …" for a reorder describes
  // a behaviour change that did not happen, which is the diff's one unforgivable failure.
  const before = withRules([
    {
      priority: 10,
      clauses: [
        { field: 'plan', operator: 'equals', value: 'pro' },
        { field: 'region', operator: 'equals', value: 'mx' },
      ],
      variantKey: 'on',
    },
  ])
  const after = withRules([{ ...before.rules[0], clauses: [...before.rules[0].clauses].reverse() }])

  assert.deepEqual(diff(before, after).changes, [])
})

test('reordering a one_of list is not a change either — the evaluator uses .some()', () => {
  const before = withRules([
    {
      priority: 10,
      clauses: [{ field: 'region', operator: 'one_of', values: ['mx', 'us', 'ca'] }],
      variantKey: 'on',
    },
  ])
  const after = withRules([
    {
      priority: 10,
      clauses: [{ field: 'region', operator: 'one_of', values: ['ca', 'mx', 'us'] }],
      variantKey: 'on',
    },
  ])

  assert.deepEqual(diff(before, after).changes, [])

  // …but ADDING a value to that list still is one, described in the stored order.
  const widened = withRules([
    {
      priority: 10,
      clauses: [{ field: 'region', operator: 'one_of', values: ['mx', 'us', 'ca', 'br'] }],
      variantKey: 'on',
    },
  ])
  assert.deepEqual(diff(before, widened).changes, [
    'rule 10: conditions changed from region is one of "mx", "us", "ca" to region is one of "mx", "us", "ca", "br"',
  ])
})

test('a rule that did NOT move is never described as moving to make room for one that did', () => {
  // Fresh review, round 2. Pairing identical bodies by sorted index reported [1,2] → [2,3] as TWO
  // moves — including "moved from priority 2 to 3" while a rule is still sitting at priority 2. The
  // shared priority is taken out of the pairing first, so the only move reported is the real one.
  const body = {
    clauses: [{ field: 'plan' as const, operator: 'equals' as const, value: 'pro' }],
    variantKey: 'on',
  }
  const before = withRules([
    { priority: 1, ...body },
    { priority: 2, ...body },
  ])
  const after = withRules([
    { priority: 2, ...body },
    { priority: 3, ...body },
  ])

  assert.deepEqual(diff(before, after).changes, [
    'the rule serving "on" to plan is "pro" (everyone) moved from priority 1 to 3',
  ])
})

test('a swap COMBINED with an edit still names the move, instead of reporting two rewrites', () => {
  // Fresh review, round 2: the all-or-nothing "same multiset of bodies" pre-check was defeated by
  // any concurrent edit, and the four false rewrites came straight back. Body-first reconciliation
  // is incremental, so the rule that only moved is still described as having only moved.
  const before = withRules([
    { priority: 10, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    { priority: 20, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'off' },
  ])
  const after = withRules([
    { priority: 10, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'off' },
    {
      priority: 20,
      clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
      rollout: { basisPoints: 5000 },
      variantKey: 'on',
    },
  ])

  const result = diff(before, after)
  assert.deepEqual(result.changes, [
    'the rule serving "off" to region is "mx" (everyone) moved from priority 20 to 10',
    'rule 10 removed — it served "on" to plan is "pro" (everyone)',
    'rule 20 added — it serves "on" to plan is "pro" (50%)',
  ])
  assert.ok(
    !sentences(result).includes('conditions changed'),
    'the untouched rule must not be described as rewritten'
  )
})

test('a reorder alongside an out-of-scope change reports BOTH the move and the fallback', () => {
  // The early return that round 1's pre-check used has gone; this pins that nothing it guarded is
  // lost — the default-variant sentence, the variants diff and `unexplained` all still apply.
  const before = withRules([
    { priority: 10, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    { priority: 20, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'off' },
  ])
  const after: FlagDefinition = {
    ...before,
    defaultVariantKey: 'on',
    metadata: { owner: 'growth' },
    rules: [
      { priority: 10, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'off' },
      { priority: 20, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    ],
  }

  const result = diff(before, after)
  assert.equal(result.unexplained, true)
  assert.deepEqual(result.changes, [
    'when no rule matches, this flag now serves "on" (was "off")',
    'the rule serving "on" to plan is "pro" (everyone) moved from priority 10 to 20',
    'the rule serving "off" to region is "mx" (everyone) moved from priority 20 to 10',
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
