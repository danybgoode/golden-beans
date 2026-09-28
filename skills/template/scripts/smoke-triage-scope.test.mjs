import test from 'node:test';
import assert from 'node:assert/strict';

import {
  normalizeRepoPath,
  isTestSurface as isTestSurfaceWith,
  decideAutoMerge,
  formatReport,
  validatePolicy,
  loadPolicy,
  main,
} from './smoke-triage-scope.mjs';

// The origin project's policy, as a fixture — every origin test below runs against exactly the rules
// it was written for. In a real project this is smoke-triage.config.json.
const POLICY = {
  testSurface: [
    { prefix: 'e2e/', why: 'the Playwright specs and their helpers — the smoke itself' },
    { exact: 'playwright.config.ts', why: 'projects, timeouts, workers — how the smoke runs' },
    { exact: '.github/workflows/browser-smoke.yml', why: 'the nightly detector workflow' },
    { prefix: 'scripts/browser-smoke-', why: 'the smoke reporting helpers' },
  ],
  assertionCalls: ['expect', 'expectListingFound'],
};
const isTestSurface = (p) => isTestSurfaceWith(p, POLICY.testSurface);
const decide = (files) => decideAutoMerge(files, POLICY);

// A minimal `GET /pulls/{n}/files` entry. Every test builds from this so the shape stays honest to
// the real API rather than to whatever each test found convenient.
const file = (filename, patch, extra = {}) => ({ filename, status: 'modified', patch, ...extra });
const clean = (filename) => file(filename, '@@ -1 +1 @@\n-const a = 1\n+const a = 2\n');

test('normalizeRepoPath refuses anything that is not a plain repo-relative path', () => {
  assert.equal(normalizeRepoPath('e2e/foo.spec.ts'), 'e2e/foo.spec.ts');
  assert.equal(normalizeRepoPath('  e2e/foo.spec.ts  '), 'e2e/foo.spec.ts');

  // The whole reason normalization exists: this string starts with `e2e/` and is app code.
  assert.equal(normalizeRepoPath('e2e/../app/page.tsx'), null);
  assert.equal(normalizeRepoPath('/etc/passwd'), null);
  assert.equal(normalizeRepoPath('e2e\\foo.ts'), null);
  assert.equal(normalizeRepoPath('e2e//foo.ts'), null);
  assert.equal(normalizeRepoPath('./e2e/foo.ts'), null);
  assert.equal(normalizeRepoPath(''), null);
  assert.equal(normalizeRepoPath(undefined), null);
});

test('isTestSurface admits the smoke scaffolding and nothing else', () => {
  assert.equal(isTestSurface('e2e/pdp-gallery.browser.spec.ts'), true);
  assert.equal(isTestSurface('e2e/_helpers/gallery-fixture.ts'), true);
  assert.equal(isTestSurface('playwright.config.ts'), true);
  assert.equal(isTestSurface('.github/workflows/browser-smoke.yml'), true);
  assert.equal(isTestSurface('scripts/browser-smoke-summary.mjs'), true);

  assert.equal(isTestSurface('app/(shell)/l/[id]/Gallery.tsx'), false);
  assert.equal(isTestSurface('lib/pricing.ts'), false);
  assert.equal(isTestSurface('components/feedback/Toast.tsx'), false);
  assert.equal(isTestSurface('supabase/migrations/20260101_x.sql'), false);

  // Allow-list, not deny-list: an unheard-of top-level directory is app code, not a gap.
  assert.equal(isTestSurface('packages/brand-new/index.ts'), false);

  // Adjacent names must not ride the prefix in.
  assert.equal(isTestSurface('e2e-legacy/foo.spec.ts'), false);
  assert.equal(isTestSurface('.github/workflows/ci.yml'), false);
  assert.equal(isTestSurface('playwright.config.ts.bak'), false);
});

