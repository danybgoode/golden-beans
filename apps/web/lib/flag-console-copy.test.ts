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
import {
  dormantGroupLabel,
  flagListAnswerLine,
  flagListAnswerSegments,
  type FlagListSummaryCounts,
} from './flag-console-copy.ts'

import {
  describeActivationSurprise,
  describeRollback,
  describeTurnOffConsequence,
} from './flag-console-copy.ts'

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
// whatever the newer versions changed. It must be specific about WHICH versions stop applying —
// and specific relative to WHAT THIS ENVIRONMENT RUNS, not to where the flag's history ends.

const BACK = describeRollback({
  flagKey: 'checkout.stripe_enabled',
  environment: 'production',
  version: 2,
  currentVersion: 5,
})

test('rollback names the feature, the environment and BOTH versions involved', () => {
  assert.match(BACK, /checkout\.stripe_enabled/)
  assert.match(BACK, /production/)
  assert.match(BACK, /v2/)
  assert.match(BACK, /v5/)
})

test('rollback says what STOPS APPLYING — the versions being skipped, by number', () => {
  assert.match(BACK, /v3 through v5/)
  assert.match(BACK, /stops applying/)
})

test('DIRECTION IS RELATIVE TO WHAT THE ENVIRONMENT SERVES, not to the newest version', () => {
  // The regression this pins (cross-review, Agy, PR #120, Blocking): direction was computed as
  // `version < latestVersion`. With production on v1 and the newest at v5, choosing v3 was described
  // as "going BACK ... whatever changed in v4 through v5 stops applying" — but production was
  // rolling FORWARD from v1, and v4/v5 were never applying there to begin with. A confidently false
  // sentence on a control someone reaches for mid-incident.
  const forwardFromV1 = describeRollback({
    flagKey: 'a.b',
    environment: 'production',
    version: 3,
    currentVersion: 1,
  })
  assert.doesNotMatch(forwardFromV1, /goes BACK/)
  assert.doesNotMatch(forwardFromV1, /stops applying/)
  assert.match(forwardFromV1, /makes it the version production runs/)
})

test('the same target version reads differently depending on what is running', () => {
  // v3 is a rollback from v5 and a roll-forward from v1. The sentence must not be a function of the
  // target alone — which is exactly what the bug made it.
  const from5 = describeRollback({ flagKey: 'a.b', environment: 'production', version: 3, currentVersion: 5 })
  const from1 = describeRollback({ flagKey: 'a.b', environment: 'production', version: 3, currentVersion: 1 })
  assert.notEqual(from5, from1)
  assert.match(from5, /goes BACK/)
  assert.doesNotMatch(from1, /goes BACK/)
})

test('skipping exactly one version does not render an absurd range', () => {
  // A naive range prints "v5 through v5", which reads as a bug in the sentence rather than a fact
  // about the flag — and a confirmation the reader distrusts is a confirmation they stop reading.
  const one = describeRollback({ flagKey: 'a.b', environment: 'preview', version: 4, currentVersion: 5 })
  assert.match(one, /whatever changed in v5 stops applying/)
  assert.doesNotMatch(one, /v5 through v5/)
})

test('rollback says the change is reversible, because the registry is append-only', () => {
  assert.match(BACK, /No version is deleted/)
})

test('rollback warns it is not instant, like every other change to a served snapshot', () => {
  assert.match(BACK, /next snapshot poll/)
})

test('an environment serving nothing is described as such, and never as a rollback', () => {
  const fresh = describeRollback({
    flagKey: 'a.b',
    environment: 'development',
    version: 1,
    currentVersion: null,
  })
  assert.match(fresh, /is not serving a\.b right now/)
  // Nothing is being discarded, so nothing may claim to be.
  assert.doesNotMatch(fresh, /goes BACK/)
  assert.doesNotMatch(fresh, /stops applying/)
})

test('re-serving the version already running is not described as a rollback', () => {
  const same = describeRollback({ flagKey: 'a.b', environment: 'production', version: 3, currentVersion: 3 })
  assert.doesNotMatch(same, /goes BACK/)
  assert.doesNotMatch(same, /stops applying/)
})

test('rollback uses no storage vocabulary (D7)', () => {
  for (const term of ['activation', 'deactivate', 'immutable', 'snapshot revision', 'mint']) {
    assert.doesNotMatch(BACK, new RegExp(term, 'i'), `rollback still says "${term}"`)
  }
})

// ── "Activated" is not "on" ──────────────────────────────────────────────────────────────────
// A version whose default variant is falsey serves `false` while the console reports the feature as
// on. Live, that is the LATEST version of 34 of 42 miyagisanchez flags — the common case, not a
// corner. A "Turn on in production" button that silently activates such a version is the money-path
// defect the fresh reviewer found on PR #120.

const base = { flagKey: 'checkout.stripe_enabled', environment: 'production', version: 3 }

test('activating a TRUE-by-default version needs no confirmation', () => {
  // The ordinary case stays one click. A dialog on every enable is how a dialog stops being read,
  // which would cost more than it buys — including on the turn-OFF path that genuinely needs one.
  assert.equal(describeActivationSurprise({ ...base, defaultValue: true, readable: true }), null)
})

test('activating a FALSE-by-default version DOES warn, and says "on" will not mean what it says', () => {
  const message = describeActivationSurprise({ ...base, defaultValue: false, readable: true })
  assert.ok(message, 'a false-by-default activation must be confirmed')
  assert.match(message, /checkout\.stripe_enabled/)
  assert.match(message, /production/)
  assert.match(message, /v3/)
  assert.match(message, /will NOT\s+appear|will NOT appear/)
  // The distinction itself, stated — not just a warning that something is odd.
  assert.match(message, /not that the feature\s+is live|not that the feature is live/)
})

