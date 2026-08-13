// flags-visual-rule-builder · Sprint 2, Stories 2.1 and 2.2.
//
// Two claims are under test and only one of them is arithmetic.
//
//  1. **The bar cannot lie about an absent rollout.** "No rollout configured" means everyone who
//     matches; 0% means nobody. They are one keystroke apart in the definition and opposite in
//     meaning, and Story 2.1 names the failure exactly: an empty bar that reads as 0%.
//  2. **The state shown agrees with the SDK's evaluator.** Story 2.2 asks for a spec that asserts
//     the agreement rather than trusting the render. The pin below re-derives the variant through
//     `evaluateFlag` directly and compares — so replacing the seam's call with any locally written
//     comparison turns it red. That is the same mutation Sprint 3 uses on the preview, applied to
//     the surface that got here first.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as Module from 'node:module'
import { FLAG_ENVIRONMENTS, evaluateFlag, parseFlagDefinition, type FlagDefinition } from '@golden-frijoles/sdk'

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

const { summariseFlagEnvironments } = await import('./flag-environment-view.ts')

function definition(overrides: Partial<FlagDefinition> = {}): FlagDefinition {
  const value: FlagDefinition = {
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
    ...overrides,
  }
  assert.equal(parseFlagDefinition(value).ok, true, 'fixture rejected by the parser')
  return value
}

function flag(definitions: FlagDefinition[], activeIn: Record<string, number | undefined> = {}) {
  const versions = definitions.map((value, index) => ({
    id: `version-${index + 1}`,
    version: index + 1,
    definition: value,
  }))
  return {
    key: 'product.details',
    versions,
    activations: FLAG_ENVIRONMENTS.map((environment) => ({
      environment,
      versionId: activeIn[environment] ? `version-${activeIn[environment]}` : null,
    })),
  }
}

test('every environment gets a bar, and the list comes from the SDK constant', () => {
  const summaries = summariseFlagEnvironments(flag([definition()], { production: 1 }))
  assert.deepEqual(Object.keys(summaries), [...FLAG_ENVIRONMENTS])
  assert.equal(FLAG_ENVIRONMENTS.length, 3)
})

test('an environment with nothing activated says so — it does not render as a zero rollout', () => {
  const summaries = summariseFlagEnvironments(flag([definition()], { production: 1 }))
  const development = summaries.development

  assert.equal(development.active, false)
  assert.equal(development.fillPercent, null, 'an inactive environment must not draw a bar at all')
  assert.equal(development.label, 'not active')
  assert.equal(development.version, null)
})

test('a flag with NO rollout fills the bar and says "everyone" — never 0%', () => {
  // Story 2.1's named failure. `rules: []` and `rollout: {basisPoints: 0}` are both valid and mean
  // opposite things; the bar geometry and the label are derived from the same seam so they cannot
  // disagree about which one this is.
  const noRollout = definition({
    rules: [
      { priority: 10, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
    ],
  })
  const summary = summariseFlagEnvironments(flag([noRollout], { production: 1 })).production

  assert.equal(summary.reach.kind, 'everyone')
  assert.equal(summary.fillPercent, 100)
  assert.equal(summary.label, 'everyone')
})

test('a zero rollout is an empty bar labelled 0%, and that is a different statement', () => {
  const zero = definition({
    rules: [
      {
        priority: 10,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 0 },
        variantKey: 'on',
      },
    ],
  })
  const summary = summariseFlagEnvironments(flag([zero], { production: 1 })).production

  assert.deepEqual(summary.reach, { kind: 'rollout', basisPoints: 0 })
  assert.equal(summary.fillPercent, 0)
  assert.equal(summary.label, '0%')
})

test('the epic-defining number reaches the label as 10%, not 1000', () => {
  const summary = summariseFlagEnvironments(flag([definition()], { production: 1 })).production

  assert.equal(summary.label, '10%')
  assert.equal(summary.fillPercent, 10)
  assert.ok(!summary.label.includes('1000'), 'basis points leaked into a label')
})

