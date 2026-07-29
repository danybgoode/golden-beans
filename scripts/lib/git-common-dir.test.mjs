import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveGitCommonDir } from './git-common-dir.mjs';

const result =
  (stdout, status = 0, stderr = '') =>
  () => ({ stdout, status, stderr });

test('resolveGitCommonDir resolves a normal checkout relative to its root', () => {
  assert.equal(resolveGitCommonDir('/repo', result('.git\n')), '/repo/.git');
});

test('resolveGitCommonDir preserves the absolute common directory returned by a worktree', () => {
  assert.equal(resolveGitCommonDir('/repo/worktree', result('/repo/.git\n')), '/repo/.git');
});

test('resolveGitCommonDir fails loudly when Git cannot resolve repository state', () => {
  assert.throws(
    () => resolveGitCommonDir('/repo', result('', 128, 'fatal: not a git repository\n')),
    /not a git repository/
  );
});
