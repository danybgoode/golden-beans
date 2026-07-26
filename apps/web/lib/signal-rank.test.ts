// signals-loop · Story 1.0 — pinning the impact-ranking formula and its clock-skew clamp.
//
// The scope doc fixes the formula as "users affected × frequency, decayed by recency" and calls
// out two properties that are easy to lose in a refactor: the decay must never let a FUTURE
// `lastSeenAt` (clock skew on a client-supplied timestamp) push a signal's weight above 1 and
// rocket it to the top of the queue, and the persisted rank must be rounded to a fixed number of
// decimals so re-evaluating an untouched signal microseconds apart doesn't silently reorder the
// list — "deterministic on rerun" failing in the way that's hardest to notice.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  impactScore,
  recencyWeight,
  impactRank,
  RANK_HALF_LIFE_HOURS,
  MIN_RECENCY_WEIGHT,
} from './signal-rank.ts'

test('impactScore is literally usersAffected * eventCount', () => {
  assert.equal(impactScore(10, 5), 50)
  assert.equal(impactScore(0, 100), 0)
  assert.equal(impactScore(3, 0), 0)
})

test('impactScore coerces negative, NaN, Infinity, and fractional inputs safely', () => {
  assert.equal(impactScore(-5, 10), 0)
  assert.equal(impactScore(10, -5), 0)
  assert.equal(impactScore(NaN, 10), 0)
  assert.equal(impactScore(10, NaN), 0)
  assert.ok(Number.isFinite(impactScore(Infinity, 10)))
  assert.ok(!Number.isNaN(impactScore(Infinity, 10)))
  assert.ok(Number.isFinite(impactScore(10, Infinity)))
  assert.equal(impactScore(3.7, 2.2), 3 * 2) // truncated, not rounded
})

test('recencyWeight is exactly 1.0 at age 0', () => {
  const now = new Date('2026-07-24T12:00:00.000Z')
  assert.equal(recencyWeight(now, now), 1)
})

test('recencyWeight is exactly 0.5 at one half-life', () => {
  const now = new Date('2026-07-24T12:00:00.000Z')
  const lastSeenAt = new Date(now.getTime() - RANK_HALF_LIFE_HOURS * 3_600_000)
  assert.equal(recencyWeight(lastSeenAt, now), 0.5)
})

test('recencyWeight never exceeds 1 for a FUTURE lastSeenAt (clock-skew clamp)', () => {
  const now = new Date('2026-07-24T12:00:00.000Z')
  const future = new Date(now.getTime() + 3_600_000) // 1 hour in the future
  assert.equal(recencyWeight(future, now), 1)
  const farFuture = new Date(now.getTime() + 1000 * 3_600_000)
  assert.equal(recencyWeight(farFuture, now), 1)
})

test('recencyWeight never drops below MIN_RECENCY_WEIGHT however old the signal is', () => {
  const now = new Date('2026-07-24T12:00:00.000Z')
  const veryOld = new Date(now.getTime() - 1000 * RANK_HALF_LIFE_HOURS * 3_600_000)
  const weight = recencyWeight(veryOld, now)
  assert.ok(weight >= MIN_RECENCY_WEIGHT)
  assert.equal(weight, MIN_RECENCY_WEIGHT)
})

test('impactRank is deterministic for the same inputs', () => {
  const input = {
    usersAffected: 40,
    eventCount: 200,
    lastSeenAt: new Date('2026-07-20T00:00:00.000Z'),
    now: new Date('2026-07-24T00:00:00.000Z'),
  }
  assert.equal(impactRank(input), impactRank({ ...input }))
})

test('impactRank is monotonically non-increasing as lastSeenAt gets older, all else fixed', () => {
  const now = new Date('2026-07-24T00:00:00.000Z')
  const ages = [0, 6, 24, 72, 200, 1000] // hours before `now`
  let previous = Infinity
  for (const hours of ages) {
    const rank = impactRank({
      usersAffected: 40,
      eventCount: 200,
      lastSeenAt: new Date(now.getTime() - hours * 3_600_000),
      now,
    })
    assert.ok(rank <= previous, `rank at age ${hours}h (${rank}) should be <= previous (${previous})`)
    previous = rank
  }
})

// IEEE754 binary floats can't represent every 4-decimal value exactly (77.4728 * 10000 is
// 774728.0000000001, not 774728), so the rounding property is "within float epsilon of an
// integer", not `Number.isInteger` — which would fail on rank values that are, in fact, correctly
// rounded to 4 decimal places.
function isRoundedToFourDecimals(rank: number): boolean {
  const scaled = rank * 10_000
  return Math.abs(scaled - Math.round(scaled)) < 1e-6
}

test('impactRank is rounded to at most 4 decimal places', () => {
  const rank = impactRank({
    usersAffected: 7,
    eventCount: 13,
    lastSeenAt: new Date('2026-07-23T07:17:00.000Z'),
    now: new Date('2026-07-24T00:00:00.000Z'),
  })
  assert.ok(isRoundedToFourDecimals(rank), `${rank} * 10000 should be an integer, within float epsilon`)
})

test('impactRank rounding property holds across a spread of inputs, not just one lucky case', () => {
  const now = new Date('2026-07-24T00:00:00.000Z')
  const cases = [
    { usersAffected: 1, eventCount: 1, lastSeenAt: new Date(now.getTime() - 1_000) },
    { usersAffected: 999, eventCount: 1234, lastSeenAt: new Date(now.getTime() - 3_600_000) },
    { usersAffected: 5, eventCount: 5, lastSeenAt: new Date(now.getTime() - 50 * 3_600_000) },
  ]
  for (const c of cases) {
    const rank = impactRank({ ...c, now })
    assert.ok(isRoundedToFourDecimals(rank), `${rank} should round to <= 4 decimals`)
  }
})