test('a test-only diff that changes real behaviour is allowed', () => {
  const decision = decide([
    file(
      'e2e/_helpers/gallery-fixture.ts',
      "@@ -75,7 +75,7 @@\n-  if (envOverride) return { listingId: envOverride, source: 'env' }\n+  const pinned = await resolvePinnedListing(request, photos, envOverride)\n"
    ),
    file(
      'e2e/gallery-fixture.spec.ts',
      "@@ -1,1 +1,3 @@\n+  test('a live pin is used as-is', async () => {\n+    expect(fixture).toEqual({ listingId: 'pinned_1' })\n+  })\n"
    ),
  ]);
  assert.equal(decision.verdict, 'allow');
  assert.equal(decision.exitCode, 0);
  assert.deepEqual(decision.blockers, []);
  assert.equal(decision.surface.length, 2);
});

test('one app-code file blocks the whole PR, however green it is', () => {
  const decision = decide([
    clean('e2e/pdp-gallery.browser.spec.ts'),
    clean('app/(shell)/l/[id]/Gallery.tsx'),
  ]);
  assert.equal(decision.verdict, 'block');
  assert.equal(decision.exitCode, 1);
  assert.deepEqual(decision.appCode, ['app/(shell)/l/[id]/Gallery.tsx']);
  assert.ok(decision.blockers.some((b) => b.id === 'outside-test-surface'));
});

test('a traversal path is app code, not test surface', () => {
  const decision = decide([clean('e2e/../app/page.tsx')]);
  assert.equal(decision.verdict, 'block');
  assert.ok(decision.blockers.some((b) => b.id === 'outside-test-surface'));
});

// ── The weakening gate: every cheap way to turn a red nightly green ────────────────────────────

test('adding test.skip() blocks, even inside the test surface', () => {
  const decision = decide([
    file('e2e/pdp-gallery.browser.spec.ts', "@@ -1 +1,2 @@\n+  test.skip(true, 'flaky')\n"),
  ]);
  assert.equal(decision.verdict, 'block');
  assert.ok(decision.blockers.some((b) => b.id === 'skip-added'));
});

test('test.fixme, test.only and serial mode each block', () => {
  for (const [line, id] of [
    ["+  test.fixme('broken', async () => {})", 'fixme-added'],
    ["+  test.only('just this one', async () => {})", 'only-added'],
    ["+  test.describe.configure({ mode: 'serial' })", 'serial-added'],
  ]) {
    const decision = decide([file('e2e/x.spec.ts', `@@ -1 +1,2 @@\n${line}\n`)]);
    assert.equal(decision.verdict, 'block', `${id} should block`);
    assert.ok(
      decision.blockers.some((b) => b.id === id),
      `${id} not detected in: ${line}`
    );
  }
});

test('deleting an assertion blocks — the spec would test less than it did', () => {
  const decision = decide([
    file(
      'e2e/pdp-gallery.browser.spec.ts',
      "@@ -1,3 +1,2 @@\n   await page.goto(url)\n-  await expect(page.getByTestId('gallery-counter')).toBeVisible()\n"
    ),
  ]);
  assert.equal(decision.verdict, 'block');
  assert.ok(decision.blockers.some((b) => b.id === 'assertion-deleted'));
});

test('deleting a spec FILE blocks', () => {
  const decision = decide([
    file('e2e/pdp-gallery.browser.spec.ts', "@@ -1,2 +0,0 @@\n-test('x', () => {})\n", { status: 'removed' }),
  ]);
  assert.equal(decision.verdict, 'block');
  assert.ok(decision.blockers.some((b) => b.id === 'file-deleted'));
});

test("retiring the zero-photo spec blocks — correct, but the product owner's call, not the routine's", () => {
  // The real 2026-08-17 change. It was right, and it still must not auto-merge: the reason it was
  // right is that the product owner said so after it was surfaced to him twice.
  const decision = decide([
    file(
      'e2e/pdp-gallery.browser.spec.ts',
      "@@ -169,10 +169,1 @@\n-test.describe('pdp · zero-image placeholder parity (browser)', () => {\n" +
        "-    await expect(page.getByTestId('gallery-back')).toBeVisible()\n" +
        "-    await expect(page.getByTestId('gallery-share')).toBeVisible()\n" +
        '+ * RETIRED 2026-08-17: no public zero-photo listing exists.\n'
    ),
  ]);
  assert.equal(decision.verdict, 'block');
  assert.ok(decision.blockers.some((b) => b.id === 'assertion-deleted'));
});