test('rules with different rollouts are reported as several, not collapsed into one number', () => {
  // One bar cannot represent two rollouts. Picking the highest silently is how a PM reads "50%" off
  // a flag that is also serving a second variant to everyone who matches a different rule.
  const mixed = definition({
    rules: [
      {
        priority: 10,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 1000 },
        variantKey: 'on',
      },
      {
        priority: 20,
        clauses: [{ field: 'region', operator: 'equals', value: 'mx' }],
        rollout: { basisPoints: 5000 },
        variantKey: 'on',
      },
    ],
  })
  const summary = summariseFlagEnvironments(flag([mixed], { production: 1 })).production

  assert.deepEqual(summary.reach, {
    kind: 'several',
    highestBasisPoints: 5000,
    includesUnbounded: false,
    ruleCount: 2,
  })
  assert.equal(summary.label, 'up to 50%')
  assert.equal(summary.fillPercent, 50)
  assert.ok(summary.detail.includes('2 rules, not all reaching the same share'))
})

test('a rule with NO rollout beside one that has a rollout is a disagreement, not a 10% flag', () => {
  // Cross-review (Codex, Blocking). The rollout-less rule serves its variant to EVERY context it
  // matches, so a bar reading a confident "10%" understates the flag — and understating is the
  // dangerous direction: it says the blast radius is smaller than it is.
  const mixed = definition({
    rules: [
      {
        priority: 10,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 1000 },
        variantKey: 'on',
      },
      { priority: 20, clauses: [{ field: 'region', operator: 'equals', value: 'mx' }], variantKey: 'on' },
    ],
  })
  const summary = summariseFlagEnvironments(flag([mixed], { production: 1 })).production

  // `includesUnbounded` is carried separately from the numbers, and the label refuses to name a
  // percentage for it: a rule with no rollout reaches every context it matches, which is not the
  // same share as a 100% rollout (A5 — a 100% rollout still needs a targeting key).
  assert.deepEqual(summary.reach, {
    kind: 'several',
    highestBasisPoints: 1000,
    includesUnbounded: true,
    ruleCount: 2,
  })
  assert.equal(summary.label, 'up to everyone')
  assert.equal(summary.fillPercent, 100)
  assert.ok(summary.detail.includes('2 rules, not all reaching the same share'))
})

test('the spread count is the number of RULES, not the number of distinct percentages', () => {
  // 10 / 10 / 50 is three rules and two distinct rollouts. "2 rules" was the wrong number and the
  // one a reader would try, and fail, to find in the definition (cross-review, Codex).
  const three = definition({
    rules: [10, 20, 30].map((priority, index) => ({
      priority,
      clauses: [{ field: 'plan' as const, operator: 'equals' as const, value: `tier-${index}` }],
      rollout: { basisPoints: index === 2 ? 5000 : 1000 },
      variantKey: 'on',
    })),
  })
  const summary = summariseFlagEnvironments(flag([three], { production: 1 })).production

  assert.equal(summary.reach.kind, 'several')
  assert.ok(summary.detail.includes('3 rules, not all reaching the same share'))
})

test('rules that ALL carry a 100% rollout say 100%, not "everyone" — they are different statements', () => {
  // A 100% rollout still excludes a context with no targeting key (A5). An absent rollout does not.
  // Collapsing the two would tell a PM their flag reaches anonymous traffic when it does not.
  const full = definition({
    rules: [
      {
        priority: 10,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 10_000 },
        variantKey: 'on',
      },
    ],
  })
  const summary = summariseFlagEnvironments(flag([full], { production: 1 })).production

  assert.deepEqual(summary.reach, { kind: 'rollout', basisPoints: 10_000 })
  assert.equal(summary.label, '100%')
  assert.notEqual(summary.label, 'everyone')
})

