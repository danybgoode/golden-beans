// event-destination-router · Sprint 2, Story 2.2 — the retry SCHEDULE. Pure and zero-import so it is
// asserted directly at the first, a middle, and the terminal attempt (Sprint QA), the same discipline
// as every other decision function in this repo: whether a 500 is retryable is a fact about HTTP
// (lib/webhook-delivery.ts decides that); HOW LONG to wait before retry N and WHEN to give up is a
// tuning decision, and a tuning decision you can't unit-test is one you can't safely change.
//
// DETERMINISTIC (no jitter). A fleet of many workers hammering one recovering receiver in lockstep
// is the thundering-herd jitter defends against — but this dispatcher is bounded (MAX_CLAIM_BATCH)
// and enumerated one project at a time, so the herd is small, and a deterministic schedule is
// testable to the millisecond. If concurrency ever grows enough to matter, add full-jitter HERE (one
// pure function, one spec) rather than smearing Math.random through the dispatcher.

// TIMING IS A FLOOR, NOT A SCHEDULE (cross-review, Codex round 9). These delays set when a delivery
// becomes ELIGIBLE again; the dispatcher only runs on the cron's cadence (*/5 in vercel.json), so the
// ACTUAL wait is `delay + up to one cron interval` of polling latency. A 30s backoff therefore means
// "eligible after 30s, attempted at the next tick" — not "retried 30s later". Anything documenting
// these numbers to a receiver must say the same (see miyagi-lifecycle-contract.md).

/** Total send attempts a delivery gets before it is declared dead. Counts the FIRST try plus retries:
 *  6 → the original attempt and five retries. */
export const MAX_ATTEMPTS = 6

/** First backoff step. Attempt 1 fails → wait BASE before attempt 2. */
export const BASE_DELAY_MS = 30_000 // 30s

/** Backoff ceiling. Exponential growth is clamped here so a long-dead receiver is still retried on a
 *  bounded cadence (hourly) rather than drifting to days between attempts. */
export const MAX_DELAY_MS = 3_600_000 // 1h

export type RetryDecision =
  /** Retry: schedule the next attempt `delayMs` from now (status → failed). */
  | { retry: true; delayMs: number }
  /** Give up: the delivery is dead (status → dead). */
  | { retry: false }

/**
 * Given how many attempts have now been made (INCLUDING the one that just failed), decide whether to
 * retry and, if so, after how long.
 *
 *   attemptsMade = 1 (first try failed) → retry after BASE (30s)
 *   attemptsMade = 2                    → retry after BASE·2 (1m)
 *   …exponential, doubling, clamped at MAX_DELAY_MS…
 *   attemptsMade >= MAX_ATTEMPTS        → dead, no further retry
 *
 * `attemptsMade` is defined as "attempts already made" rather than "the retry number" on purpose:
 * the dispatcher increments attempt_count as it settles a row, so it passes the POST-increment value
 * straight in — no off-by-one to get wrong at the call site (which is where this kind of bug hides).
 */
export function retryDecision(attemptsMade: number): RetryDecision {
  if (attemptsMade >= MAX_ATTEMPTS) return { retry: false }
  // 2^(attemptsMade-1): the first failure waits BASE, then doubles. Math.min clamps at the ceiling.
  const delayMs = Math.min(BASE_DELAY_MS * 2 ** (attemptsMade - 1), MAX_DELAY_MS)
  return { retry: true, delayMs }
}