test('test.slow() is NOT a weakening — raising a timeout budget is a legitimate shipped fix', () => {
  // PR #349 did exactly this. A guard that rejects correct output is worse than one that misses a
  // rare fault: block this and the routine is useless for the commonest real failure it sees.
  const decision = decide([file('e2e/agent-prompt.browser.spec.ts', '@@ -1 +1,2 @@\n+  test.slow()\n')]);
  assert.equal(decision.verdict, 'allow');
});

test('a word ending in the pattern name is not the pattern', () => {
  const decision = decide([
    file(
      'e2e/x.spec.ts',
      '@@ -1 +1,2 @@\n+  const shouldNotTest = maybeTest.skipped\n+  // mytest.skip is a comment about test.skip\n'
    ),
  ]);
  // `mytest.skip(` never appears with a paren, and `maybeTest.skipped` is not a call.
  assert.equal(decision.verdict, 'allow');
});

test('diff headers are not scanned as content', () => {
  const decision = decide([
    file(
      'e2e/x.spec.ts',
      '--- a/e2e/x.spec.ts\n+++ b/e2e/x.spec.ts\n@@ -1 +1 @@\n-const a = 1\n+const a = 2\n'
    ),
  ]);
  assert.equal(decision.verdict, 'allow');
});

// ── Three states, never two ───────────────────────────────────────────────────────────────────

test('zero files is UNDECIDABLE, never allow', () => {
  for (const input of [[], null, undefined, 'nonsense']) {
    const decision = decide(input);
    assert.equal(decision.verdict, 'undecidable');
    assert.equal(decision.exitCode, 2);
  }
});

test('an unreadable patch is UNDECIDABLE, never allow', () => {
  // GitHub omits `patch` for binaries and for diffs past its size cap. "I could not look" is not
  // "it is fine" — this is the exact collapse AGENTS.md rule 5 bans.
  const decision = decide([file('e2e/fixtures/screenshot.png', undefined)]);
  assert.equal(decision.verdict, 'undecidable');
  assert.equal(decision.exitCode, 2);
  assert.ok(decision.blockers.some((b) => b.id === 'patch-unreadable'));
});

test('undecidable outranks block — a partly-unread diff must not report as merely blocked', () => {
  const decision = decide([clean('app/page.tsx'), file('e2e/img.png', undefined)]);
  assert.equal(decision.verdict, 'undecidable');
  assert.ok(decision.blockers.some((b) => b.id === 'outside-test-surface'));
  assert.ok(decision.blockers.some((b) => b.id === 'patch-unreadable'));
});

test('a pure rename carries no patch and is not undecidable', () => {
  const decision = decide([{ filename: 'e2e/renamed.spec.ts', status: 'renamed', changes: 0 }]);
  assert.equal(decision.verdict, 'allow');
});

test('formatReport names the verdict, the files and every blocker', () => {
  const report = formatReport(
    decide([clean('app/page.tsx'), file('e2e/x.spec.ts', '@@ -1 +1,2 @@\n+  test.skip(true)\n')])
  );
  assert.match(report, /^smoke-triage scope: BLOCK/);
  assert.match(report, /app code \(1\): app\/page\.tsx/);
  assert.match(report, /outside-test-surface/);
  assert.match(report, /skip-added/);
});

// ── D4: the policy is required, and its absence FAILS CLOSED ──────────────────────────────────────
// The sprint's "step that matters": an autonomy-boundary check that silently defaults is a routine
// merging code nobody authorized.

test('D4: NO policy → UNDECIDABLE for a diff that would otherwise be allowed — never allow', () => {
  const onlyTests = [clean('e2e/pdp-gallery.browser.spec.ts')];
  assert.equal(decideAutoMerge(onlyTests, POLICY).verdict, 'allow', 'precondition: allowed WITH the policy');
  for (const missing of [
    undefined,
    null,
    {},
    { testSurface: POLICY.testSurface },
    { assertionCalls: ['expect'] },
  ]) {
    const d = decideAutoMerge(onlyTests, missing);
    assert.equal(d.verdict, 'undecidable');
    assert.equal(d.exitCode, 2);
    assert.equal(d.blockers[0].id, 'no-policy');
  }
});

