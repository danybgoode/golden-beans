// Unit layer for the notification policy.
//
// The property worth pinning is the one whose absence cost 100+ pings to Daniel's phone: a
// notification addressed to a human must not originate from a test run, a local server, or a
// preview deployment — REGARDLESS of whether real credentials happen to be present. Credentials
// being set is what everyone (including the reviewed code) treated as the gate, and it is exactly
// the condition that was true in the environment that misfired.
//
// Asserted in both directions throughout: it blocks when it should, and it does NOT block a real
// production send, because a policy that suppressed everything would pass every "does it block?"
// test while silently deleting the feature.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { shouldSendOperatorNotification, isTaskAlertEnabled } from './notify-policy.ts'

/** A fully-configured PRODUCTION environment — the only shape that may send. */
const PROD = {
  TELEGRAM_BOT_TOKEN: 'bot-token',
  TELEGRAM_CHAT_ID: 'chat-id',
  VERCEL_ENV: 'production',
}

test('a real production runtime with credentials SENDS', () => {
  // The control. Without it, a policy that returned false unconditionally would pass everything else.
  assert.deepEqual(shouldSendOperatorNotification(PROD), { send: true, reason: null })
})

test('missing credentials → no send, reported as unconfigured', () => {
  assert.equal(shouldSendOperatorNotification({ VERCEL_ENV: 'production' }).reason, 'unconfigured')
  assert.equal(
    shouldSendOperatorNotification({ ...PROD, TELEGRAM_CHAT_ID: undefined }).reason,
    'unconfigured'
  )
  assert.equal(
    shouldSendOperatorNotification({ ...PROD, TELEGRAM_BOT_TOKEN: undefined }).reason,
    'unconfigured'
  )
})

// ── The incident, encoded ──────────────────────────────────────────────────────────────────────

test('THE REGRESSION TEST: fully-credentialled local spec run does NOT send', () => {
  // This is the exact environment that pinged Daniel 100+ times: `.env.local` supplies real
  // credentials, Playwright loads it into the app under test, and there is no VERCEL_ENV.
  const localSpecRun = {
    TELEGRAM_BOT_TOKEN: 'real-token',
    TELEGRAM_CHAT_ID: 'real-chat',
    NODE_ENV: 'test',
  }
  const decision = shouldSendOperatorNotification(localSpecRun)
  assert.equal(decision.send, false)
  assert.equal(decision.reason, 'test_runtime')
})

test('NODE_ENV=test beats a production-looking env — ordering is load-bearing', () => {
  // A spec suite pointed at a production-shaped environment is precisely the combination that
  // caused the incident, so "am I a test?" must not be overridable by "but the env says production".
  const decision = shouldSendOperatorNotification({ ...PROD, NODE_ENV: 'test' })
  assert.equal(decision.send, false)
  assert.equal(decision.reason, 'test_runtime')
})

test('a local dev server (no VERCEL_ENV) does not send, even fully credentialled', () => {
  const decision = shouldSendOperatorNotification({
    TELEGRAM_BOT_TOKEN: 't',
    TELEGRAM_CHAT_ID: 'c',
    NODE_ENV: 'development',
  })
  assert.equal(decision.send, false)
  assert.equal(decision.reason, 'not_production')
})

test('a PREVIEW deployment does not send — one check covers local, CI and preview', () => {
  const decision = shouldSendOperatorNotification({ ...PROD, VERCEL_ENV: 'preview' })
  assert.equal(decision.send, false)
  assert.equal(decision.reason, 'not_production')
})

test('the escape hatch is opt-in, exact-match, and cannot be tripped by a typo', () => {
  const local = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' }
  assert.equal(
    shouldSendOperatorNotification({ ...local, ALLOW_NOTIFY_OUTSIDE_PRODUCTION: 'true' }).send,
    true
  )
  // Anything but the exact string 'true' stays off — the same `=== 'true'` contract every gate in
  // lib/flags.ts follows, because a gate that opens on a truthy value opens on a typo.
  for (const v of ['TRUE', '1', 'yes', 'false', '', ' true']) {
    assert.equal(
      shouldSendOperatorNotification({ ...local, ALLOW_NOTIFY_OUTSIDE_PRODUCTION: v }).send,
      false,
      `ALLOW_NOTIFY_OUTSIDE_PRODUCTION=${JSON.stringify(v)} must not open the gate`
    )
  }
})

test('the escape hatch does NOT work on a deployed environment, only a local one', () => {
  // Cross-review finding (Codex, PR #38): the hatch was checked before the production gate, so a
  // PREVIEW deployment with the variable set could page a human — contradicting this module's own
  // stated boundary. A deployed environment always carries VERCEL_ENV; a laptop never does.
  const withHatch = {
    TELEGRAM_BOT_TOKEN: 't',
    TELEGRAM_CHAT_ID: 'c',
    ALLOW_NOTIFY_OUTSIDE_PRODUCTION: 'true',
  }
  assert.equal(shouldSendOperatorNotification({ ...withHatch, VERCEL_ENV: 'preview' }).send, false)
  assert.equal(shouldSendOperatorNotification({ ...withHatch, VERCEL_ENV: 'development' }).send, false)
  // ...and it still works where it is meant to: a local shell, with no VERCEL_ENV at all.
  assert.equal(shouldSendOperatorNotification(withHatch).send, true)
})

test('the escape hatch still cannot rescue a TEST runtime', () => {
  // Otherwise a spec that sets it would reintroduce the incident wholesale.
  const decision = shouldSendOperatorNotification({
    TELEGRAM_BOT_TOKEN: 't',
    TELEGRAM_CHAT_ID: 'c',
    NODE_ENV: 'test',
    ALLOW_NOTIFY_OUTSIDE_PRODUCTION: 'true',
  })
  assert.equal(decision.send, false)
  assert.equal(decision.reason, 'test_runtime')
})

// ── The alert's own switch ─────────────────────────────────────────────────────────────────────

test('the first-task alert is born OFF', () => {
  assert.equal(isTaskAlertEnabled({}), false)
  assert.equal(isTaskAlertEnabled({ TASK_ALERTS_ENABLED: undefined }), false)
})

test('the first-task alert opens ONLY on the exact string "true"', () => {
  assert.equal(isTaskAlertEnabled({ TASK_ALERTS_ENABLED: 'true' }), true)
  for (const v of ['TRUE', '1', 'yes', 'false', '', ' true']) {
    assert.equal(isTaskAlertEnabled({ TASK_ALERTS_ENABLED: v }), false)
  }
})

test('the two switches are INDEPENDENT — muting one alert is not muting every notification', () => {
  // Collapsing them would mean re-enabling task alerts also re-enables everything, or that muting
  // them requires muting the whole rail.
  assert.equal(shouldSendOperatorNotification(PROD).send, true)
  assert.equal(isTaskAlertEnabled(PROD), false)
})
