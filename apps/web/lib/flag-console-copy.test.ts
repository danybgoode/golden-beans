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
import { describeRollback, describeTurnOffConsequence } from './flag-console-copy.ts'

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

// ── Rollback ─────────────────────────────────────────────────────────────────────────────────
// Same reasoning as the turn-off sentence: this is read mid-incident, by someone about to discard
// whatever the newer versions changed. It must be specific about WHICH versions stop applying.

const BACK = describeRollback({
  flagKey: 'checkout.stripe_enabled',
  environment: 'production',
  version: 2,
  latestVersion: 5,
  replacing: 'a different version',
})

test('rollback names the feature, the environment and BOTH versions involved', () => {
  assert.match(BACK, /checkout\.stripe_enabled/)
  assert.match(BACK, /production/)
  assert.match(BACK, /v2/)
  assert.match(BACK, /v5/)
})

test('rollback says what STOPS APPLYING — the versions being skipped, by number', () => {
  // "This will change the served version" would be true and useless. The reader needs to know that
  // v3, v4 and v5's behaviour goes away, because that is the decision they are actually making.
  assert.match(BACK, /v3 through v5/)
  assert.match(BACK, /stops applying/)
})

test('skipping exactly one version does not render an absurd range', () => {
  // A naive range prints "v5 through v5", which reads as a bug in the sentence rather than a fact
  // about the flag — and a confirmation the reader distrusts is a confirmation they stop reading.
  const one = describeRollback({
    flagKey: 'a.b',
    environment: 'preview',
    version: 4,
    latestVersion: 5,
    replacing: 'a different version',
  })
  assert.match(one, /whatever changed in v5 stops applying/)
  assert.doesNotMatch(one, /v5 through v5/)
})

test('rolling FORWARD does not claim anything stops applying', () => {
  // Serving the newest version discards nothing, and saying otherwise would make the sentence
  // wrong in the direction that causes hesitation at the wrong moment.
  const forward = describeRollback({
    flagKey: 'a.b',
    environment: 'production',
    version: 5,
    latestVersion: 5,
    replacing: 'a different version',
  })
  assert.doesNotMatch(forward, /stops applying/)
  assert.doesNotMatch(forward, /goes BACK/)
})

test('rollback says the change is reversible, because the registry is append-only', () => {
  // True and load-bearing: an operator who believes a rollback destroys the newer versions will
  // hesitate over a reversible act during an incident.
  assert.match(BACK, /No version is deleted/)
})

test('rollback warns it is not instant, like every other change to a served snapshot', () => {
  assert.match(BACK, /next snapshot poll/)
})

test('an environment serving nothing is described as such, not as "a different version"', () => {
  const fresh = describeRollback({
    flagKey: 'a.b',
    environment: 'development',
    version: 1,
    latestVersion: 1,
    replacing: null,
  })
  assert.match(fresh, /is not serving a\.b right now/)
})

test('rollback uses no storage vocabulary (D7)', () => {
  for (const term of ['activation', 'deactivate', 'immutable', 'snapshot revision', 'mint']) {
    assert.doesNotMatch(BACK, new RegExp(term, 'i'), `rollback still says "${term}"`)
  }
})
