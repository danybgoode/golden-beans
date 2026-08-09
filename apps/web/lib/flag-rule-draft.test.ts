// flags-visual-rule-builder · Sprint 1, Stories 1.2 and 1.3 — the builder's serialisation contract.
//
// The claim under test is D1's: two selects and a value control cannot produce a clause the backend
// rejects. That is only true if what the UI emits is checked against the REAL parser, so every
// round-trip case below ends in `parseFlagDefinition` — not in a hand-written expectation of what
// the parser probably wants.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  MAX_FLAG_CLAUSES,
  MAX_FLAG_RULES,
  FLAG_CONTEXT_FIELDS,
  parseFlagDefinition,
} from '@golden-beans/sdk'
import {
  canAddClause,
  canAddRule,
  definitionFromDraft,
  draftFromDefinition,
  emptyClauseDraft,
  emptyRuleDraft,
  FLAG_CLAUSE_OPERATORS,
} from './flag-rule-draft.ts'

const draft = () => ({
  valueType: 'boolean' as const,
  description: 'Reveal the new product details layout.',
  defaultVariantKey: 'off',
  variants: [
    { key: 'off', value: false },
    { key: 'on', value: true },
  ],
  rules: [
    {
      priority: 1,
      clauses: [{ field: 'plan' as const, operator: 'equals' as const, value: 'pro', values: [] }],
      rolloutPercent: null,
      variantKey: 'on',
    },
  ],
})

test('the operator list is the clause union itself, not a re-typed copy', () => {
  // D1. If the SDK ever grows a third operator this assertion is what notices — a hand-listed
  // ['equals','one_of'] would keep passing while the builder silently under-offered.
  assert.deepEqual([...FLAG_CLAUSE_OPERATORS], ['equals', 'one_of'])
  assert.equal(FLAG_CLAUSE_OPERATORS.length, 2)
})

test('a draft the UI can produce serialises to a definition the real parser accepts', () => {
  const result = definitionFromDraft(draft())
  assert.equal(result.ok, true, JSON.stringify(result))
  const parsed = parseFlagDefinition(result.ok && result.definition)
  assert.equal(parsed.ok, true, JSON.stringify(parsed))
})

test('every context field the SDK allows survives the round trip', () => {
  // Rather than testing `plan` and hoping the other five behave, walk the closed enum. A field the
  // builder offers but the parser rejects would be D1 broken, and this is where that shows up.
  for (const field of FLAG_CONTEXT_FIELDS) {
    const input = draft()
    input.rules[0].clauses = [{ field, operator: 'equals', value: 'x', values: [] }]
    const result = definitionFromDraft(input)
    assert.equal(result.ok, true, `${field}: ${JSON.stringify(result)}`)
    assert.equal(parseFlagDefinition(result.ok && result.definition).ok, true, `${field} was rejected`)
  }
})

test('one_of emits a values array and no value; equals emits the reverse', () => {
  // The parser rejects a clause carrying both (flags.ts parseClause). The shape is the contract.
  const input = draft()
  input.rules[0].clauses = [{ field: 'region', operator: 'one_of', value: '', values: ['mx', 'us'] }]
  const result = definitionFromDraft(input)
  assert.equal(result.ok, true, JSON.stringify(result))
  const clause = result.ok ? result.definition.rules[0].clauses[0] : null
  assert.deepEqual(clause, { field: 'region', operator: 'one_of', values: ['mx', 'us'] })
  assert.equal('value' in (clause as object), false)

  const equalsClause = definitionFromDraft(draft())
  assert.deepEqual(equalsClause.ok && equalsClause.definition.rules[0].clauses[0], {
    field: 'plan',
    operator: 'equals',
    value: 'pro',
  })
})

test('a rollout typed in percent is stored in basis points', () => {
  // The whole epic in one assertion. 10 in the control, 1000 in the definition.
  const input = draft()
  input.rules[0].rolloutPercent = 10
  const result = definitionFromDraft(input)
  assert.equal(result.ok && result.definition.rules[0].rollout?.basisPoints, 1000)
})

test('no rollout means the key is absent, not a zero rollout', () => {
  // `rollout: { basisPoints: 0 }` reaches nobody; omitting it reaches everyone. Emitting the first
  // when the PM configured neither would silently switch a rule off.
  const result = definitionFromDraft(draft())
  assert.equal(result.ok && 'rollout' in result.definition.rules[0], false)
})

test('an unrepresentable rollout is an error, never a coerced number', () => {
  const input = draft()
  input.rules[0].rolloutPercent = 150
  const result = definitionFromDraft(input)
  assert.equal(result.ok, false)
})

