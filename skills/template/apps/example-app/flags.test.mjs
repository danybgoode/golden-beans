// flags.test.mjs — the fail-soft contract, proven rather than asserted.
//
// The epic that shipped this file has a Definition-of-Done line that reads: "**A Golden outage does
// not break a build or a test run** — proven by a test, not asserted." This is that test. It runs
// with NO `node_modules` present, which is the most complete outage available: the flag provider
// package does not exist at all.
//
// Every case below was observed failing once, via a deliberate mutation of flags.mjs, before being
// committed.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createFlags, flagConfigFromEnv } from './flags.mjs';
import { ENV_KEYS } from '../../scripts/lib/golden-onboarding.mjs';

const CONFIGURED = {
  [ENV_KEYS.url]: 'https://goldenfrijoles.com',
  [ENV_KEYS.flagRead]: 'gf_flagread_test',
  [ENV_KEYS.environment]: 'development',
};

/** A provider stub shaped like the SDK's, so these tests never touch the network. */
function stubSdk(overrides = {}) {
  return async () => ({
    createFlagProvider: () => ({
      initialize: async () => ({ ok: true, changed: true, notModified: false, snapshotVersion: 3 }),
      resolveBooleanEvaluation: (key, fallback) => ({ value: key === 'demo.hello_enabled' ? true : fallback }),
      resolveStringEvaluation: (key, fallback) => ({ value: fallback }),
      resolveNumberEvaluation: (key, fallback) => ({ value: fallback }),
      resolveObjectEvaluation: (key, fallback) => ({ value: fallback }),
      getStatus: () => ({ state: 'READY', snapshotVersion: 3 }),
      shutdown: () => {},
      ...overrides,
    }),
  });
}

const quiet = () => {};

// ── configuration ─────────────────────────────────────────────────────────────────────────────

test('flagConfigFromEnv: names exactly what is missing, and passes a configured environment through', () => {
  assert.deepEqual(flagConfigFromEnv({}).missing, [ENV_KEYS.url, ENV_KEYS.flagRead]);
  const ok = flagConfigFromEnv(CONFIGURED);
  assert.equal(ok.ok, true);
  assert.equal(ok.config.environment, 'development');
  assert.equal(ok.asserted, true);
});

test('flagConfigFromEnv: an UNSET environment is OMITTED, never guessed', () => {
  // Found in review. The SDK treats `environment` as a hard assertion and REJECTS a snapshot that
  // disagrees — so guessing `development` on the CI path (URL + key from secrets, environment not)
  // made a valid production key serve compile defaults permanently and silently.
  for (const value of ['', '   ', undefined]) {
    const result = flagConfigFromEnv({ ...CONFIGURED, [ENV_KEYS.environment]: value });
    assert.equal(result.ok, true);
    assert.ok(!('environment' in result.config), `environment must be absent, not guessed (got ${JSON.stringify(result.config.environment)})`);
    assert.equal(result.asserted, false);
  }
});

test('the provider is constructed with exactly the config flagConfigFromEnv produced', async () => {
  let seen = null;
  const flags = createFlags({
    env: { ...CONFIGURED, [ENV_KEYS.environment]: '' },
    loadSdk: async () => ({
      createFlagProvider: (config) => {
        seen = config;
        return {
          initialize: async () => ({ ok: true, snapshotVersion: 1 }),
          resolveBooleanEvaluation: (k, f) => ({ value: f }),
          getStatus: () => ({ state: 'READY' }),
          shutdown: () => {},
        };
      },
    }),
    log: quiet,
  });
  await flags.initialize();
  assert.ok(!('environment' in seen), 'no invented assertion reaches the SDK');
  assert.equal(seen.baseUrl, CONFIGURED[ENV_KEYS.url]);
});

test('flagConfigFromEnv: a blank credential is absent, not an empty credential', () => {
  const result = flagConfigFromEnv({ ...CONFIGURED, [ENV_KEYS.flagRead]: '   ' });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missing, [ENV_KEYS.flagRead]);
});

// ── the happy path ────────────────────────────────────────────────────────────────────────────

test('a configured provider resolves the served value', async () => {
  const flags = createFlags({ env: CONFIGURED, loadSdk: stubSdk(), log: quiet });
  const init = await flags.initialize();
  assert.equal(init.ready, true);
  assert.equal(flags.isEnabled('demo.hello_enabled', false), true, 'served value, not the fallback');
  assert.equal(flags.isEnabled('something.else', false), false, 'unknown flags fall back');
  assert.equal(flags.status().ready, true);
  flags.shutdown();
});

// ── D1: every shape of outage returns the call-site default, and none of them throw ───────────

