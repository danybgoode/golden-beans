// secret-guard.test.mjs — a reviewer's reply never reaches a PR comment carrying this machine's secrets.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectSecretValues, findSecretLeaks, parseEnvValues, MIN_SECRET_LENGTH } from './secret-guard.mjs';

const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiJ9.service-role-looking-value.sig';

test('parseEnvValues: KEY=value, export, quotes, comments and blanks', () => {
  assert.deepEqual(parseEnvValues('# c\nexport A="x y"\nB=\'q\'\nC=\n\nD = plain\n'), [
    { key: 'A', value: 'x y' },
    { key: 'B', value: 'q' },
    { key: 'D', value: 'plain' },
  ]);
});

test('collectSecretValues: every long value in the root .env* files, never the .example', () => {
  const root = mkdtempSync(join(tmpdir(), 'sg-'));
  writeFileSync(join(root, '.env.local'), `SUPABASE_SERVICE_ROLE_KEY=${SERVICE_KEY}\nPORT=3000\n`);
  writeFileSync(join(root, '.env.example'), 'SUPABASE_SERVICE_ROLE_KEY=placeholder-placeholder-1234\n');
  const values = collectSecretValues({ root, env: {} });
  assert.deepEqual(values, [SERVICE_KEY]);
});

test('collectSecretValues: secret-NAMED process env vars count; ordinary ones do not', () => {
  const root = mkdtempSync(join(tmpdir(), 'sg-'));
  const long = 'x'.repeat(MIN_SECRET_LENGTH);
  const values = collectSecretValues({ root, env: { TELEGRAM_BOT_TOKEN: long, PATH: `/usr/bin:${long}` } });
  assert.deepEqual(values, [long]);
});

test('findSecretLeaks: an env value in the reply is caught and redacted, and the value never appears in the report', () => {
  const reply = `**Blocking**\n- The config reads ${SERVICE_KEY} from .env.local.`;
  const { leaks, redacted } = findSecretLeaks(reply, { values: [SERVICE_KEY] });
  assert.equal(leaks.length, 1);
  assert.doesNotMatch(JSON.stringify(leaks), /service-role-looking-value/);
  assert.doesNotMatch(redacted, /service-role-looking-value/);
  assert.match(redacted, /\[REDACTED env value\]/);
});

test('findSecretLeaks: credential shapes are caught without any env file', () => {
  for (const s of [
    'ghp_' + 'a'.repeat(36),
    'sk-ant-' + 'b'.repeat(40),
    '-----BEGIN OPENSSH PRIVATE KEY-----',
    'https://hooks.slack.com/services/T000/B000/' + 'c'.repeat(24),
    '1234567890:' + 'A'.repeat(35),
    'AKIA' + 'Z'.repeat(16),
  ]) {
    assert.equal(findSecretLeaks(`**Nit**\n- ${s}`).leaks.length, 1, s.slice(0, 12));
  }
});

test('findSecretLeaks: an ordinary review is clean', () => {
  const reply = '**Blocking**\n- None.\n\n**Should-fix**\n- `scripts/cross-review.mjs:42` pins the sha.';
  assert.deepEqual(findSecretLeaks(reply, { values: ['not-in-the-reply-0123456789'] }).leaks, []);
});

// ── round 3 on #188: this repo's own service-role key lives in apps/web/.env.local ─────────────────────
test('collectSecretValues: nested .env files (apps/web/.env.local) and .envrc count; node_modules never does', async () => {
  const { mkdirSync } = await import('node:fs');
  const root = mkdtempSync(join(tmpdir(), 'sg-'));
  mkdirSync(join(root, 'apps', 'web'), { recursive: true });
  mkdirSync(join(root, 'node_modules', 'x'), { recursive: true });
  writeFileSync(
    join(root, 'apps', 'web', '.env.local'),
    'SUPABASE_SERVICE_ROLE_KEY=nested-app-secret-value-1\n'
  );
  writeFileSync(join(root, '.envrc'), 'export DB_URL=envrc-secret-value-12345\n');
  writeFileSync(join(root, 'node_modules', 'x', '.env'), 'X=vendored-not-ours-0123456\n');
  const values = collectSecretValues({ root, env: {} }).sort();
  assert.deepEqual(values, ['envrc-secret-value-12345', 'nested-app-secret-value-1']);
});

test('parseEnvValues: inline comments are not part of the value, quoted or not', () => {
  assert.deepEqual(
    parseEnvValues(
      'A="quoted-secret-value" # note\nB=bare-secret-value-123 # note\nC=has#hash-no-space\n'
    ).map((e) => e.value),
    ['quoted-secret-value', 'bare-secret-value-123', 'has#hash-no-space']
  );
});

test('findSecretLeaks: JWT and Supabase secret-key shapes are caught with no env file', () => {
  const jwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.c2lnbmF0dXJlLXZhbHVl';
  assert.equal(findSecretLeaks(`- ${jwt}`).leaks[0].name, 'JWT');
  assert.equal(findSecretLeaks('- sb_secret_' + 'k'.repeat(24)).leaks[0].name, 'Supabase secret key');
});
