import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadConfig, parseDotEnv, planRun, validateConfig } from './live-smoke.mjs';

const CONFIG = validateConfig({
  appDir: 'apps/web',
  envs: { local: 'http://localhost:3000', prod: 'https://example.test' },
  flows: { admin: { identityEnv: 'TEST_ADMIN_EMAIL' } },
  auth: { requiredEnv: ['AUTH_SECRET_KEY'], forbidKeyPattern: '_live_', unsupportedEnvs: ['prod'] },
  previewBypassEnv: 'PREVIEW_BYPASS',
});

test('an absent config fails with a message naming the file — never a guessed app or URL', () => {
  assert.throws(() => loadConfig({ root: mkdtempSync(join(tmpdir(), 'live-smoke-')) }), /live-smoke\.config\.json not found/);
});

test('the template ships an example config that validates', () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const example = JSON.parse(readFileSync(join(here, '..', 'live-smoke.config.example.json'), 'utf8'));
  assert.equal(validateConfig(example).appDir, 'apps/example-app');
});

test('config shape errors name the key', () => {
  assert.throws(() => validateConfig({ envs: { local: 'http://x' } }), /"appDir"/);
  assert.throws(() => validateConfig({ appDir: 'a', envs: {} }), /"envs"/);
  assert.throws(() => validateConfig({ appDir: 'a', envs: { preview: 'http://x' } }), /reserved/);
  assert.throws(() => validateConfig({ appDir: 'a', envs: { local: 'x' } }), /envs\.local/);
  assert.throws(() => validateConfig({ appDir: 'a', envs: { local: 'http://x' }, flows: { admin: {} } }), /identityEnv/);
});

test('parseDotEnv handles export prefixes and quoted values without keeping the quotes', () => {
  assert.deepEqual(parseDotEnv('# c\nexport A="sk_test_1"\nB=\'two\'\nC=plain\nnoequals\n'), { A: 'sk_test_1', B: 'two', C: 'plain' });
});

test('an unauthed --path run resolves the default env and targets the ad-hoc spec', () => {
  const plan = planRun({ args: { path: '/' }, config: CONFIG });
  assert.equal(plan.baseURL, 'http://localhost:3000');
  assert.equal(plan.childEnv.LIVE_SMOKE_PATH, '/');
  assert.deepEqual(plan.playwrightArgs, ['playwright', 'test', '--project=browser', 'e2e/_live/ad-hoc.browser.spec.ts']);
});

test('exactly one mode, and a known flow and env, are required', () => {
  assert.match(planRun({ args: {}, config: CONFIG }).error, /pass --path/);
  assert.match(planRun({ args: { path: '/', spec: 'x' }, config: CONFIG }).error, /exactly one/);
  assert.match(planRun({ args: { path: '/', flow: 'buyer' }, config: CONFIG }).error, /unauthed\|admin/);
  assert.match(planRun({ args: { path: '/', env: 'staging' }, config: CONFIG }).error, /unknown --env "staging"/);
});

test('preview needs a URL and the configured bypass secret', () => {
  assert.match(planRun({ args: { path: '/', env: 'preview' }, config: CONFIG }).error, /--preview-url/);
  assert.match(planRun({ args: { path: '/', env: 'preview', 'preview-url': 'https://p.test' }, config: CONFIG }).error, /PREVIEW_BYPASS/);
  const ok = planRun({ args: { path: '/', env: 'preview', 'preview-url': 'https://p.test' }, config: CONFIG, env: { PREVIEW_BYPASS: 's' } });
  assert.equal(ok.childEnv.PREVIEW_BYPASS, 's');
});

test('an authed flow against an unsupported env is refused BEFORE the key check (the specific reason wins)', () => {
  const r = planRun({ args: { path: '/', flow: 'admin', env: 'prod' }, config: CONFIG });
  assert.match(r.error, /--flow=admin against --env=prod is not supported/);
});

test('an authed flow needs its keys, and PRODUCTION-looking keys are refused even locally', () => {
  assert.match(planRun({ args: { path: '/', flow: 'admin', env: 'local' }, config: CONFIG }).error, /AUTH_SECRET_KEY/);
  const live = planRun({ args: { path: '/', flow: 'admin', env: 'local' }, config: CONFIG, dotenv: { AUTH_SECRET_KEY: 'sk_live_abc' } });
  assert.match(live.error, /PRODUCTION key/);
  const ok = planRun({
    args: { path: '/', flow: 'admin', env: 'local' },
    config: CONFIG,
    dotenv: { AUTH_SECRET_KEY: 'sk_test_abc', TEST_ADMIN_EMAIL: 'admin@example.test' },
  });
  assert.equal(ok.error, undefined);
  assert.equal(ok.childEnv.TEST_ADMIN_EMAIL, 'admin@example.test');
  assert.equal(ok.childEnv.LIVE_SMOKE_IDENTITY_ENV_ADMIN, 'TEST_ADMIN_EMAIL');
});

test('--path must be a path on the target env — not protocol-relative, not a URL (PR #20 review)', () => {
  for (const bad of ['//evil.example/x', '/\\evil.example/x', 'https://evil.example/', 'relative/page']) {
    assert.match(planRun({ args: { path: bad }, config: CONFIG }).error, /--path must be a path/);
  }
  assert.equal(planRun({ args: { path: '/ok?x=1' }, config: CONFIG }).error, undefined);
  assert.match(planRun({ args: { path: true }, config: CONFIG }).error, /--path must be a path/);
});

test('appDir must stay inside the repo — it is where .env.local is read from (PR #20 review)', () => {
  for (const bad of ['../elsewhere', '/etc', 'apps/../../x']) {
    assert.throws(() => validateConfig({ appDir: bad, envs: { local: 'http://x' } }), /relative path inside the repo/);
  }
  assert.equal(validateConfig({ appDir: 'apps/web', envs: { local: 'http://x' } }).appDir, 'apps/web');
});