test('NO configuration: initialize resolves not-ready, and reads return their fallback', async () => {
  const flags = createFlags({ env: {}, loadSdk: stubSdk(), log: quiet });
  const init = await flags.initialize();
  assert.equal(init.ready, false);
  assert.match(init.reason, new RegExp(ENV_KEYS.flagRead));
  assert.equal(flags.isEnabled('checkout.stripe_enabled', true), true, 'a kill-switch stays armed');
  assert.equal(flags.isEnabled('checkout.new_ui_enabled', false), false, 'an enablement stays dark');
});

test('THE SDK IS NOT INSTALLED: the module still loads and every read falls back', async () => {
  const flags = createFlags({
    env: CONFIGURED,
    loadSdk: async () => {
      throw new Error("Cannot find package '@golden-frijoles/sdk'");
    },
    log: quiet,
  });
  const init = await flags.initialize();
  assert.equal(init.ready, false);
  assert.equal(flags.isEnabled('demo.hello_enabled', true), true);
  assert.equal(flags.status().ready, false);
});

test('THE SNAPSHOT IS UNREACHABLE at startup: not ready, still no throw, provider KEPT', async () => {
  const flags = createFlags({
    env: CONFIGURED,
    loadSdk: stubSdk({ initialize: async () => ({ ok: false, errorCode: 'GENERAL', errorMessage: 'network' }) }),
    log: quiet,
  });
  const init = await flags.initialize();
  assert.equal(init.ready, false);
  // The provider refreshes on its own timer, so a cold start that failed must not become permanent:
  // the stub still answers, which is only possible if the provider was not discarded.
  assert.equal(flags.isEnabled('demo.hello_enabled', false), true);
});

test('status(): ready reflects the SDK state, never merely that a provider was constructed', async () => {
  // Found at step 4 of this epic's smoke walkthrough: with Golden pointed at a dead host the
  // endpoint served `ready: true` beside `state: 'NOT_READY'` in one object.
  const flags = createFlags({
    env: CONFIGURED,
    loadSdk: stubSdk({
      initialize: async () => ({ ok: false, errorCode: 'GENERAL', errorMessage: 'network' }),
      getStatus: () => ({ state: 'NOT_READY' }),
    }),
    log: quiet,
  });
  await flags.initialize();
  const status = flags.status();
  assert.equal(status.ready, false);
  assert.equal(status.state, 'NOT_READY');
  assert.ok(status.degraded, 'and it says why');
});

test('A THROWING PROVIDER: a read that explodes still returns the call-site default', async () => {
  const flags = createFlags({
    env: CONFIGURED,
    loadSdk: stubSdk({
      resolveBooleanEvaluation: () => {
        throw new Error('boom');
      },
    }),
    log: quiet,
  });
  await flags.initialize();
  assert.equal(flags.isEnabled('demo.hello_enabled', false), false);
  assert.equal(flags.isEnabled('demo.hello_enabled', true), true);
});

test('reads before initialize() return the fallback rather than throwing', () => {
  const flags = createFlags({ env: CONFIGURED, loadSdk: stubSdk(), log: quiet });
  assert.equal(flags.isEnabled('demo.hello_enabled', false), false);
  assert.equal(flags.status().ready, false);
});

// ── the caller-supplied default is REQUIRED — the rule that keeps a parallel store from forming ─

test('isEnabled without an explicit boolean fallback is a caller error, loudly', () => {
  const flags = createFlags({ env: {}, loadSdk: stubSdk(), log: quiet });
  assert.throws(() => flags.isEnabled('demo.hello_enabled'), /explicit boolean fallback/);
  assert.throws(() => flags.isEnabled('demo.hello_enabled', 'true'), /explicit boolean fallback/);
});

test('value(): string, number and object flags carry the same fallback contract', async () => {
  const flags = createFlags({ env: CONFIGURED, loadSdk: stubSdk(), log: quiet });
  await flags.initialize();
  assert.equal(flags.value('copy.banner', 'hello'), 'hello');
  assert.equal(flags.value('retries.max', 3), 3);
  assert.deepEqual(flags.value('layout.config', { a: 1 }), { a: 1 });
});

test('shutdown() is safe with no provider, and twice', async () => {
  const flags = createFlags({ env: {}, loadSdk: stubSdk(), log: quiet });
  await flags.initialize();
  flags.shutdown();
  flags.shutdown();
  assert.equal(flags.isEnabled('x', true), true);
});

test('the degraded notice names the missing variables and never the credential value', async () => {
  const lines = [];
  const flags = createFlags({ env: {}, loadSdk: stubSdk(), log: (l) => lines.push(l) });
  await flags.initialize();
  assert.equal(lines.length, 1, 'one line, not a stack trace');
  assert.match(lines[0], /^\[flags\] /);
  const withKey = [];
  const configured = createFlags({
    env: { ...CONFIGURED, [ENV_KEYS.flagRead]: 'gf_flagread_super_secret' },
    loadSdk: async () => {
      throw new Error('nope');
    },
    log: (l) => withKey.push(l),
  });
  await configured.initialize();
  assert.ok(!withKey.join('\n').includes('gf_flagread_super_secret'));
});