test('a rule the evaluator can never reach does not change the number on the bar', () => {
  // Cross-review (Codex, round 3, Blocking). `evaluateFlag` sorts ascending and serves the FIRST
  // match, so a clause-less rollout-less rule at priority 10 matches everything and the 50% rule at
  // 20 is dead code. Summing over the whole list read "up to everyone · 2 rules, not all reaching
  // the same share" for a flag that in fact serves one variant to everyone, full stop.
  const shadowed = definition({
    rules: [
      { priority: 10, clauses: [], variantKey: 'on' },
      {
        priority: 20,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 5000 },
        variantKey: 'off',
      },
    ],
  })
  const summary = summariseFlagEnvironments(flag([shadowed], { production: 1 })).production

  assert.deepEqual(summary.reach, { kind: 'everyone' })
  assert.equal(summary.label, 'everyone')
  // …and the dead rule is named, not merely dropped. Its author believes it is doing something.
  assert.ok(summary.detail.includes('rules after priority 10 never run'))
})

test('a clause-less rule WITH a rollout shadows nothing — it does not always match', () => {
  // The bound on the shadow detection. A rollout can exclude a context (and always excludes one with
  // no targeting key, A5), so a rule carrying one is not a catch-all and the rules below it are live.
  const live = definition({
    rules: [
      { priority: 10, clauses: [], rollout: { basisPoints: 5000 }, variantKey: 'on' },
      {
        priority: 20,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 1000 },
        variantKey: 'off',
      },
    ],
  })
  const summary = summariseFlagEnvironments(flag([live], { production: 1 })).production

  assert.equal(summary.reach.kind, 'several')
  assert.ok(!summary.detail.includes('never run'))
})

test('a catch-all as the LAST rule shadows nothing — there is nothing below it', () => {
  const trailing = definition({
    rules: [
      {
        priority: 10,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 1000 },
        variantKey: 'on',
      },
      { priority: 20, clauses: [], variantKey: 'off' },
    ],
  })
  const summary = summariseFlagEnvironments(flag([trailing], { production: 1 })).production

  assert.equal(summary.reach.kind, 'several')
  assert.ok(!summary.detail.includes('never run'))
})

test('shadowing is decided by PRIORITY, not by the order the rules array happens to hold', () => {
  // The evaluator sorts; the array does not. A catch-all written second but numbered first still
  // shadows, and reading the array in order would have missed it.
  const shadowed = definition({
    rules: [
      {
        priority: 20,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 5000 },
        variantKey: 'off',
      },
      { priority: 10, clauses: [], variantKey: 'on' },
    ],
  })
  const summary = summariseFlagEnvironments(flag([shadowed], { production: 1 })).production

  assert.deepEqual(summary.reach, { kind: 'everyone' })
  assert.ok(summary.detail.includes('rules after priority 10 never run'))
})

test('a corrupt rollout is unreadable even when it sits BELOW a catch-all', () => {
  // Round 4 regression check. Moving the shadow filter in front of the readability guard meant a
  // basis-points value the D3 seam refuses stopped being noticed once it was shadowed — and the page
  // drew a full gold bar labelled "everyone" next to the words "this version cannot be evaluated".
  // The parser rejects the whole definition either way, so nothing is served; a confident-looking
  // bar is the one thing the row must not be. Fixtures here bypass the parser deliberately.
  const corrupt = (rules: FlagDefinition['rules']): FlagDefinition => ({
    valueType: 'boolean',
    description: 'Corrupt row.',
    defaultVariantKey: 'off',
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: true },
    ],
    rules,
  })

  const shadowed = corrupt([
    { priority: 10, clauses: [], variantKey: 'on' },
    { priority: 20, clauses: [], rollout: { basisPoints: 50_000 }, variantKey: 'off' },
  ])
  assert.equal(parseFlagDefinition(shadowed).ok, false, 'the fixture should be one the parser rejects')

  const summary = summariseFlagEnvironments(flag([shadowed], { production: 1 })).production
  assert.deepEqual(summary.reach, { kind: 'unreadable' })
  assert.equal(summary.label, 'unreadable')
  assert.equal(summary.fillPercent, null)

  // …and above the catch-all, which never regressed, so the two agree.
  const above = corrupt([
    { priority: 10, clauses: [], rollout: { basisPoints: 50_000 }, variantKey: 'off' },
    { priority: 20, clauses: [], variantKey: 'on' },
  ])
  assert.equal(summariseFlagEnvironments(flag([above], { production: 1 })).production.label, 'unreadable')
})

