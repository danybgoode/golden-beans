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
      env: sealedEnv(env),
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

/**
 * Git's own environment variables, cleared for every child this file spawns.
 *
 * ⚠️ **Without this, these tests operate on THE REPOSITORY THEY ARE RUNNING IN.** `GIT_DIR` and
 * friends override `cwd` — `git -C /tmp/fixture init` with `GIT_DIR` set initialises whatever
 * `GIT_DIR` points at — and `.githooks/pre-push` exports them, which is precisely when this file
 * runs. Reproduced on 2026-09-09: the fixture's `git init` flipped the real repo's `core.bare` to
 * `true` and its `git commit -qm baseline` landed a commit deleting the entire tree on the branch
 * being pushed. The push then failed on the fixture's own error message, which read like a broken
 * test rather than a repository being rewritten underneath it.
 *
 * That is why pre-push has been failing here, and it is not new: the same leak fails these tests on
 * `main`, verified by running them with `GIT_DIR` set against `main`'s copy of this file.
 *
 * A test that builds a throwaway repository must be sealed against the repository it is spawned
 * from, or it is not a throwaway repository.
 */
const GIT_ENV_TO_CLEAR = {
  GIT_DIR: undefined,
  GIT_INDEX_FILE: undefined,
  GIT_WORK_TREE: undefined,
  GIT_COMMON_DIR: undefined,
  GIT_OBJECT_DIRECTORY: undefined,
  GIT_ALTERNATE_OBJECT_DIRECTORIES: undefined,
  GIT_CEILING_DIRECTORIES: undefined,
  GIT_PREFIX: undefined,
  // The fixture repos have no hooks and must not borrow this one's.
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_SYSTEM: '/dev/null',
};

/** `process.env` with git's own variables stripped. */
function sealedEnv(extra = {}) {
  const env = { ...process.env, ...extra };
  for (const key of Object.keys(GIT_ENV_TO_CLEAR)) {
    if (GIT_ENV_TO_CLEAR[key] === undefined) delete env[key];
    else env[key] = GIT_ENV_TO_CLEAR[key];
  }
  return env;
}

function git(cwd, ...args) {
  execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'pipe'], env: sealedEnv() });
}

/**
 * A throwaway repository holding just the THREE files the script touches, with a committed baseline.
 *
 * Only the script, the manifest and the report are copied — `design-coverage.mjs` imports nothing
 * but node builtins. (An earlier version of this sentence said "and the drift guard it imports",
 * which is a dependency that does not exist; fresh reviewer, Minor.) A full clone would be slow and
 * would couple this test to files it does not exercise.
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
  // ⚠️ The coverage number is MEASURED now, not typed (mockups-as-built, D5/D15) — it is read from
  // the file the visual gate writes. A fixture repo without it is a fixture the script cannot run
  // in at all.
  cpSync(
    join(REPO, 'apps/web/design-system/STATE-MATCH.json'),
    join(dir, 'apps/web/design-system/STATE-MATCH.json')
  );

  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'ratchet@example.invalid');
  git(dir, 'config', 'user.name', 'ratchet fixture');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-qm', 'baseline');
  return dir;
}

/**
 * Turn one covered row off, so coverage genuinely falls by one.
 *
 * ⚠️ **This used to flip `rendersFromDesignSystem` in the manifest, and that stopped lowering the
 * number** — the coverage count is derived from the gate's own result now (`STATE-MATCH.json`,
 * epic D5/D15), so a typed boolean cannot move it. Left as it was, every ratchet test would have
 * gone on passing while testing nothing, which is the failure mode this whole epic is about.
 * Uncovering a route now means removing it from what the gate measured.
 */
