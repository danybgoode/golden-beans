import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  CONFIG_FILENAME,
  ReportingConfigError,
  chatIdFor,
  configPath,
  loadReportingConfig,
  LOCAL_FILENAME,
  validateReportingConfig,
} from './reporting-config.mjs';
import { buildMessage } from '../weekly-recap.mjs';

const MIN = { repos: ['acme/web'] };

function tempRoot(config) {
  const root = mkdtempSync(join(tmpdir(), 'reporting-config-'));
  if (config !== undefined)
    writeFileSync(join(root, CONFIG_FILENAME), typeof config === 'string' ? config : JSON.stringify(config));
  return root;
}

test('an ABSENT config fails with a readable message naming the file — never a borrowed default', () => {
  const root = tempRoot();
  assert.throws(
    () => loadReportingConfig({ root, env: {} }),
    (e) =>
      e instanceof ReportingConfigError &&
      e.message.includes(join(root, CONFIG_FILENAME)) &&
      /refuse to guess/.test(e.message) &&
      /reporting\.config\.example\.json/.test(e.message)
  );
});

test('malformed JSON names the file and says it is not valid JSON', () => {
  const root = tempRoot('{ "repos": [');
  assert.throws(() => loadReportingConfig({ root, env: {} }), /reporting\.config\.json: is not valid JSON/);
});

test('the minimal config loads, and every optional signal is OFF rather than defaulted', () => {
  const cfg = loadReportingConfig({ root: tempRoot(MIN), env: {} });
  assert.deepEqual(cfg.repos, ['acme/web']);
  assert.deepEqual(cfg.deployRepos, []);
  assert.equal(cfg.smoke, null);
  assert.equal(cfg.liveFlags, null);
  assert.equal(cfg.stalePreviewAgeDays, null);
  assert.equal(cfg.artifacts.docViewerUrl, null);
  assert.equal(cfg.artifacts.registry, null);
  assert.deepEqual(cfg.prose.extraBannedToolNames, []);
});

test('repos is required, non-empty, and every entry is owner/name', () => {
  for (const [raw, re] of [
    [{}, /"repos" must be an array/],
    [{ repos: [] }, /"repos" is empty/],
    [{ repos: ['not-a-repo'] }, /invalid repo "not-a-repo"/],
  ]) {
    assert.throws(() => validateReportingConfig(raw), re);
  }
});

