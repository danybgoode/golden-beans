// owed-ledger.test.mjs — the categoriser and the no-loss guarantee. All pure: no spec tree, no I/O.

import test from 'node:test';
import assert from 'node:assert/strict';
import { categorise, extractMarkers, buildLedger, renderMarkdown, listSpecFiles, CATEGORIES } from './owed-ledger.mjs';

// ---- extraction ----

test('extractMarkers: finds the real comment shapes used in the tree', () => {
  const src = [
    'import { test } from "@playwright/test"',
    '// the authed promoter smoke is owed to the product owner per sprint-1.md',
    ' * live-Shopify-domain pull is owed to the product owner. See the epic README.',
    '// Owed (the product owner, one-time): the test-identity repo secrets',
    'const x = 1 // nothing to see here',
  ].join('\n');
  const found = extractMarkers(src, 'e2e/x.spec.ts');
  assert.equal(found.length, 3);
  assert.equal(found[0].line, 2);
  // Comment punctuation is stripped so the ledger reads as prose.
  assert.ok(!found[1].text.startsWith('*'));
  assert.match(found[2].text, /^Owed \(the product owner/);
});

test('extractMarkers: matching is case-insensitive and tolerates "owed (the product owner"', () => {
  assert.equal(extractMarkers('// OWED TO THE PRODUCT OWNER', 'f.spec.ts').length, 1);
  assert.equal(extractMarkers('// owed (the product owner) — a manual check', 'f.spec.ts').length, 1);
});

test('extractMarkers: an unrelated mention of the product owner is not a marker', () => {
  assert.equal(extractMarkers('// the product owner asked for this copy change', 'f.spec.ts').length, 0);
});

test('extractMarkers: empty/undefined input yields nothing rather than throwing', () => {
  assert.deepEqual(extractMarkers('', 'f.spec.ts'), []);
  assert.deepEqual(extractMarkers(undefined, 'f.spec.ts'), []);
});

// ---- categorisation ----
//
// Order is the policy: money beats auth beats admin. A checkout smoke that also needs a login is
// money — it is the one to run first and the most expensive to get wrong.

test('categorise: money-path wins over auth when a marker mentions both', () => {
  assert.equal(categorise({ file: 'e2e/checkout.spec.ts', text: 'needs a signed-in buyer session and a real payment' }), 'money-path');
});

test('categorise: auth-path when a session is needed but no money is involved', () => {
  assert.equal(categorise({ file: 'e2e/promoter-preview.spec.ts', text: 'the authed promoter view is owed' }), 'auth-path');
});

test('categorise: admin-only for admin surfaces with no money or auth wording', () => {
  assert.equal(categorise({ file: 'e2e/admin-seleccion.spec.ts', text: 'the pinned ordering needs an eyeball' }), 'admin-only');
});

test('categorise: anything unplaceable goes to other — a to-triage list, never a bin', () => {
  assert.equal(categorise({ file: 'e2e/copy.spec.ts', text: 'a human should read the founder copy' }), 'other');
});

test('categorise: always returns a known category', () => {
  for (const f of ['a.spec.ts', 'e2e/admin/x.spec.ts', 'e2e/checkout/y.spec.ts']) {
    assert.ok(CATEGORIES.includes(categorise({ file: f, text: '' })));
  }
});

// ---- the no-loss guarantee ----
//
// A ledger that quietly loses items is worse than the scattered comments it replaced, because it
// looks authoritative. This is the assertion that makes the number trustworthy.

test('buildLedger: every input marker appears in exactly one category', () => {
  const markers = [
    { file: 'e2e/checkout.spec.ts', line: 1, text: 'real payment owed' },
    { file: 'e2e/login.spec.ts', line: 2, text: 'authed session owed' },
    { file: 'e2e/admin.spec.ts', line: 3, text: 'admin moderation owed' },
    { file: 'e2e/copy.spec.ts', line: 4, text: 'someone should read it' },
    { file: 'e2e/copy.spec.ts', line: 9, text: 'and this too' },
  ];
  const ledger = buildLedger(markers);
  assert.equal(ledger.total, 5);
  assert.equal(ledger.files, 4); // copy.spec.ts contributes two markers, one file
  const summed = CATEGORIES.reduce((n, c) => n + ledger.byCategory[c], 0);
  assert.equal(summed, markers.length, 'categorised count must equal input count');
});

test('buildLedger: an empty tree is zero, not a crash', () => {
  const ledger = buildLedger([]);
  assert.equal(ledger.total, 0);
  assert.equal(CATEGORIES.reduce((n, c) => n + ledger.byCategory[c], 0), 0);
});

// ---- rendering ----

test('renderMarkdown: says it is generated, so nobody hand-edits it', () => {
  const md = renderMarkdown(buildLedger([{ file: 'e2e/a.spec.ts', line: 1, text: 'owed' }]), '2026-07-26');
  assert.match(md, /GENERATED — do not hand-edit/);
  assert.match(md, /1 check\(s\) owed across 1 spec file\(s\)/);
});

test('renderMarkdown: names "other" as a to-triage list rather than a dumping ground', () => {
  const md = renderMarkdown(buildLedger([{ file: 'e2e/a.spec.ts', line: 1, text: 'owed' }]), '2026-07-26');
  assert.match(md, /not a bin, a to-triage list/);
});

test('renderMarkdown: an empty category is omitted rather than printed as a bare heading', () => {
  const md = renderMarkdown(buildLedger([{ file: 'e2e/checkout.spec.ts', line: 1, text: 'payment owed' }]), '2026-07-26');
  assert.match(md, /## money-path/);
  assert.doesNotMatch(md, /## admin-only \(0\)/);
});

// ---- cross-review findings on PR #110 ----

test('listSpecFiles: an unreadable subtree THROWS rather than under-reporting', () => {
  // Swallowing it emitted a smaller ledger as authoritative — the same "confident empty result" this
  // repo deleted two backend test scripts for.
  const read = (d) => {
    if (d === '/root') return ['ok', 'denied'];
    if (d === '/root/ok') return ['a.spec.ts'];
    throw Object.assign(new Error('EACCES'), { code: 'EACCES' });
  };
  const stat = (p) => ({ isDirectory: () => !p.endsWith('.spec.ts') });
  assert.throws(() => listSpecFiles('/root', { read, stat }), /UNDER-report|could not be read/);
});

test('listSpecFiles: a fully readable tree returns sorted spec files', () => {
  const read = (d) => (d === '/r' ? ['b.spec.ts', 'a.spec.ts', 'notes.md'] : []);
  const stat = (p) => ({ isDirectory: () => !/\.(spec\.ts|md)$/.test(p) });
  assert.deepEqual(listSpecFiles('/r', { read, stat }), ['/r/a.spec.ts', '/r/b.spec.ts']);
});

// ── Configurable owners + derived spec dirs (plugin-audit-and-extraction S2.5) ────────────────────

test('markerFor: a project can owe checks to a named person as well as the role', async () => {
  const { markerFor } = await import('./owed-ledger.mjs');
  const m = markerFor(['the product owner', 'Jordan']);
  assert.equal(extractMarkers('// owed to Jordan: the live payout smoke', 'f.spec.ts', m).length, 1);
  assert.equal(extractMarkers('// Owed (Jordan, one-time)', 'f.spec.ts', m).length, 1);
  assert.equal(extractMarkers('// Jordan asked for this', 'f.spec.ts', m).length, 0);
  // A name with regex metacharacters is matched literally, not as a pattern.
  assert.equal(extractMarkers('// owed to J.R.', 'f.spec.ts', markerFor(['J.R.'])).length, 1);
  assert.equal(extractMarkers('// owed to JxRx', 'f.spec.ts', markerFor(['J.R.'])).length, 0);
});

test('resolveOwedConfig: config wins; otherwise the role owner and every apps/*/e2e that exists', async () => {
  const { resolveOwedConfig, DEFAULT_OWNERS } = await import('./owed-ledger.mjs');
  const { ReportingConfigError } = await import('./lib/reporting-config.mjs');
  const fsFake = (present) => ({ exists: (p) => present.some((x) => p.endsWith(x)), readdir: () => ['web', 'api'] });
  const fromConfig = resolveOwedConfig({ root: '/r', load: () => ({ owed: { owners: ['Jordan'], specDirs: ['e2e'] } }), ...fsFake([]) });
  assert.deepEqual(fromConfig, { owners: ['Jordan'], specDirs: ['e2e'] });
  // A PRESENT but broken config must not silently fall back to the defaults.
  assert.throws(() => resolveOwedConfig({
    root: '/r',
    load: () => { throw new ReportingConfigError('/r/reporting.config.json: "owed.owners" must be an array'); },
    ...fsFake(['/r/reporting.config.json']),
  }), /owed\.owners/);
  const derived = resolveOwedConfig({
    root: '/r',
    load: () => { throw new ReportingConfigError('absent'); },
    ...fsFake(['/r/apps', 'apps/web/e2e']),
  });
  assert.deepEqual(derived, { owners: DEFAULT_OWNERS, specDirs: ['apps/web/e2e'] });
});