function uncoverOneRoute(dir, route) {
  const path = join(dir, 'apps/web/design-system/STATE-MATCH.json');
  const file = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok(file.matching[route], `the fixture's matching floor has no entry for ${route}`);
  delete file.matching[route];
  writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`);
}

test('the ratchet FAILS when coverage falls, and names the route that lost it', () => {
  const dir = fixtureRepo();
  try {
    // Sanity first: the committed baseline is accurate, so a later red is the ratchet and not a
    // stale report. A test whose "before" state was already broken proves nothing about its "after".
    const before = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
    assert.equal(before.code, 0, `the fixture's own baseline does not check out:\n${before.stderr}`);

    const baselineBefore = JSON.parse(
      readFileSync(join(dir, 'apps/web/design-system/coverage.json'), 'utf8')
    ).complete;
    uncoverOneRoute(dir, '/login');
    // Regenerate, so the report on disk is ACCURATE and the only thing wrong is that it is lower.
    // Skipping this would fail on the "out of date" check instead, which is a different guard.
    assert.equal(runCoverage(dir).code, 0);

    const after = runCoverage(dir, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
    assert.equal(after.code, 1, 'coverage fell and the ratchet passed');
    // ⚠️ **Derived from the fixture, never a literal.** These read `27 to 26` — the typed number —
    // and the coverage count is MEASURED now (mockups-as-built, D5), so it moves as each route
    // lands. A literal here would have to be edited by every story in the epic, and an assertion
    // somebody edits to make it pass has stopped being an assertion.
    assert.match(
      after.stderr,
      new RegExp(`RATCHET: coverage fell from ${baselineBefore} to ${baselineBefore - 1}`)
    );
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
    // Derived, for the same reason as the sibling test above.
    const baseline = JSON.parse(
      readFileSync(join(dir, 'apps/web/design-system/coverage.json'), 'utf8')
    ).complete;
    assert.match(result.stdout, new RegExp(`not below HEAD's ${baseline}`));
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

test('the printed coverage number comes from the GATE, not from a typed boolean', () => {
  // ⚠️ **This test used to assert `COVERED (both) 27 / 27 (100%)`, and that number was the defect.**
  // `design-system-rails` closed reporting 27 of 27 with `outstanding: []` while sixteen of the
  // twenty-one routes the visual gate opens did not have the structure of the design they cite —
  // because `complete` counted a hand-typed `rendersFromDesignSystem: true` on every row.
  //
  // The number is now read from `STATE-MATCH.json`, which `console-visual.authed.spec.ts` writes
  // after opening each route in a real browser (mockups-as-built, D5/D15). So this asserts the
  // SHAPE and the SOURCE rather than a literal: a literal here would have to be edited by every
  // story that lands a route, and an assertion somebody edits to make it pass is not an assertion.
  const result = runCoverage(REPO, ['--check'], { COVERAGE_BASE_REF: 'HEAD' });
  assert.equal(result.code, 0, result.stderr);
  assert.match(result.stdout, /MATCHES its approved state\s+\d+ \/ \d+/);

  const report = JSON.parse(readFileSync(join(REPO, 'apps/web/design-system/coverage.json'), 'utf8'));
  const floor = JSON.parse(
    readFileSync(join(REPO, 'apps/web/design-system/STATE-MATCH.json'), 'utf8')
  ).matching;
  const measuredMatching = Object.keys(floor).filter((route) => floor[route]);

  // ⚠️ **This compared `covered` against `matching FILTERED BY covered`, which is `covered` itself**
  // (cross-family review, Codex, Should-fix). It could only ever prove `covered ⊆ matching`, so a
  // matching route silently missing from the report passed — and I wrote it under a comment saying
  // "not a subset, not a superset". A tautology wearing a claim to be the opposite of one, in the
  // test file for the number this epic exists to make honest.
  //
  // The two sets are compared directly now. The report may not invent coverage, and it may not lose
  // a route the gate earned. The one legitimate asymmetry is stated rather than filtered away: the
  // gate's floor can hold a route the manifest no longer lists as measurable, so `matching` is
  // narrowed to the routes the REPORT is responsible for — by the report's own denominator, which
  // is `covered + outstanding`.
  const reportsOn = new Set([...report.covered, ...report.outstanding]);
  assert.deepEqual(
    [...report.covered].sort(),
    measuredMatching.filter((route) => reportsOn.has(route)).sort(),
    'coverage.json and the gate disagree about which routes match their approved state'
  );
  assert.equal(
    report.complete,
    report.covered.length,
    'coverage.json`s complete count and its covered list disagree'
  );
  assert.equal(
    report.complete + report.outstanding.length,
    report.measurable,
    'covered + outstanding must account for every route the gate is responsible for'
  );
});
