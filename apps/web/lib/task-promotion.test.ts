// signals-loop · Sprint 2, Story 2.1 — pinning the OR-gated-by-impact promotion shape, PLUS the
// plurality gate that shape needed once a real bug was found in it.
//
// The core design decision in task-promotion.ts is that the two count thresholds
// (minUsersAffected, minEventCount) are combined with OR, not AND, and that OR is gated by a
// separate `minImpactScore` floor on their product. Both halves matter independently:
//
// - Without the OR, a bad-deploy shape (200 users hit once each) would never promote, because it
//   clears the user threshold but not the event-count threshold — exactly the highest-impact shape
//   there is (module comment).
// - Without the floor, an OR on either count alone is honest only if BOTH thresholds are
//   independently meaningful; the floor is what's supposed to keep a signal that qualifies on one
//   dimension from being trivially small on the other.
//
// ── Why there is also a THIRD gate, MIN_DISTINCT_USERS_FOR_ERROR ────────────────────────────────
// The first version of this module relied on the impact floor alone to block "one user's 40-retry
// loop" (its own doc comment's stated reason for the floor's existence). It didn't: the floor is a
// PRODUCT, so 1 user x 40 events = 40 sails past a floor of 15, eventCount alone then clears
// minEventCount via the OR, and the signal promoted — the opposite of the documented intent. A
// product floor cannot express "affects more than one person", because frequency substitutes for
// reach inside it, which is exactly what a retry loop exploits. `MIN_DISTINCT_USERS_FOR_ERROR` is a
// separate, non-tunable-by-rule plurality check, applied BEFORE the impact floor, for exactly that
// reason: a tenant tuning `minUsersAffected` down to 1 must not reopen the retry-loop hole, because
// that constant answers "is this a shared problem at all?", a different question from "is this big
// enough on reach alone?" answered by the tunable threshold.
//
// So this file pins: the plurality gate directly (including its independence from the tunable
// rule), all four OR/impact-floor quadrants, the unconditional `kind: 'friction'` bypass (friction
// carries usersAffected: 0 by construction — a plurality or user-count floor applied to it would
// make it unpromotable), and the input coercion that keeps the function total (never throws) over
// negative/fractional/NaN signal data.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  shouldPromote,
  DEFAULT_PROMOTION_RULE,
  MIN_DISTINCT_USERS_FOR_ERROR,
  type PromotionRule,
  type PromotionCandidate,
} from './task-promotion.ts'

// ── The plurality gate: frequency can never substitute for reach ────────────────────────────────

test("one user's 40-retry loop does NOT promote against DEFAULT_PROMOTION_RULE", () => {
  // This is the exact case the module's OR-honesty comment cites, and the case that a builder
  // agent found the ORIGINAL code got wrong (users*events=40 sailed past a floor of 15). Now gated
  // by MIN_DISTINCT_USERS_FOR_ERROR before the floor is even consulted.
  const candidate: PromotionCandidate = { usersAffected: 1, eventCount: 40, kind: 'error' }
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), false)
})

test("one user's 1000-retry loop STILL does NOT promote — frequency can never substitute for reach", () => {
  // The extreme case. If any amount of frequency could clear the gate, it would just be the old
  // product-floor bug with a higher ceiling. It cannot: the gate is on distinct users, not events.
  const candidate: PromotionCandidate = { usersAffected: 1, eventCount: 1000, kind: 'error' }
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), false)
})

test('a bad deploy: 200 users hit it once each STILL promotes — the plurality gate is not a blanket reject', () => {
  // The counter-test that keeps the fix honest: the gate must block a lone user's noise without
  // also blocking the highest-impact shape there is. Both directions matter, or "fixed" could mean
  // "rejects everything".
  const candidate: PromotionCandidate = { usersAffected: 200, eventCount: 1, kind: 'error' }
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), true)
})

test('kind: friction is UNAFFECTED by the plurality gate, even at usersAffected 0', () => {
  // Friction carries usersAffected 0 by construction (see the friction-bypass test below). If the
  // new gate applied to friction, no friction signal could ever promote — that is the regression
  // this fix could most plausibly have introduced, so it is pinned here too, not just below.
  const candidate: PromotionCandidate = { usersAffected: 0, eventCount: 0, kind: 'friction' }
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), true)
})