test('a null rollout and a missing rules array are unreadable, not "everyone" and not a crash', () => {
  // Cross-review round 5, Codex. `rollout: null` was read as "no rollout" — an unrestricted rule —
  // so a row the evaluator rejects outright drew a full bar labelled "everyone"; and a missing
  // `rules` array threw at `.length`. Both are answered by the same parser gate as everything else.
  const nullRollout = {
    ...definition(),
    rules: [{ ...definition().rules[0], rollout: null }],
  } as unknown as FlagDefinition
  const nulled = summariseFlagEnvironments(flag([nullRollout], { production: 1 })).production
  assert.deepEqual(nulled.reach, { kind: 'unreadable' })
  assert.equal(nulled.fillPercent, null)
  assert.notEqual(nulled.label, 'everyone')

  const noRules = { ...definition(), rules: undefined } as unknown as FlagDefinition
  const missing = summariseFlagEnvironments(flag([noRules], { production: 1 })).production
  assert.deepEqual(missing.reach, { kind: 'unreadable' })
  assert.equal(missing.fillPercent, null)
})

test('a null definition column is unreadable, not a crash on the way to asking', () => {
  // Cross-review round 6, Codex. Asking the evaluator still requires reading ONE field first — it
  // needs an `expectedType` — so a null JSONB column threw on the dereference before the graceful
  // path could run. An absent `valueType` now makes the probe value `undefined`, which the evaluator
  // refuses as TYPE_MISMATCH before it touches the definition at all.
  for (const broken of [null, undefined, 'not an object', 42, [], {}]) {
    const summary = summariseFlagEnvironments(
      flag([broken as unknown as FlagDefinition], { production: 1 })
    ).production
    assert.deepEqual(
      summary.reach,
      { kind: 'unreadable' },
      `crashed or mis-read on ${JSON.stringify(broken)}`
    )
    assert.equal(summary.fillPercent, null)
    assert.equal(summary.label, 'unreadable')
  }
})

test('a stored rule with no clauses array is unreadable, not a crash', () => {
  // The bar reads JSONB straight out of the database. Round 3 introduced the first read of
  // `rule.clauses.length` in this seam, which threw on such a row BEFORE the graceful
  // "cannot be evaluated" path could run — and for a single-version flag the bar is the only thing
  // rendering, so the throw would have taken the page with it (round 4).
  const malformed = {
    valueType: 'boolean',
    description: 'Row written by something that is not the parser.',
    defaultVariantKey: 'off',
    variants: [
      { key: 'off', value: false },
      { key: 'on', value: true },
    ],
    rules: [{ priority: 10, variantKey: 'on' }],
  } as unknown as FlagDefinition

  const summary = summariseFlagEnvironments(flag([malformed], { production: 1 })).production
  assert.deepEqual(summary.reach, { kind: 'unreadable' })
  assert.equal(summary.fillPercent, null)
})

test('a flag with NO rules draws no bar — a full bar would read as "fully rolled out"', () => {
  // Fresh review, PR #88: returning `everyone` here filled the bar completely on a flag that
  // targets nobody and serves its default. The caption calls the bar "the share of the contexts a
  // rule already matches"; with no rules that set is empty, so there is nothing to draw.
  const summary = summariseFlagEnvironments(flag([definition({ rules: [] })], { production: 1 })).production

  assert.deepEqual(summary.reach, { kind: 'no-rules' })
  assert.equal(summary.fillPercent, null)
  assert.equal(summary.label, 'default only')
})

test('a rollout-less rule beside a 100% rollout is a disagreement, not a flat 100%', () => {
  // The second collapse, and the subtler one (fresh review, PR #88). Mapping "no rollout" to 10000
  // made it AGREE with a rule that really is at 100% — so a flag one of whose rules reaches
  // anonymous traffic was labelled as one that does not.
  const mixed = definition({
    rules: [
      { priority: 10, clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }], variantKey: 'on' },
      {
        priority: 20,
        clauses: [{ field: 'region', operator: 'equals', value: 'mx' }],
        rollout: { basisPoints: 10_000 },
        variantKey: 'on',
      },
    ],
  })
  const summary = summariseFlagEnvironments(flag([mixed], { production: 1 })).production

  assert.equal(summary.reach.kind, 'several')
  assert.equal(summary.label, 'up to everyone')
  assert.notEqual(summary.label, '100%')
})

