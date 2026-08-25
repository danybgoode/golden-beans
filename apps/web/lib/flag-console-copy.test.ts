// The money-path confirmation sentence, pinned in the merge gate.
//
// Story 2.2's acceptance criterion is that disabling a feature "asks first, and the confirmation
// names the specific feature, the environment, and what stops" — the audit's §1 standard, written
// against buttons that say *Activate* without ever saying what activation changes.
//
// That criterion is about WORDS on the most dangerous control in the product: this is how someone
// kills `checkout.stripe_enabled` on a live marketplace. Rendered inside a client island, the
// sentence would be reachable only through a signed-in browser — outside the merge gate — so the
// one assertion that matters most would be pinned by nothing. It is built by a pure function
// instead, and this file is what stops it degrading into "Are you sure?".

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { describeTurnOffConsequence } from './flag-console-copy.ts'

const SENTENCE = describeTurnOffConsequence('checkout.stripe_enabled', 'production')

test('it names the specific feature', () => {
  assert.match(SENTENCE, /checkout\.stripe_enabled/)
  // Not a generic noun standing in for the thing itself.
  assert.doesNotMatch(SENTENCE, /\bthis feature\b/i)
})

test('it names the environment', () => {
  assert.match(SENTENCE, /production/)
  // ...and the environment is not hardcoded — the wrong environment named confidently is worse
  // than none, because it reads as precision.
  assert.match(describeTurnOffConsequence('a.b', 'development'), /development/)
  assert.doesNotMatch(describeTurnOffConsequence('a.b', 'development'), /production/)
})

test('it says what STOPS, not merely what the system does', () => {
  // The audit's §1 finding in one assertion: the sentence must describe a consequence, not restate
  // the verb. "Deactivates the flag" would pass a naive check and fail the actual standard.
  assert.match(SENTENCE, /stops being served/)
  assert.match(SENTENCE, /falls back to its built-in default/)
})

test('it warns that the change is NOT instant everywhere', () => {
  // The property most likely to be dropped as "wordy", and the one an operator most needs mid-
  // incident: clients keep serving the old value until their next poll. Someone who turns a kill
  // switch off and watches the symptom persist for 60 seconds needs to know that is expected, not
  // reach for a second, worse lever.
  assert.match(SENTENCE, /until they poll again/)
})

test('it does not promise the damage is undone by turning it back on', () => {
  // An earlier draft ended at "turning it back on is one click", which reads as reassurance. On a
  // checkout path the click is cheap and the lost orders are not.
  assert.match(SENTENCE, /whatever broke in between still broke/)
})

test('it uses no storage vocabulary (D7)', () => {
  // The words this epic exists to retire. Grepping the RENDERED sentence, not the source.
  for (const term of ['activation', 'deactivate', 'immutable', 'snapshot revision', 'mint']) {
    assert.doesNotMatch(
      SENTENCE,
      new RegExp(term, 'i'),
      `the confirmation still says "${term}" — that is the vocabulary the epic is replacing`
    )
  }
})

test('every flag key and environment produces a sentence naming both', () => {
  for (const key of ['checkout.stripe_enabled', 'pdp_redesign', 'ml.sync_enabled']) {
    for (const environment of ['development', 'preview', 'production']) {
      const sentence = describeTurnOffConsequence(key, environment)
      assert.ok(sentence.includes(key), `${key}/${environment} did not name the feature`)
      assert.ok(sentence.includes(environment), `${key}/${environment} did not name the environment`)
    }
  }
})