test('an empty equals value is refused before it reaches the parser', () => {
  const input = draft()
  input.rules[0].clauses = [{ field: 'plan', operator: 'equals', value: '', values: [] }]
  assert.equal(definitionFromDraft(input).ok, false)
})

test('one_of with no values is refused', () => {
  const input = draft()
  input.rules[0].clauses = [{ field: 'plan', operator: 'one_of', value: '', values: [] }]
  assert.equal(definitionFromDraft(input).ok, false)
})

test('the caps are the SDK constants, not literals that happen to match today', () => {
  // Sprint 1's mutation check lives here: hardcode 20 in the implementation, change MAX_FLAG_RULES,
  // and this goes red. Every bound is expressed as the constant so the test cannot drift from it.
  assert.equal(canAddRule(new Array(MAX_FLAG_RULES - 1).fill(null)), true)
  assert.equal(canAddRule(new Array(MAX_FLAG_RULES).fill(null)), false)
  assert.equal(canAddClause(new Array(MAX_FLAG_CLAUSES - 1).fill(null)), true)
  assert.equal(canAddClause(new Array(MAX_FLAG_CLAUSES).fill(null)), false)
})

test('exceeding a cap is refused by the seam, not left to the parser alone', () => {
  const input = draft()
  input.rules[0].clauses = new Array(MAX_FLAG_CLAUSES + 1)
    .fill(null)
    .map(() => ({ field: 'plan' as const, operator: 'equals' as const, value: 'pro', values: [] }))
  assert.equal(definitionFromDraft(input).ok, false)
})

test('duplicate priorities are refused — the parser rejects them and the PM should hear why', () => {
  const input = draft()
  input.rules = [input.rules[0], { ...input.rules[0] }]
  const result = definitionFromDraft(input)
  assert.equal(result.ok, false)
})

test('a stored definition loads back into a draft that re-serialises identically', () => {
  // D9's "no silent renumbering" and smoke step 5's symmetry, as one property: load → save with no
  // edits must produce byte-identical JSON. If it does not, opening a flag quietly rewrites it.
  const original = definitionFromDraft(draft())
  assert.equal(original.ok, true)
  const loaded = draftFromDefinition(original.ok ? original.definition : undefined)
  assert.notEqual(loaded, null)
  const round = definitionFromDraft(loaded!)
  assert.equal(round.ok, true)
  assert.equal(
    JSON.stringify(round.ok && round.definition),
    JSON.stringify(original.ok && original.definition)
  )
})

test('a rollout round-trips through the draft as the same basis points', () => {
  const input = draft()
  input.rules[0].rolloutPercent = 10
  const stored = definitionFromDraft(input)
  const loaded = draftFromDefinition(stored.ok ? stored.definition : undefined)
  assert.equal(loaded?.rules[0].rolloutPercent, 10)
  const round = definitionFromDraft(loaded!)
  assert.equal(round.ok && round.definition.rules[0].rollout?.basisPoints, 1000)
})

test('a definition the builder cannot faithfully represent refuses to load', () => {
  // A clause whose value is a NUMBER, not a string. `sameScalar` compares typeof as well as value,
  // so stringifying 5 into "5" would silently stop the rule matching a numeric context — a targeting
  // change nobody asked for, produced by merely opening the flag. The builder declines instead, and
  // the caller falls back to the JSON textarea. CODE-QUALITY rule 2: make it unrepresentable.
  const withNumericClause = {
    valueType: 'boolean' as const,
    description: 'x',
    defaultVariantKey: 'off',
    variants: [{ key: 'off', value: false }],
    rules: [{ priority: 1, clauses: [{ field: 'plan' as const, operator: 'equals' as const, value: 5 }], variantKey: 'off' }],
  }
  assert.equal(parseFlagDefinition(withNumericClause).ok, true, 'fixture must be a VALID definition')
  assert.equal(draftFromDefinition(withNumericClause), null)
})

test('an empty rule list is a valid definition — a flag can serve its default and nothing else', () => {
  const input = draft()
  input.rules = []
  const result = definitionFromDraft(input)
  assert.equal(result.ok, true, JSON.stringify(result))
  assert.equal(parseFlagDefinition(result.ok && result.definition).ok, true)
})

test('a new rule draft starts at a priority that does not collide', () => {
  const first = emptyRuleDraft([], 'off')
  const second = emptyRuleDraft([first], 'off')
  assert.notEqual(first.priority, second.priority)
  assert.ok(second.priority > first.priority)
})

test('a new clause draft is a valid starting shape for the first field in the enum', () => {
  const clause = emptyClauseDraft()
  assert.ok((FLAG_CONTEXT_FIELDS as readonly string[]).includes(clause.field))
  assert.equal(clause.operator, 'equals')
})
