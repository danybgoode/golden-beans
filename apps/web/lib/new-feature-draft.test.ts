// Unit layer for the "New feature" control's composition (Story 3.3).
//
// The whole of `new-feature-draft.ts` is reachable from here because it is import-free: no React,
// no database, no SDK. The wizard that renders it can only be exercised through a signed-in
// browser, which is outside the merge gate — so everything worth pinning lives in this file, and
// this file IS the gate for it.
//
// ⚠️ **The last block imports the SDK's real validator by relative path**, which is the one thing
// this module deliberately does NOT do. That is the point: `new-feature-draft.ts` composes a key
// and a definition, and the only claim worth making about them is that the SERVER's validator
// accepts them. Asserting that against a re-typed regex would be asserting a copy.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMPTY_NEW_FEATURE_DRAFT,
  NEW_FEATURE_KEY_SUFFIX,
  NO_FEATURE_AREA,
  buildNewFeatureDefinition,
  composeFeatureKey,
  describeNewFeatureArrival,
  featureAreas,
  newFeatureReason,
  normaliseFeatureName,
  previewFeatureKey,
  stepProblem,
  takenKeyProblem,
  type NewFeatureDraft,
} from './new-feature-draft.ts'
import { parseFlagDefinition, validateFlagKey } from '../../../packages/sdk/src/flags.ts'

const READY: NewFeatureDraft = {
  area: 'checkout',
  name: 'apple_pay',
  description: 'Offer Apple Pay at checkout.',
  kind: 'enablement',
  risk: 'medium',
}

test('featureAreas derives the namespaces a project already uses', () => {
  assert.deepEqual(
    featureAreas([
      'checkout.stripe_enabled',
      'catalog.owned_shop_only_enabled',
      'checkout.apple_pay_enabled',
      'legacy_enabled',
    ]),
    ['catalog', 'checkout']
  )
})

test('featureAreas ignores a leading dot rather than inventing an empty area', () => {
  // `indexOf('.') > 0`, not `>= 0`. A key beginning with a dot cannot exist (FLAG_KEY requires a
  // leading letter), but an empty-string area would collide with NO_FEATURE_AREA and silently
  // become "no area" in the picker — a value that means two things.
  assert.deepEqual(featureAreas(['.broken_enabled', 'ok.thing_enabled']), ['ok'])
})

test('featureAreas is empty for a project whose keys have no namespace', () => {
  // The wizard must still work for a brand-new tenant, which is the case where it matters most.
  assert.deepEqual(featureAreas(['first_enabled']), [])
})

test('normaliseFeatureName keeps only what a flag key may contain', () => {
  assert.equal(normaliseFeatureName('Apple Pay!'), 'applepay')
  assert.equal(normaliseFeatureName('OWNED_shop_2'), 'owned_shop_2')
  // A dot is dropped even though FLAG_KEY allows one: the area picker owns namespaces, and a name
  // smuggling a second one would make the preview line stop describing what gets created.
  assert.equal(normaliseFeatureName('checkout.apple'), 'checkoutapple')
})

test('composeFeatureKey joins the area, the name and the fixed ending', () => {
  assert.equal(composeFeatureKey('checkout', 'apple_pay'), 'checkout.apple_pay_enabled')
  assert.equal(composeFeatureKey(NO_FEATURE_AREA, 'apple_pay'), 'apple_pay_enabled')
  assert.equal(NEW_FEATURE_KEY_SUFFIX, '_enabled')
})

test('composeFeatureKey returns no stem at all for an empty name', () => {
  // NOT `checkout._enabled`, which is a real key shape the server would accept — creating a flag
  // named after nothing because the reader had not typed yet.
  assert.equal(composeFeatureKey('checkout', ''), 'checkout.')
  assert.equal(composeFeatureKey(NO_FEATURE_AREA, ''), '')
})

test('previewFeatureKey shows the SHAPE before the middle is typed', () => {
  assert.equal(previewFeatureKey('checkout', ''), 'checkout.…_enabled')
  assert.equal(previewFeatureKey(NO_FEATURE_AREA, 'ap'), 'ap_enabled')
})

test('the name step refuses a name shorter than three characters', () => {
  assert.match(stepProblem({ ...READY, name: 'ap' }, 'name') ?? '', /three characters/)
  assert.equal(stepProblem(READY, 'name'), null)
})

test('the name step refuses a digit-leading name only when there is no area', () => {
  // `2fa_enabled` fails the SDK's FLAG_KEY (leading letter required); `checkout.2fa_enabled` passes,
  // because the leading letter comes from the area. Both directions asserted, so the rule cannot be
  // widened to "never start with a digit" without this going red.
  assert.match(
    stepProblem({ ...READY, area: NO_FEATURE_AREA, name: '2fa' }, 'name') ?? '',
    /start with a letter/
  )
  assert.equal(stepProblem({ ...READY, area: 'checkout', name: '2fa' }, 'name'), null)
})

test('the name step requires the one sentence the list will show', () => {
  assert.match(stepProblem({ ...READY, description: '   ' }, 'name') ?? '', /one sentence/)
  assert.match(stepProblem({ ...READY, description: 'x'.repeat(501) }, 'name') ?? '', /under 500/)
})

test('the kind step requires both the kind and the risk', () => {
  assert.match(stepProblem({ ...READY, kind: null }, 'kind') ?? '', /kill switch or a release toggle/)
  assert.match(stepProblem({ ...READY, risk: null }, 'kind') ?? '', /the wrong way/)
  assert.equal(stepProblem(READY, 'kind'), null)
})