test('the plurality gate is INDEPENDENT of minUsersAffected — tuning the rule down cannot reopen the hole', () => {
  // MIN_DISTINCT_USERS_FOR_ERROR answers "is this a shared problem at all?", a different question
  // from the tunable minUsersAffected's "is this big enough on reach alone?". A rule that sets
  // minUsersAffected to 1 (or even 0) must not let a 1-user error back in.
  const looseRule: PromotionRule = { minUsersAffected: 1, minEventCount: 1, minImpactScore: 0 }
  const candidate: PromotionCandidate = { usersAffected: 1, eventCount: 100, kind: 'error' }
  assert.equal(shouldPromote(candidate, looseRule), false)
})

test('MIN_DISTINCT_USERS_FOR_ERROR is pinned at 2', () => {
  assert.equal(MIN_DISTINCT_USERS_FOR_ERROR, 2)
})

// ── The OR-gated-by-impact shape, isolated one quadrant at a time ───────────────────────────────
// A rule where minUsersAffected and minEventCount are far apart, so a candidate can be constructed
// to clear exactly one of them while the impact floor (users * events) is independently satisfied.

const isolationRule: PromotionRule = { minUsersAffected: 5, minEventCount: 50, minImpactScore: 20 }

test('clears minUsersAffected but not minEventCount: promotes, given the impact floor is met', () => {
  const candidate: PromotionCandidate = { usersAffected: 5, eventCount: 5, kind: 'error' }
  // impact = 25 >= 20 (floor met); users 5 >= 5 (clears); events 5 < 50 (does not clear).
  assert.equal(shouldPromote(candidate, isolationRule), true)
})

test('clears minEventCount but not minUsersAffected: promotes, given the impact floor is met', () => {
  const candidate: PromotionCandidate = { usersAffected: 2, eventCount: 50, kind: 'error' }
  // impact = 100 >= 20 (floor met); users 2 < 5 (does not clear); events 50 >= 50 (clears).
  assert.equal(shouldPromote(candidate, isolationRule), true)
})

test('clears neither count: does not promote', () => {
  const candidate: PromotionCandidate = { usersAffected: 2, eventCount: 10, kind: 'error' }
  // impact = 20, not below the floor (20 < 20 is false) — the floor itself is not what blocks this;
  // neither count threshold is cleared, and that is what blocks it.
  assert.equal(shouldPromote(candidate, isolationRule), false)
})

test('clears a count threshold but is BELOW minImpactScore: does NOT promote — the floor keeps the OR honest', () => {
  // The single most important assertion in this file: users alone clears minUsersAffected, but the
  // product is tiny, so the floor must block promotion even though the OR would otherwise fire.
  const candidate: PromotionCandidate = { usersAffected: 5, eventCount: 1, kind: 'error' }
  assert.equal(users_times_events_is_below_floor(candidate, isolationRule), true, 'test setup sanity check')
  assert.equal(shouldPromote(candidate, isolationRule), false)
})

function users_times_events_is_below_floor(candidate: PromotionCandidate, rule: PromotionRule): boolean {
  return candidate.usersAffected * candidate.eventCount < rule.minImpactScore
}

// ── kind: 'friction' always promotes, regardless of counts ───────────────────────────────────────

test('kind: friction always promotes, even with usersAffected 0 and eventCount 0', () => {
  // Friction findings are derived from a funnel aggregate that already applied its own minSample
  // floor (friction-rules.ts) — they carry no per-user attribution, so usersAffected is 0 by
  // construction. A user-count floor applied here would make every friction signal unpromotable,
  // silently deleting that half of the epic's value.
  const candidate: PromotionCandidate = { usersAffected: 0, eventCount: 0, kind: 'friction' }
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), true)
  // Also true against a much stricter rule — friction bypasses the counts entirely, not just the
  // default's particular thresholds.
  const strictRule: PromotionRule = { minUsersAffected: 1000, minEventCount: 1000, minImpactScore: 1000 }
  assert.equal(shouldPromote(candidate, strictRule), true)
})

// ── Negative / fractional / NaN inputs are coerced safely and never throw ────────────────────────

test('negative counts are coerced to 0 and do not promote', () => {
  const candidate: PromotionCandidate = { usersAffected: -5, eventCount: -10, kind: 'error' }
  assert.doesNotThrow(() => shouldPromote(candidate, DEFAULT_PROMOTION_RULE))
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), false)
})

