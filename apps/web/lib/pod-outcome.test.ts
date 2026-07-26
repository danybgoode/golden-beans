import { test } from 'node:test'
import assert from 'node:assert/strict'
import { rate, buildOutcomeRow, buildOutcomeSection, OUTCOME_NOT_INSTRUMENTED } from './pod-outcome.ts'

// The outcome layer answers "did it matter?", which is the half a buyer weighs most. Its failure
// mode is the mirror of the delivery half's: there, a fabricated number flattered us; here, a
// fabricated ZERO would damn a feature that simply has not been measured yet. Both are lies, and
// the tests below pin the difference between "no data" and "a real zero" in every direction.

const tars = (targeted: number, adopted: number, retained: number) => ({ targeted, adopted, retained })

test('rate returns NULL on a zero denominator — never 0, which would read as total failure', () => {
  // The distinction that matters: 0 adopted out of 0 targeted means "nobody was targeted yet",
  // not "everyone we targeted refused".
  assert.equal(rate(0, 0), null)
  assert.equal(rate(5, 0), null)
  assert.equal(rate(0, 10), 0, 'a REAL zero — ten targeted, none adopted — must still be reported')
  assert.equal(rate(7, 17), 0.412)
})

test('rate refuses non-finite input rather than emitting NaN', () => {
  // NaN serialises to `null` in JSON, so letting it through would make a broken computation
  // indistinguishable from an honest "not measured".
  assert.equal(rate(Number.NaN, 10), null)
  assert.equal(rate(1, Number.POSITIVE_INFINITY), null)
  assert.equal(rate(1, -5), null)
})

test('an outcome row carries the registry-declared caveat unconditionally', () => {
  // Every other surface in this product says TARS is registry-declared, not gateway-observed. A
  // sales artifact is the last place that caveat should quietly disappear.
  const row = buildOutcomeRow('setup_guide', tars(17, 7, 2))
  assert.match(row.caveat!, /REGISTRY-DECLARED/i)
  assert.match(row.provenance, /tars-query/)
  assert.equal(row.adoptionRate, 0.412)
  assert.equal(row.retentionRate, 0.286)
})

test('an UNREADABLE funnel is reported as unavailable, never as a zeroed funnel', () => {
  const row = buildOutcomeRow('setup_guide', null)
  assert.equal(row.tars, null)
  assert.equal(row.adoptionRate, null)
  assert.match(row.caveat!, /not as zero/i)
})

test('a genuinely empty funnel keeps its real zeros and does not become null', () => {
  // The other direction: a feature that was targeted and adopted by nobody is a real, reportable
  // finding. Nulling it out would hide a true negative.
  const row = buildOutcomeRow('unused_feature', tars(40, 0, 0))
  assert.deepEqual(row.tars, tars(40, 0, 0))
  assert.equal(row.adoptionRate, 0, '0 adopted of 40 targeted is a real zero')
  assert.equal(row.retentionRate, null, 'but retention over zero adopters is not measurable')
})

test('a North-Star metric with NO recorded value says so, rather than reporting zero', () => {
  const s = buildOutcomeSection({
    tenant: 'miyagisanchez',
    features: [],
    northStar: { metric: 'activated merchants', inputCount: 2, latestValue: null },
  })
  assert.equal(s.northStar!.latestValue, null)
  assert.match(s.northStar!.caveat!, /no value has been recorded/i)
})

test('a North-Star metric WITH a value carries no apologetic caveat', () => {
  const s = buildOutcomeSection({
    tenant: 'miyagisanchez',
    features: [],
    northStar: { metric: 'activated merchants', inputCount: 2, latestValue: 12 },
  })
  assert.equal(s.northStar!.latestValue, 12)
  assert.equal(s.northStar!.caveat, undefined)
})

test('the section always carries its not-instrumented gaps, each with a guardrail', () => {
  const s = buildOutcomeSection({ tenant: 'x', features: [] })
  assert.equal(s.notInstrumented.length, OUTCOME_NOT_INSTRUMENTED.length)
  for (const row of s.notInstrumented) {
    assert.ok(row.reason.length > 30, `${row.key} needs a real reason`)
    assert.ok(row.guardrail.length > 15, `${row.key} must name what would fix it`)
  }
  // Revenue attribution is the headline gap and must be named explicitly — the epic's
  // Medusa-truth boundary means it can never be filled by replicating commerce data.
  const revenue = s.notInstrumented.find((r) => r.key === 'revenue_per_feature')!
  assert.match(revenue.reason, /never a commerce replica/i)
})

test('a tenant with no registered features yields an empty row list, not an invented one', () => {
  const s = buildOutcomeSection({ tenant: 'quiet-tenant', features: [], northStar: null })
  assert.deepEqual(s.rows, [])
  assert.equal(s.northStar, null)
  assert.equal(s.tenant, 'quiet-tenant')
})

test('the section is deterministic for the same input', () => {
  const input = {
    tenant: 'miyagisanchez',
    features: [{ key: 'setup_guide', tars: tars(17, 7, 2) }],
    northStar: { metric: 'm', inputCount: 2, latestValue: null },
  }
  assert.equal(JSON.stringify(buildOutcomeSection(input)), JSON.stringify(buildOutcomeSection(input)))
})

test('a NEGATIVE numerator yields null — a malformed count must not render as a real rate', () => {
  // Counts of people cannot be negative, so a negative value means something upstream is broken.
  // `-0.2` would render as a plausible-looking rate instead of announcing the problem.
  assert.equal(rate(-1, 5), null)
  assert.equal(rate(-0.5, 10), null)
  assert.equal(rate(0, 5), 0, 'a real zero is still a real zero')
})

// ── Cross-review fix (Agy, PR #33) — "could not read" is a THIRD state ────────────────────────

test('unavailable defaults to false — an absent flag means "we looked and there was nothing"', () => {
  const s = buildOutcomeSection({ tenant: 'quiet-tenant', features: [] })
  assert.equal(s.unavailable, false)
  assert.deepEqual(s.rows, [])
})

test('unavailable is distinguishable from an empty registry, which is the whole point', () => {
  // Both produce zero rows. Only one of them is an incident. Before this flag existed, a failed
  // feature query rendered as "no features are registered, so there is no adoption to read" — a
  // truthful-sounding sales sentence generated by a database outage.
  const empty = buildOutcomeSection({ tenant: 't', features: [] })
  const broken = buildOutcomeSection({ tenant: 't', features: [], unavailable: true })
  assert.equal(empty.rows.length, broken.rows.length)
  assert.notEqual(empty.unavailable, broken.unavailable)
})

test('a null North-Star input count survives as null and is never coerced to zero', () => {
  const s = buildOutcomeSection({
    tenant: 't',
    features: [],
    northStar: { metric: 'gmv', inputCount: null, latestValue: null },
  })
  assert.equal(s.northStar!.inputCount, null)
  // And a genuine zero stays a genuine zero — the distinction is worthless in one direction only.
  const zero = buildOutcomeSection({
    tenant: 't',
    features: [],
    northStar: { metric: 'gmv', inputCount: 0, latestValue: null },
  })
  assert.equal(zero.northStar!.inputCount, 0)
})