test('two rules sharing ONE rollout are not "several" — the number is unambiguous', () => {
  const shared = definition({
    rules: [
      {
        priority: 10,
        clauses: [{ field: 'plan', operator: 'equals', value: 'pro' }],
        rollout: { basisPoints: 1000 },
        variantKey: 'on',
      },
      {
        priority: 20,
        clauses: [{ field: 'region', operator: 'equals', value: 'mx' }],
        rollout: { basisPoints: 1000 },
        variantKey: 'on',
      },
    ],
  })
  const summary = summariseFlagEnvironments(flag([shared], { production: 1 })).production

  assert.deepEqual(summary.reach, { kind: 'rollout', basisPoints: 1000 })
  assert.equal(summary.label, '10%')
})

test('THE AGREEMENT PIN — the variant shown is the SDK evaluator’s answer, not a second derivation', () => {
  // Story 2.2's acceptance, asserted rather than trusted. This re-asks `evaluateFlag` the same
  // question the seam asks it and compares the answers, across a definition whose rules are all
  // shapes that behave differently under an attribute-free context:
  //   • a clause rule cannot match (no `plan` in context)
  //   • a rollout rule cannot match either (A5 — no targetingKey means the rule is excluded outright)
  //   • a bare rule with neither matches everything
  // Replace the seam's `evaluateFlag` call with any locally written comparison and this goes red.
  const shapes: FlagDefinition[] = [
    definition(),
    definition({ rules: [] }),
    definition({ defaultVariantKey: 'on', rules: [] }),
    definition({
      rules: [{ priority: 5, clauses: [], rollout: { basisPoints: 10_000 }, variantKey: 'on' }],
    }),
    definition({ rules: [{ priority: 5, clauses: [], variantKey: 'on' }] }),
  ]

  for (const value of shapes) {
    const summary = summariseFlagEnvironments(flag([value], { production: 1 })).production
    const authoritative = evaluateFlag({
      flag: { key: 'product.details', definitionVersion: 1, definition: value },
      context: {},
      defaultValue: false,
      expectedType: 'boolean',
    })
    assert.equal(
      summary.baselineVariantKey,
      authoritative.variant,
      `the page disagrees with the evaluator for ${JSON.stringify(value.rules)}`
    )
    assert.ok(summary.detail.includes(JSON.stringify(authoritative.variant)))
  }
})

test('a rollout rule with no targeting key in context resolves to the DEFAULT variant (A5)', () => {
  // Pinned as its own case because it is the trap the epic README flags: a full-100% rollout still
  // excludes a context with no targeting key, so "serves everyone" is the wrong reading of it.
  const summary = summariseFlagEnvironments(
    flag(
      [
        definition({
          rules: [{ priority: 5, clauses: [], rollout: { basisPoints: 10_000 }, variantKey: 'on' }],
        }),
      ],
      { production: 1 }
    )
  ).production

  assert.equal(summary.baselineVariantKey, 'off')
})

test('a version the evaluator refuses is named, not rendered as a variant nobody chose', () => {
  const broken = { ...definition(), defaultVariantKey: 'missing' } as FlagDefinition
  const summary = summariseFlagEnvironments(flag([broken], { production: 1 })).production

  assert.equal(summary.baselineVariantKey, null)
  assert.ok(summary.detail.includes('cannot be evaluated'))
})

test('an activation pointing at an unknown version is named rather than shown as "off"', () => {
  const view = flag([definition()], { production: 1 })
  view.activations = view.activations.map((row) =>
    row.environment === 'production' ? { ...row, versionId: 'version-404' } : row
  )
  const summary = summariseFlagEnvironments(view).production

  assert.equal(summary.active, false)
  assert.equal(summary.fillPercent, null)
  assert.ok(summary.detail.includes('could not be read'))
})