test('shape errors name the offending key', () => {
  const cases = [
    [{ ...MIN, deployRepos: [{ repo: 'acme/web' }] }, /deployRepos\[0\]" needs a "label"/],
    [{ ...MIN, telegram: [] }, /"telegram" must be an object/],
    [{ ...MIN, owed: { owners: 'Jordan' } }, /owed\.owners" must be an array/],
    [{ ...MIN, owed: { specDirs: ['../x'] } }, /must be relative, inside the repo/],
    [{ ...MIN, owed: { specDirs: ['..\\..\\x'] } }, /must be relative, inside the repo/],
    [{ ...MIN, checkouts: { 'acme/web': 'apps\\..\\..\\x' } }, /relative directory inside the repo root/],
    [{ ...MIN, checkouts: { 'acme/other': 'apps/x' } }, /checkouts\.acme\/other" is not one of "repos"/],
    [{ ...MIN, checkouts: { 'acme/web': '../elsewhere' } }, /relative directory inside the repo root/],
    [{ ...MIN, telegram: { chatIds: { nightly: '1' } } }, /telegram\.chatIds\.nightly" is not a surface/],
    [{ ...MIN, smoke: { repo: 'acme/web' } }, /smoke\.workflow/],
    [{ ...MIN, liveFlags: { command: 'node flags.mjs' } }, /liveFlags\.command/],
    [{ ...MIN, stalePreviewAgeDays: 0 }, /stalePreviewAgeDays/],
    [{ ...MIN, artifacts: { docViewerUrl: 'viewer.example' } }, /artifacts\.docViewerUrl/],
    [
      { ...MIN, artifacts: { registry: { resolverBaseUrl: 'https://r.example' } } },
      /artifacts\.registry\.bucket/,
    ],
    [{ ...MIN, prose: { extraBannedToolNames: 'acmecart' } }, /prose\.extraBannedToolNames/],
    [{ ...MIN, prose: { extraBannedToolNames: ['acme(cart'] } }, /invalid regex fragment "acme\(cart"/],
    [{ ...MIN, telegram: { chatId: { id: 1 } } }, /telegram\.chatId" must be a string or number/],
    [
      { ...MIN, telegram: { chatIds: { weekly: { id: 1 } } } },
      /telegram\.chatIds\.weekly" must be a string or number/,
    ],
    [{ ...MIN, smoke: 'acme/web' }, /"smoke" must be an object/],
  ];
  for (const [raw, re] of cases) assert.throws(() => validateReportingConfig(raw), re);
});

test('REPORTING_CONFIG relocates the file', () => {
  assert.equal(
    configPath({ root: '/r', env: { REPORTING_CONFIG: 'ops/reporting.json' } }),
    '/r/ops/reporting.json'
  );
  assert.equal(configPath({ root: '/r', env: {} }), `/r/${CONFIG_FILENAME}`);
});

test('chatIdFor: surface id, then project id, then TELEGRAM_CHAT_ID, then null — never a guess', () => {
  const both = validateReportingConfig({
    ...MIN,
    telegram: { chatId: 'project', chatIds: { weekly: 'weekly-only' } },
  });
  assert.equal(chatIdFor(both, 'weekly', { TELEGRAM_CHAT_ID: 'env' }), 'weekly-only');
  assert.equal(chatIdFor(both, 'standup', { TELEGRAM_CHAT_ID: 'env' }), 'project');
  const none = validateReportingConfig(MIN);
  assert.equal(chatIdFor(none, 'pmo', { TELEGRAM_CHAT_ID: 'env' }), 'env');
  assert.equal(chatIdFor(none, 'pmo', {}), null);
});

test("the project's own reporting.config.json (else the shipped example) validates", () => {
  // In a configured project this pins the REAL committed config; in the template it pins the example a
  // spawned project starts from. Either way a malformed file fails here, not in a 3am routine.
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const name = existsSync(join(root, CONFIG_FILENAME)) ? CONFIG_FILENAME : 'reporting.config.example.json';
  const cfg = validateReportingConfig(JSON.parse(readFileSync(join(root, name), 'utf8')), name);
  assert.ok(cfg.repos.length >= 1);
});

test('weekly deploys line renders the CONFIGURED deploy repos, and is omitted when none are configured', () => {
  const base = {
    sinceISO: '2026-07-01T00:00:00Z',
    untilISO: '2026-07-08T00:00:00Z',
    repoResults: [
      {
        repo: 'acme/web',
        available: true,
        prs: [{ number: 1, title: 'a', mergedAt: '2026-07-02T00:00:00Z' }],
        capped: false,
      },
      { repo: 'acme/api', available: false, prs: [], capped: false },
    ],
    shippedEpics: { available: true, epics: [] },
  };
  const withDeploys = buildMessage({
    ...base,
    deployRepos: [
      { label: 'Frontend', repo: 'acme/web' },
      { label: 'Backend', repo: 'acme/api' },
    ],
  });
  assert.match(withDeploys, /Deploys<\/b> \(merges to main\)\nFrontend: 1 · Backend: unavailable/);
  assert.doesNotMatch(buildMessage(base), /Deploys/);
});

test('a gitignored reporting.config.local.json overlays the committed file — the chat id stays out of a public repo', () => {
  const root = tempRoot({ ...MIN, telegram: { chatIds: { pmo: 'committed-pmo' } } });
  writeFileSync(join(root, LOCAL_FILENAME), JSON.stringify({ telegram: { chatId: 'local-chat' } }));
  const cfg = loadReportingConfig({ root, env: {} });
  assert.deepEqual(cfg.repos, ['acme/web']);
  assert.equal(chatIdFor(cfg, 'standup', {}), 'local-chat');
  assert.equal(chatIdFor(cfg, 'pmo', {}), 'committed-pmo', 'a committed per-surface id survives the overlay');
  writeFileSync(join(root, LOCAL_FILENAME), '{ nope');
  assert.throws(
    () => loadReportingConfig({ root, env: {} }),
    /reporting\.config\.local\.json: is not valid JSON/
  );
});
