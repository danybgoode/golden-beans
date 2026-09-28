// check-config-reads.test.mjs — the guard fires on a direct config read, and only on that.
// Run: node --test scripts/check-config-reads.test.mjs

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { missingLoader, scan } from './check-config-reads.mjs';

test('fires on the direct reads S4.2 retired', () => {
  for (const line of [
    "const config = parseReviewConfig(JSON.parse(readFileSync(join(__dirname, 'review-config.json'), 'utf8')));",
    "const raw = JSON.parse(read(join(root, 'jev.config.json'), 'utf8'));",
    "values = parseFillIns(readFileSync(FILLINS_PATH, 'utf8'));",
    "const raw = JSON.parse(read(CONFIG_PATH, 'utf8'))",
    "const p = readFileSync(`${root}/reporting.config.json`, 'utf8');",
  ]) {
    assert.equal(scan('some-rail.mjs', line).length, 1, `should fire: ${line}`);
  }
});

test('does NOT fire on the owner, on data files, or on comments', () => {
  const quiet = [
    ["const json = parseJsonFile(path, { read, onError: configFail });", 'lib/config.mjs'],
    ["const x = JSON.parse(read(join(root, 'jev.config.json'), 'utf8'));", 'lib/config.mjs'],
    ["const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));", 'jev-eval.mjs'],
    ["return JSON.parse(readFileSync(path, 'utf8')); // benchmarks", 'lib/pmo-benchmarks.mjs'],
    ["// used to be: JSON.parse(readFileSync(join(__dirname, 'review-config.json')))", 'review-route.mjs'],
    ["  const { raw } = readSection('review', { legacyPath: join(__dirname, 'review-config.json') });", 'review-route.mjs'],
    ["export const CONFIG_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', 'perf-probe.config.json')", 'perf-probe.mjs'],
  ];
  for (const [line, rel] of quiet) assert.deepEqual(scan(rel, line), [], `should not fire in ${rel}: ${line}`);
});

test('reports the file and the 1-based line', () => {
  const hits = scan('x.mjs', "a\nconst c = JSON.parse(readFileSync('review-config.json'));\n");
  assert.deepEqual(hits.map((h) => h.line), [2]);
});

test('a converted rail that stops calling the loader fires, whatever form its read takes (review of #49)', () => {
  // The pre-conversion perf-probe read its file through a `path` VARIABLE, which no filename pattern can see.
  const reverted = "export function loadProbeConfig({ path = CONFIG_PATH, exists = existsSync, read = readFileSync } = {}) {\n" +
    "  if (!exists(path)) throw new Error('nope')\n  const raw = JSON.parse(read(path, 'utf8'))\n}";
  assert.equal(scan('perf-probe.mjs', reverted).length, 0, 'the patterns alone miss it');
  assert.ok(missingLoader('perf-probe.mjs', reverted), 'the rail table catches it');
  assert.equal(missingLoader('perf-probe.mjs', "const { raw } = readSection('smoke.perf', { legacyPath: path })"), null);
  assert.equal(missingLoader('not-a-rail.mjs', 'anything'), null);
});