test('a NON-BOOLEAN default is not treated as "off"', () => {
  // A string, number or JSON flag is not off — it is a multivariate flag doing its job. Warning on
  // those would make the dialog cry wolf until nobody reads the one that matters.
  for (const value of ['treatment', 0, 1, '', { a: 1 }, [], null]) {
    assert.equal(
      describeActivationSurprise({ ...base, defaultValue: value, readable: true }),
      null,
      `${JSON.stringify(value)} should not be reported as off`
    )
  }
})

test('an UNREADABLE version warns rather than activating silently', () => {
  const message = describeActivationSurprise({ ...base, defaultValue: undefined, readable: false })
  assert.ok(message)
  assert.match(message, /cannot be evaluated/)
})

test('the warning names the environment it was asked about', () => {
  const dev = describeActivationSurprise({
    ...base,
    environment: 'development',
    defaultValue: false,
    readable: true,
  })
  assert.ok(dev)
  assert.match(dev, /development/)
  assert.doesNotMatch(dev, /production/)
})

// ── console-ia-overhaul · Sprint 3, Story 3.1 — the answer line ───────────────────────────────

const counts = (over: Partial<FlagListSummaryCounts> = {}): FlagListSummaryCounts => ({
  total: 0,
  serving: 0,
  switchedOff: 0,
  neverSwitched: 0,
  ...over,
})

// ── The answer line: one sentence per fact, as the prototype writes it ────────────────────────

test("production's real shape reads as separate sentences, not one glued list", () => {
  // ⚠️ The bug this replaces: gluing every clause into one sentence put the dormant count inside
  // the list of things being SERVED — "serving checkout.stripe_enabled and domain.paywall_enabled
  // and 40 never turned on here." Live production gets exactly that shape (3 on / 39 never, A20).
  assert.equal(
    flagListAnswerLine(counts({ total: 42, serving: 2, neverSwitched: 40 }), 'Production', [
      'checkout.stripe_enabled',
      'domain.paywall_enabled',
    ]),
    'Right now Production is serving checkout.stripe_enabled and domain.paywall_enabled.' +
      ' The other 40 have never been switched on in Production — nobody turned them off, nobody ever turned them on.'
  )
})

test('nothing serving says "nothing", which is this product\'s own common case', () => {
  // `off` is 0 in every environment and two of three serve nothing (A20). Not an edge.
  assert.equal(
    flagListAnswerLine(counts({ total: 40, neverSwitched: 40 }), 'preview'),
    'Right now preview is serving nothing.' +
      ' The other 40 have never been switched on in preview — nobody turned them off, nobody ever turned them on.'
  )
})

test('a deliberate switch-off gets its own sentence', () => {
  const line = flagListAnswerLine(
    counts({ total: 3, serving: 1, switchedOff: 1, neverSwitched: 1 }),
    'preview',
    ['a']
  )
  assert.equal(
    line,
    'Right now preview is serving a. 1 feature was deliberately switched off here.' +
      ' The other 1 have never been switched on in preview — nobody turned them off, nobody ever turned them on.'
  )
})

test('a project with no features says so, rather than trailing off', () => {
  assert.equal(flagListAnswerLine(counts(), 'Production'), 'No features in Production yet.')
})

test('the keys are MONO segments, which is how the design paints them gold', () => {
  // A plain string could not carry this, and the ported `.answer code` rule matched nothing because
  // there was no element to match.
  const segments = flagListAnswerSegments(counts({ total: 2, serving: 2 }), 'Production', ['a.b', 'c.d'])
  assert.deepEqual(
    segments.filter((segment) => segment.emphasis === 'mono').map((segment) => segment.text),
    ['a.b', 'c.d']
  )
  assert.ok(segments.some((segment) => segment.emphasis === 'strong' && segment.text === 'Production'))
})

test('EVERY combination is grammatical — including the NAMED path the old test never reached', () => {
  // ⚠️ The previous "exhaustive" test called the function with no `servingKeys`, so the branch the
  // whole naming fix added was outside the property test (fresh reviewer, round 2). A property test
  // that misses the new code path is a property test in name only.
  const keyPool = ['a.one', 'b.two', 'c.three', 'd.four', 'e.five']
  for (let serving = 0; serving <= 5; serving += 1) {
    for (let off = 0; off <= 2; off += 1) {
      for (let never = 0; never <= 2; never += 1) {
        for (const named of [true, false]) {
          const total = serving + off + never
          const line = flagListAnswerLine(
            counts({ total, serving, switchedOff: off, neverSwitched: never }),
            'production',
            named ? keyPool.slice(0, serving) : []
          )
          const at = `${serving}/${off}/${never}${named ? ' named' : ''}`
          assert.match(line, /\.$/, `no full stop at ${at}: ${line}`)
          assert.ok(!line.includes('  '), `doubled space at ${at}: ${line}`)
          assert.ok(!line.includes(' and and '), `doubled conjunction at ${at}: ${line}`)
          assert.ok(!line.includes('undefined'), `undefined leaked at ${at}: ${line}`)
          // The dormant count must never sit inside the "serving" clause — the bug this replaces.
          const servingClause = line.slice(0, line.indexOf('.') + 1)
          assert.ok(
            !/never (been )?switched on/.test(servingClause),
            `the dormant count is inside the serving sentence at ${at}: ${line}`
          )
        }
      }
    }
  }
})

test('the dormant summary line is plural-safe', () => {
  // Rendered on the one row that stands for every never-touched feature, so "1 features have" would
  // be on screen for any tenant with exactly one dormant flag.
  assert.equal(dormantGroupLabel(1, 'Production'), '1 feature has never been turned on in Production')
  assert.equal(dormantGroupLabel(39, 'Production'), '39 features have never been turned on in Production')
})
