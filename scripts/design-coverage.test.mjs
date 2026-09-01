import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');

/**
 * design-system-rails · Sprint 6, Story 6.5 — **the ratchet, observed failing.**
 *
 * ── Why this file exists ──────────────────────────────────────────────────────────────────────
 * `scripts/design-coverage.mjs` is the thing that makes *"coverage may not decrease"* a property
 * rather than a promise, and until now **nothing ran it except CI, on the happy path**. Its own
 * header carries this repo's most expensive lesson — `format-changed.mjs` reported "no added files"
 * and exited 0, a gate that silently checked nothing — and a ratchet nobody has watched go red is
 * exactly that gate wearing a better comment.
 *
 * ── Why it is HERE and not `e2e/coverage-ratchet.spec.ts` ─────────────────────────────────────
 * `sprint-6.md`'s QA note names that path. It is the wrong home and the deviation is deliberate:
 * Playwright's `api` project makes HTTP requests against a running server, and this exercises a CLI
 * against a git repository. Putting it there would have needed a spec that starts no browser, calls
 * no endpoint and ignores its `request` fixture — sitting in a suite whose entire contract is
 * "hits public endpoints via the `request` fixture". `scripts/*.test.mjs` is where this repo's
 * script tests already live, and `npm run test:unit` (which CI runs) picks them up by glob, so the
 * coverage is identical and the file is where the next person will look for it.
 *
 * ── Why a REAL git repository, and not a mocked `git show` ────────────────────────────────────
 * The ratchet's whole mechanism is `git show <ref>:<path>`, and its two worst historical bugs were
 * both about what git does with an unusual ref — an empty `COVERAGE_BASE_REF` making `git show
 * :<path>` read the INDEX and compare the tree to itself, and a missing baseline being forgiven for
 * the wrong reason. A stub cannot reproduce either. So each test builds a throwaway repository,
 * commits a baseline, changes the manifest, and runs the real script.
 */

/** Run the script in `cwd`, returning its exit code and streams rather than throwing. */
function runCoverage(cwd, args = [], env = {}) {
  try {
    const stdout = execFileSync(process.execPath, [join(cwd, 'scripts/design-coverage.mjs'), ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    });
    return { code: 0, stdout, stderr: '' };
  } catch (error) {
    return {
      code: error.status ?? 1,
      stdout: String(error.stdout ?? ''),
      stderr: String(error.stderr ?? ''),
    };
  }
}

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
}

/**
 * A throwaway repository holding just the four files the script touches, with a committed baseline.
 *
 * Only the manifest, the report, the script and the drift guard it imports are copied — a full
 * clone would be slow and would couple this test to files it does not exercise.
 */
function fixtureRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'gb-ratchet-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, 'apps/web/design-system'), { recursive: true });
  cpSync(join(REPO, 'scripts/design-coverage.mjs'), join(dir, 'scripts/design-coverage.mjs'));
  cpSync(
    join(REPO, 'apps/web/design-system/route-manifest.ts'),
    join(dir, 'apps/web/design-system/route-manifest.ts')
  );
  cpSync(
    join(REPO, 'apps/web/design-system/coverage.json'),
    join(dir, 'apps/web/design-system/coverage.json')
  );

  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'ratchet@example.invalid');
  git(dir, 'config', 'user.name', 'ratchet fixture');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'baseline');
  return dir;
}

/** Turn one covered row off, so coverage genuinely falls by one. */
function uncoverOneRoute(dir, route) {
  const path = join(dir, 'apps/web/design-system/route-manifest.ts');
  const source = readFileSync(path, 'utf8');
  const at = source.indexOf(`route: '${route}',`);
  assert.ok(at > 0, `the fixture manifest has no row for ${route}`);
  const flag = source.indexOf('rendersFromDesignSystem: true,', at);
  assert.ok(flag > at, `${route}'s row does not claim the design system`);
  writeFileSync(
    path,
    source.slice(0, flag) + 'rendersFromDesignSystem: false,' + source.slice(flag + 'rendersFromDesignSystem: true,'.length)
  );
}

test('the ratchet FAILS when coverage falls, and names the route that lost it', () => {
  const dir = fixtureRepo();
  try {
    // Sanity first: the committed baseline is accurate, so a later red is the ratchet and not a
    // stale report. A test whose "before" state was already broken proves nothing about its "after".
    const before = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
    assert.equal(before.code, 0, `the fixture's own baseline does not check out:\n${before.stderr}`);

    uncoverOneRoute(dir, '/login');
    // Regenerate, so the report on disk is ACCURATE and the only thing wrong is that it is lower.
    // Skipping this would fail on the "out of date" check instead, which is a different guard.
    assert.equal(runCoverage(dir).code, 0);

    const after = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
    assert.equal(after.code, 1, 'coverage fell and the ratchet passed');
    assert.match(after.stderr, /RATCHET: coverage fell from 27 to 26/);
    // Naming the route is the half that makes a red actionable. "Coverage fell" sends a reader to
    // diff two JSON files; "/login lost coverage" sends them to the commit that did it.
    assert.match(after.stderr, /Routes that lost coverage: \/login/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the ratchet PASSES when coverage is unchanged', () => {
  const dir = fixtureRepo();
  try {
    const result = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /not below HEAD's 27/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a report that is merely OUT OF DATE fails differently from one that fell', () => {
  // The two failures must not look alike: one means "run the script", the other means "you removed
  // coverage". Collapsing them is how a real regression gets committed under a "regenerate the
  // report" message.
  const dir = fixtureRepo();
  try {
    uncoverOneRoute(dir, '/login');
    const result = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /is out of date/);
    assert.doesNotMatch(result.stderr, /RATCHET/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an EMPTY base ref is refused, not defaulted — it would compare the tree to itself', () => {
  // ⚠️ The bug this pins is subtle and was found by a cross-family reviewer, Blocking: `git show
  // :<path>` with an empty ref is NOT an error — the colon-prefixed form reads the git INDEX. So an
  // unresolved `COVERAGE_BASE_REF` would have made the ratchet compare the working tree's coverage
  // against its own staged copy, find them equal, and print a green tick. A gate silently comparing
  // a thing to itself, inside the tool built to prevent exactly that.
  const dir = fixtureRepo();
  try {
    const result = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: '' });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /COVERAGE_BASE_REF is set but empty/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an unresolvable base ref FAILS rather than passing quietly', () => {
  // The `format-changed.mjs` lesson, asserted: a gate that cannot run must be loud. A ref that does
  // not exist is indistinguishable from a shallow clone or a missing fetch, and every one of those
  // means the ratchet checked nothing.
  const dir = fixtureRepo();
  try {
    const result = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: 'refs/heads/no-such-branch' });
    assert.equal(result.code, 1);
    assert.match(result.stderr, /could not read .* from refs\/heads\/no-such-branch/);
    assert.match(result.stderr, /fails rather than passing quietly/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('the epic closes at 27 of 27, and the printed number is the manifest’s', () => {
  // Story 6.5's headline, read from the SHIPPED script rather than from the manifest a unit test
  // could import — this is the number CI prints into the PR's step summary, and the walkthrough
  // tells Daniel to read it there.
  const result = runCoverage(REPO, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /COVERED \(both\)\s+27 \/ 27\s+\(100%\)/);
});