test('the check step re-asks every earlier step', () => {
  // A reader can walk BACK and empty a field. If `check` only looked at itself, the create button
  // would stay live over a draft the server is going to reject.
  assert.match(stepProblem({ ...READY, name: '' }, 'check') ?? '', /three characters/)
  assert.match(stepProblem({ ...READY, risk: null }, 'check') ?? '', /the wrong way/)
  assert.equal(stepProblem(READY, 'check'), null)
})

test('an empty draft cannot leave step one', () => {
  assert.notEqual(stepProblem(EMPTY_NEW_FEATURE_DRAFT, 'name'), null)
  assert.notEqual(stepProblem(EMPTY_NEW_FEATURE_DRAFT, 'check'), null)
})

test('a key that already exists is refused, because the action would VERSION it instead', () => {
  const taken = ['checkout.stripe_enabled', 'catalog.owned_shop_only_enabled']
  assert.match(takenKeyProblem('checkout.stripe_enabled', taken) ?? '', /already exists/)
  assert.equal(takenKeyProblem('checkout.apple_pay_enabled', taken), null)
  // Exact match, never a prefix: `checkout.stripe_enabled_v2` is a different feature.
  assert.equal(takenKeyProblem('checkout.stripe_enabled_v2', taken), null)
})

test('BOTH kinds default to on, so a new feature can actually be turned on', () => {
  // ⚠️ The obvious reading of the design maps "a release toggle is off by default" to
  // `defaultVariantKey: 'off'`. In this control plane that creates a feature whose own switch warns
  // about it: `describeActivationSurprise` raises a confirm on any activation of a version that
  // evaluates to `false`. Asserted for both kinds so the "obvious" version cannot be reintroduced
  // without this going red.
  assert.equal(buildNewFeatureDefinition({ ...READY, kind: 'killswitch' }).defaultVariantKey, 'on')
  assert.equal(buildNewFeatureDefinition({ ...READY, kind: 'enablement' }).defaultVariantKey, 'on')
  // And the variant it names carries `true`, which is what makes the sentence above true.
  for (const kind of ['killswitch', 'enablement'] as const) {
    const built = buildNewFeatureDefinition({ ...READY, kind })
    const chosen = built.variants.find((variant) => variant.key === built.defaultVariantKey)
    assert.equal(chosen?.value, true, `${kind} would be activated and still serve false`)
  }
})

test('what the KIND decides is the stored polarity, not the default variant', () => {
  assert.equal(buildNewFeatureDefinition({ ...READY, kind: 'killswitch' }).metadata.polarity, 'killswitch')
  assert.equal(buildNewFeatureDefinition({ ...READY, kind: 'enablement' }).metadata.polarity, 'enablement')
})

test('the definition stores the metadata spellings the list reads', () => {
  const built = buildNewFeatureDefinition({ ...READY, kind: 'killswitch', risk: 'high' })
  // `killswitch`, one word — the STORED spelling. "Kill switch" is what flag-vocabulary.ts renders.
  assert.deepEqual(built.metadata, { polarity: 'killswitch', criticality: 'high' })
  assert.deepEqual(built.rules, [])
  assert.equal(built.description, 'Offer Apple Pay at checkout.')
})

test('buildNewFeatureDefinition refuses to invent a kind or a risk', () => {
  assert.throws(() => buildNewFeatureDefinition({ ...READY, kind: null }), /kind and a risk/)
  assert.throws(() => buildNewFeatureDefinition({ ...READY, risk: null }), /kind and a risk/)
})

test('the audit reason names the surface that did it', () => {
  assert.equal(
    newFeatureReason('checkout.apple_pay_enabled'),
    'Created checkout.apple_pay_enabled from the features list.'
  )
  // Non-blank, because the RPC rejects an empty reason.
  assert.ok(newFeatureReason('a_enabled').trim().length > 0)
})

test('the arrival sentence says both halves: nothing yet, and what happens when you turn it on', () => {
  const sentence = describeNewFeatureArrival()
  assert.match(sentence, /Nothing is switched on yet/)
  // The second half is the part a control that only said what it will NOT do would leave to a guess.
  assert.match(sentence, /everyone there gets it/)
})

// ── The contract with the real validator ─────────────────────────────────────────────────────
// Everything above tests this module against itself. These test it against the thing that will
// actually reject it, which is the only assertion that can fail for a reason worth knowing.

test('every key this control can compose is accepted by the SDK validator', () => {
  const areas = ['checkout', 'seller_agent', NO_FEATURE_AREA]
  const names = ['apple_pay', 'a2', 'owned_shop_only', 'x'.repeat(60)]
  for (const area of areas) {
    for (const name of names) {
      const key = composeFeatureKey(area, name)
      assert.ok(validateFlagKey(key), `${key} is not a valid flag key`)
    }
  }
})

test('a name the name-step REFUSES is exactly a name the validator would refuse', () => {
  // The teeth: the step's rule is not a stylistic preference, it is the server's rule stated early.
  const bad = { ...READY, area: NO_FEATURE_AREA, name: '2fa' }
  assert.notEqual(stepProblem(bad, 'name'), null)
  assert.equal(validateFlagKey(composeFeatureKey(bad.area, bad.name)), false)
})

test('every definition this control can build is accepted by the SDK parser', () => {
  for (const kind of ['killswitch', 'enablement'] as const) {
    for (const risk of ['high', 'medium', 'low'] as const) {
      const result = parseFlagDefinition(buildNewFeatureDefinition({ ...READY, kind, risk }))
      assert.equal(result.ok, true, `${kind}/${risk}: ${result.ok ? '' : result.errors.join(', ')}`)
    }
  }
})

test('a blank description is rejected by the parser, which is why the name step asks for one', () => {
  const result = parseFlagDefinition(buildNewFeatureDefinition({ ...READY, description: '      ' }))
  assert.equal(result.ok, false)
})
