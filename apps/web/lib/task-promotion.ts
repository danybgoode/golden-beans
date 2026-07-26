// signals-loop · Sprint 2, Story 2.1 — when a signal becomes a task. ZERO imports, so every
// threshold branch is reachable from a unit test without a database.
//
// ── Why promotion is a threshold and not "every signal is a task" ────────────────────────────
// A signal is a problem the engine noticed. A task is a problem the engine is asking someone to
// FIX. Promoting every signal collapses that distinction and hands an agent a queue containing one
// user's transient network blip alongside a crash affecting four hundred people — at which point
// the ranking carries the entire burden of being useful, and a queue you have to sort before you
// can trust it is a log with extra steps.
//
// The thresholds live here as defaults and in `task_promotion_rules` as per-project overrides, for
// the same reason friction rules do: tuning must be an UPDATE, never a deploy.

export type PromotionRule = {
  /** Minimum distinct users affected before a signal is worth anyone's time. */
  minUsersAffected: number
  /** Minimum occurrences. A one-off that hit many users still counts — see the OR below. */
  minEventCount: number
  /** Signals below this impact score never promote, whatever the two counts say. */
  minImpactScore: number
}

/**
 * No error affecting exactly ONE user is ever a task, however many times it fired.
 *
 * ── This constant exists because the module was wrong and its own comment caught it ──────────
 * The first version relied on `minImpactScore` to block "one user's 40-retry loop", which the
 * prose below cites as the case the floor must stop. It did not: the floor is a PRODUCT, so
 * 1 × 40 = 40 sails past a threshold of 15, the `eventCount` arm of the OR then fires, and the
 * signal promotes. One user with 1,000 retries promoted too. The comment asserted a check the code
 * did not perform — the failure Roadmap/LEARNINGS.md rates as worse than no comment, because a
 * reviewer who reads a stated rationale spends their scrutiny elsewhere. Found by a builder agent
 * running the documented case as a test instead of trusting the sentence, and confirmed
 * independently before being fixed.
 *
 * A product floor cannot express "affects more than one person", because frequency substitutes for
 * reach inside it — which is exactly the substitution a retry loop exploits. The plurality
 * requirement has to be its own gate.
 *
 * Deliberately 2 and not `minUsersAffected`: this is a different question. `minUsersAffected` asks
 * "is this big enough to jump the queue on reach alone?"; this asks "is this a shared problem at
 * all?" A tenant tuning the former down to 1 should still not receive single-user retry noise.
 */
export const MIN_DISTINCT_USERS_FOR_ERROR = 2

/**
 * Deliberately conservative, and conservative in a specific direction: it is much worse to fill an
 * agent's queue with noise than to be slow promoting a real problem, because the second failure is
 * visible (someone asks "why isn't this a task?") and the first one is not — people just quietly
 * stop reading the queue.
 */
export const DEFAULT_PROMOTION_RULE: PromotionRule = Object.freeze({
  minUsersAffected: 3,
  minEventCount: 5,
  minImpactScore: 15,
})

export type PromotionCandidate = {
  usersAffected: number
  eventCount: number
  kind: 'error' | 'friction'
}

/**
 * Does this signal deserve a task?
 *
 * The two count thresholds are an **OR**, gated by the impact floor. That shape is the whole
 * design decision, and the alternatives are both wrong:
 *
 * - AND would miss a crash that hit 200 users exactly once each (a bad deploy, rolled back), which
 *   is precisely the highest-impact shape there is.
 * - Either count alone would promote one user's 40-retry loop, which is one person's afternoon.
 *
 * `minImpactScore` is what keeps the OR honest: users × frequency must still clear a floor, so a
 * signal qualifying on one dimension has to be genuinely large on it.
 */
export function shouldPromote(candidate: PromotionCandidate, rule: PromotionRule): boolean {
  const users = Math.max(0, Math.trunc(candidate.usersAffected))
  const events = Math.max(0, Math.trunc(candidate.eventCount))

  // Friction is DERIVED from a funnel aggregate that already applied its own `minSample` floor, so
  // it carries no per-user attribution (users_affected is 0 by construction — see friction-eval).
  // Applying a user threshold here would mean no friction signal could ever promote, which would
  // silently delete half the epic's value. The floor that matters for friction was enforced when
  // the finding was produced.
  if (candidate.kind === 'friction') return true

  // The plurality gate, FIRST — it is the one the product floor cannot express. See
  // MIN_DISTINCT_USERS_FOR_ERROR: a single user's retry loop otherwise clears a product floor on
  // frequency alone and promotes, which is the noise this whole threshold exists to keep out.
  if (users < MIN_DISTINCT_USERS_FOR_ERROR) return false

  if (users * events < rule.minImpactScore) return false
  return users >= rule.minUsersAffected || events >= rule.minEventCount
}
