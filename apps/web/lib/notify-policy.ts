// Who is allowed to be interrupted, and from where.
//
// ── The incident this exists because of (2026-07-26) ───────────────────────────────────────────
// Daniel received 100+ Telegram pings reading "First signals-loop task created for
// spec-write-<random>". Nothing was broken in the sense the code was reviewed for: the first-task
// notification (Amendment 4.4) fires exactly once per PROJECT, and cross-review had already
// hardened it against the race where two concurrent promotions both decline to send.
//
// The flaw was one level up, in an assumption nobody wrote down: **"once per project" is only a
// bound if projects are scarce.** The e2e specs create a disposable tenant per test — 21 in the
// write-tools spec alone — and every one of them is a real project that legitimately produces its
// real first task. Multiply by a development session's worth of runs and the rail behaves exactly
// as specified while making itself useless.
//
// What actually delivered them was the second half: `apps/web/.env.local` carries real
// TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID (needed by other tooling), and Playwright's config loads
// `.env.local` into the app under test. So a local spec run held production notification
// credentials and used them.
//
// ── Why the guard goes HERE and not in the first-task function ─────────────────────────────────
// Fixing `maybeNotifyFirstTask` would fix the one caller that has already misfired and leave the
// next one to rediscover this. The property that was actually missing is global: *a notification
// addressed to a human must not originate from a test run, a local server, or a preview
// deployment.* That belongs at the boundary every notification crosses.
//
// ── Why this file has ZERO imports ─────────────────────────────────────────────────────────────
// The lib/flags.ts precedent (Roadmap/LEARNINGS.md): a pure decision living beside `server-only`
// code cannot be unit-tested, because a generic test runner throws on the framework import before
// reaching the function. The decision is pure and gets asserted directly; lib/telegram.ts imports
// it.

export type NotifyEnv = {
  TELEGRAM_BOT_TOKEN?: string
  TELEGRAM_CHAT_ID?: string
  VERCEL_ENV?: string
  NODE_ENV?: string
  TASK_ALERTS_ENABLED?: string
  ALLOW_NOTIFY_OUTSIDE_PRODUCTION?: string
}

export type NotifyDecision = {
  send: boolean
  /** Why not, for a log line that explains itself. Null when sending. */
  reason: 'unconfigured' | 'not_production' | 'test_runtime' | null
}

/**
 * May this runtime send a notification to a human at all?
 *
 * Fails CLOSED on anything that is not demonstrably production. That direction is deliberate: the
 * cost of a wrong "no" is a missing ping in an environment nobody is watching, and the cost of a
 * wrong "yes" is what just happened.
 *
 * `ALLOW_NOTIFY_OUTSIDE_PRODUCTION` is the escape hatch for deliberately exercising the rail from a
 * local shell. It is opt-in per invocation and never set in the repo, so it cannot be the reason a
 * spec run pings anyone — and it exists so that the honest way to test this rail is to say so, not
 * to quietly weaken the check.
 */
export function shouldSendOperatorNotification(env: NotifyEnv = process.env): NotifyDecision {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) {
    return { send: false, reason: 'unconfigured' }
  }

  // Checked BEFORE the production check, not after. A test runner sets NODE_ENV=test, and a spec
  // suite pointed at a production-shaped environment is exactly the combination that caused this.
  // Ordering it first means "am I a test?" can never be overridden by "but the env says production".
  if (env.NODE_ENV === 'test') {
    return { send: false, reason: 'test_runtime' }
  }

  if (env.ALLOW_NOTIFY_OUTSIDE_PRODUCTION === 'true') {
    return { send: true, reason: null }
  }

  // `VERCEL_ENV` is 'production' only on a production deployment — 'preview' on a preview build and
  // absent locally. So this is one check that covers local dev, CI, and preview deployments, none of
  // which have any business messaging a person.
  if (env.VERCEL_ENV !== 'production') {
    return { send: false, reason: 'not_production' }
  }

  return { send: true, reason: null }
}

/**
 * Is the per-project first-task alert switched on?
 *
 * Born OFF, like every other gate in this codebase, and OFF is what Daniel asked for after the
 * incident above. Separate from `shouldSendOperatorNotification` on purpose: that one answers "may
 * this runtime message a human", this one answers "does anyone want THIS alert". Collapsing them
 * would mean re-enabling task alerts also re-enables them everywhere, or that muting them requires
 * muting every notification the engine will ever send.
 */
export function isTaskAlertEnabled(env: NotifyEnv = process.env): boolean {
  return env.TASK_ALERTS_ENABLED === 'true'
}
