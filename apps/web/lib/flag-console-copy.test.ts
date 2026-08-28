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
  answerLineClauses,
  dormantGroupLabel,
  flagListAnswerLine,
  namedServingKeys,
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

test('a zero count is DROPPED from the answer line, never rendered as "0"', () => {
  // A20. This is production's ACTUAL shape: `switchedOff` is 0 in EVERY environment, so a rendered
  // "0 deliberately switched off" would be the sentence every reader gets, forever.
  const clauses = answerLineClauses(counts({ total: 42, serving: 3, neverSwitched: 39 }))
  assert.deepEqual(clauses, ['serving 3 features', '39 never turned on here'])
  assert.ok(!clauses.some((clause) => /\b0\b/.test(clause)), 'a zero-count clause reached the answer line')
})

test('the clauses present are exactly the states with a non-zero count', () => {
  // Asserted on the PARTS, not the rendered sentence. `flags-visual-rule-builder`'s single most
  // important check asserted nothing because Playwright normalises whitespace inside
  // `toContainText`; a list of clauses cannot fail that way.
  assert.deepEqual(answerLineClauses(counts({ total: 1, serving: 1 })), ['serving 1 feature'])
  assert.deepEqual(answerLineClauses(counts({ total: 1, switchedOff: 1 })), ['1 deliberately switched off'])
  assert.deepEqual(answerLineClauses(counts({ total: 1, neverSwitched: 1 })), ['1 never turned on here'])
  assert.equal(
    answerLineClauses(counts({ total: 3, serving: 1, switchedOff: 1, neverSwitched: 1 })).length,
    3
  )
})

test('one feature is a feature, not "1 features"', () => {
  assert.match(flagListAnswerLine(counts({ total: 1, serving: 1 }), 'Production'), /1 feature\b/)
  assert.match(flagListAnswerLine(counts({ total: 2, serving: 2 }), 'Production'), /2 features\b/)
  assert.equal(dormantGroupLabel(1, 'Production'), '1 feature has never been turned on in Production')
  assert.equal(dormantGroupLabel(39, 'Production'), '39 features have never been turned on in Production')
})

test("production's real answer line reads as a sentence, with no empty category in it", () => {
  const line = flagListAnswerLine(counts({ total: 42, serving: 3, neverSwitched: 39 }), 'Production')
  assert.equal(line, 'Production is serving 3 features and 39 never turned on here.')
  assert.ok(!line.includes('0 '), 'the live sentence announces an empty category')
})

test('three clauses join with commas and a final "and", not three "and"s', () => {
  assert.equal(
    flagListAnswerLine(counts({ total: 6, serving: 1, switchedOff: 2, neverSwitched: 3 }), 'Preview'),
    'Preview is serving 1 feature, 2 deliberately switched off and 3 never turned on here.'
  )
})

test('a project with no features says so, rather than trailing off', () => {
  // Every new tenant starts here. A dangling "Production is ." reads as a bug.
  assert.equal(flagListAnswerLine(counts(), 'Production'), 'No features in Production yet.')
})

test('with NOTHING serving, the line is a sentence rather than a stem plus a fragment', () => {
  // The bug this pins: "production is 2 never turned on here." The stem "<env> is …" assumes a verb
  // that only the serving clause supplies. Nothing serving is not an edge — it is every new
  // project, and on this product's own tenant it is every environment but one.
  assert.equal(
    flagListAnswerLine(counts({ total: 2, neverSwitched: 2 }), 'production'),
    'Nothing is on in production — 2 features have never been turned on here.'
  )
  assert.equal(
    flagListAnswerLine(counts({ total: 1, neverSwitched: 1 }), 'production'),
    'Nothing is on in production — 1 feature has never been turned on here.'
  )
  assert.equal(
    flagListAnswerLine(counts({ total: 2, switchedOff: 2 }), 'preview'),
    'Nothing is on in preview — 2 are deliberately switched off.'
  )
})

test('every combination of the three counts produces a grammatical sentence', () => {
  // The property behind the bug, asserted exhaustively rather than at one shape: whatever the mix,
  // the line ends in a full stop, has no doubled space, and never reads "is <number>" — which is
  // exactly what the broken stem produced.
  for (let serving = 0; serving <= 2; serving += 1) {
    for (let off = 0; off <= 2; off += 1) {
      for (let never = 0; never <= 2; never += 1) {
        const total = serving + off + never
        const line = flagListAnswerLine(
          counts({ total, serving, switchedOff: off, neverSwitched: never }),
          'production'
        )
        const at = `${serving}/${off}/${never}`
        assert.match(line, /\.$/, `no full stop at ${at}: ${line}`)
        assert.ok(!line.includes('  '), `doubled space at ${at}: ${line}`)
        assert.ok(!/\bis \d/.test(line), `reads as a stem plus a number at ${at}: ${line}`)
      }
    }
  }
})

test("the answer line NAMES what is serving, which is the design's whole point", () => {
  // "Right now Production is serving checkout.stripe_enabled and domain.paywall_enabled." A page
  // that reports a number answers "how many"; one that names them answers "what".
  assert.equal(
    flagListAnswerLine(counts({ total: 42, serving: 2, neverSwitched: 40 }), 'Production', [
      'checkout.stripe_enabled',
      'domain.paywall_enabled',
    ]),
    'Production is serving checkout.stripe_enabled and domain.paywall_enabled and 40 never turned on here.'
  )
})

test('naming is capped, because the line is prose and not a list', () => {
  assert.equal(namedServingKeys(['a']), 'a')
  assert.equal(namedServingKeys(['a', 'b']), 'a and b')
  assert.equal(namedServingKeys(['a', 'b', 'c']), 'a, b and c')
  // A tenant serving twenty would push the summary off the screen it exists to fit on.
  assert.equal(namedServingKeys(['a', 'b', 'c', 'd']), 'a, b and c and 1 more')
  assert.equal(namedServingKeys(['a', 'b', 'c', 'd', 'e']), 'a, b and c and 2 more')
})

test('with no keys supplied it still counts, so the function is usable without them', () => {
  assert.match(flagListAnswerLine(counts({ total: 3, serving: 3 }), 'Production'), /serving 3 features/)
})