test('D4: a malformed policy is refused, rule by rule', () => {
  for (const [raw, re] of [
    [{ testSurface: [], assertionCalls: ['expect'] }, /testSurface/],
    [{ testSurface: [{ prefix: 'e2e/' }], assertionCalls: ['expect'] }, /needs a "why"/],
    [{ testSurface: [{ prefix: 'e2e/', exact: 'x', why: 'y' }], assertionCalls: ['expect'] }, /exactly one/],
    [{ testSurface: POLICY.testSurface, assertionCalls: [] }, /assertionCalls/],
    [{ testSurface: POLICY.testSurface, assertionCalls: ['expect(x'] }, /assertionCalls/],
  ]) {
    const v = validatePolicy(raw);
    assert.equal(v.ok, false);
    assert.match(v.reason, re);
  }
});

test("D4: a project's own assertion helper, deleted, blocks — the name comes from the policy", () => {
  const patch = '@@ -1,2 +1 @@\n-  await expectListingFound(page, id)\n const x = 1\n';
  assert.equal(decide([file('e2e/x.spec.ts', patch)]).verdict, 'block');
  // With only `expect` configured, that helper's deletion is invisible — which is exactly why the
  // policy is the project's to write and has no template default.
  const narrow = { ...POLICY, assertionCalls: ['expect'] };
  assert.equal(decideAutoMerge([file('e2e/x.spec.ts', patch)], narrow).verdict, 'allow');
});

test('D4: loadPolicy names the missing file; main() refuses before any network call', async () => {
  const r = loadPolicy({ path: '/nope/smoke-triage.config.json', exists: () => false });
  assert.equal(r.ok, false);
  assert.match(r.reason, /smoke-triage\.config\.json not found/);
  let out = '';
  const write = process.stdout.write;
  process.stdout.write = (c) => ((out += c), true);
  let code;
  try {
    code = await main(['--repo', 'acme/web', '--pr', '1'], {
      loadPolicy: () => r,
      execFileSync: () => {
        throw new Error('must not reach GitHub without a policy');
      },
    });
  } finally {
    process.stdout.write = write;
  }
  assert.equal(code, 2);
  assert.match(out, /UNDECIDABLE — .*not found/);
});

// ── The gate cannot authorize a change to itself ──────────────────────────────────────────────

test('a PR that edits the gate policy is blocked even when the policy itself names that file as test surface', () => {
  const widened = {
    ...POLICY,
    testSurface: [
      ...POLICY.testSurface,
      { exact: 'smoke-triage.config.json', why: 'a PR widening its own gate' },
    ],
  };
  const decision = decideAutoMerge([clean('smoke-triage.config.json')], widened);
  assert.equal(decision.verdict, 'block');
  assert.deepEqual(
    decision.blockers.map((b) => b.id),
    ['gate-self-modification']
  );
});

test('a PR that edits the gate script is blocked', () => {
  const decision = decide([clean('scripts/smoke-triage-scope.mjs')]);
  assert.equal(decision.verdict, 'block');
  assert.ok(decision.blockers.some((b) => b.id === 'gate-self-modification'));
});

test('validatePolicy: a trailing-slash prefix is still path-checked — traversal and empty segments are refused', () => {
  for (const prefix of ['../e2e/', './e2e/', 'a//b/', '/e2e/']) {
    const r = validatePolicy({ ...POLICY, testSurface: [{ prefix, why: 'x' }] });
    assert.equal(r.ok, false, prefix);
  }
  assert.equal(validatePolicy({ ...POLICY, testSurface: [{ prefix: 'e2e/', why: 'x' }] }).ok, true);
});

test('validatePolicy: a rule with a valid exact beside a non-string prefix is malformed, not a throw', () => {
  const r = validatePolicy({ ...POLICY, testSurface: [{ exact: 'a.ts', prefix: 5, why: 'x' }] });
  assert.equal(r.ok, false);
  assert.match(r.reason, /exactly one of "prefix" \/ "exact"/);
  const d = decideAutoMerge([clean('e2e/a.spec.ts')], {
    ...POLICY,
    testSurface: [{ exact: 'a.ts', prefix: 5, why: 'x' }],
  });
  assert.equal(d.verdict, 'undecidable');
  assert.equal(d.exitCode, 2);
});