test('fractional counts are truncated toward zero, not rounded', () => {
  // 3.9 truncates to 3 (clears minUsersAffected: 3) and 5.9 truncates to 5 (clears minEventCount: 5)
  // under DEFAULT_PROMOTION_RULE; product 3*5 = 15 is not below minImpactScore (15), so it promotes.
  // If these were rounded instead of truncated, 3.9 -> 4 and 5.9 -> 6, which would also promote —
  // so this is chosen to demonstrate truncation without being ambiguous about the two policies at
  // this exact boundary the assertion below is the one that would catch a switch to Math.round.
  const candidate: PromotionCandidate = { usersAffected: 3.9, eventCount: 4.9, kind: 'error' }
  // trunc(3.9) = 3, trunc(4.9) = 4: product 12 < 15, floor blocks — this only holds under truncation.
  // Under rounding this would be 4 and 5, product 20 >= 15, users 4 < 3 is false... to keep this
  // unambiguous we assert both the exact function output and doesNotThrow.
  assert.doesNotThrow(() => shouldPromote(candidate, DEFAULT_PROMOTION_RULE))
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), false)
})

test('NaN counts are coerced away and never throw or promote', () => {
  const candidate: PromotionCandidate = { usersAffected: NaN, eventCount: NaN, kind: 'error' }
  assert.doesNotThrow(() => shouldPromote(candidate, DEFAULT_PROMOTION_RULE))
  assert.equal(shouldPromote(candidate, DEFAULT_PROMOTION_RULE), false)
})

test('Infinity counts do not throw', () => {
  const candidate: PromotionCandidate = { usersAffected: Infinity, eventCount: 0, kind: 'error' }
  assert.doesNotThrow(() => shouldPromote(candidate, DEFAULT_PROMOTION_RULE))
})

// ── DEFAULT_PROMOTION_RULE shape ──────────────────────────────────────────────────────────────

test('DEFAULT_PROMOTION_RULE is frozen', () => {
  assert.ok(Object.isFrozen(DEFAULT_PROMOTION_RULE))
})

test('DEFAULT_PROMOTION_RULE thresholds are internally sensible', () => {
  assert.ok(DEFAULT_PROMOTION_RULE.minUsersAffected >= 1)
  assert.ok(DEFAULT_PROMOTION_RULE.minEventCount >= 1)
  assert.ok(DEFAULT_PROMOTION_RULE.minImpactScore >= 0)
  assert.ok(DEFAULT_PROMOTION_RULE.minUsersAffected >= 0)
  assert.ok(DEFAULT_PROMOTION_RULE.minEventCount >= 0)
})

// ── The NaN hole, and why the original NaN test could not see it ─────────────────────────────
// Cross-review (Agy, 2026-07-26) found that `Math.max(0, NaN)` returns NaN — Math.max propagates it
// rather than treating it as smaller — and every relational comparison against NaN is false, so a
// NaN user count sailed through BOTH the plurality gate and the impact floor.
//
// The existing NaN test could not catch it because it set BOTH fields to NaN, which made the final
// `events >= minEventCount` comparison false too: the right answer for the wrong reason. These
// tests use ONE NaN and one VALID value, which is the input that distinguishes the two
// implementations — the LEARNINGS rule about testing a helper through the input whose result
// differs, not the one that happens to agree.

test('a NaN user count with a VALID event count does not promote', () => {
  assert.equal(
    shouldPromote({ usersAffected: NaN, eventCount: 40, kind: 'error' }, DEFAULT_PROMOTION_RULE),
    false
  )
})

test('a NaN event count with a VALID user count does not promote past the floor', () => {
  assert.equal(
    shouldPromote({ usersAffected: 200, eventCount: NaN, kind: 'error' }, DEFAULT_PROMOTION_RULE),
    false
  )
})

test('a non-finite count is coerced, not passed through', () => {
  // Infinity cleared every threshold before the fix — arithmetically "true", but it is a garbage
  // input reaching a promotion decision, and a queue populated from garbage is not a queue.
  for (const bad of [Infinity, -Infinity]) {
    assert.equal(
      shouldPromote({ usersAffected: bad, eventCount: 40, kind: 'error' }, DEFAULT_PROMOTION_RULE),
      false,
      `non-finite users=${bad} promoted`
    )
    assert.equal(
      shouldPromote({ usersAffected: 200, eventCount: bad, kind: 'error' }, DEFAULT_PROMOTION_RULE),
      false,
      `non-finite events=${bad} promoted`
    )
  }
})
