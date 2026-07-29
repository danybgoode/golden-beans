import { spawnSync } from 'node:child_process';
import { isAbsolute, resolve } from 'node:path';

/**
 * Resolve repository-wide operational state in Git's common directory.
 *
 * A linked worktree's `<root>/.git` is a text file, not a directory. Git's common directory is the
 * one stable home shared by the main checkout and every linked worktree, which is exactly where the
 * prose rail's lock, baseline, status and log belong.
 */
export function resolveGitCommonDir(repoRoot, run = spawnSync) {
  const result = run('git', ['rev-parse', '--git-common-dir'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const detail = String(result.stderr || '').trim().split('\n').at(-1) || 'unknown error';
    throw new Error(`could not resolve Git common directory: ${detail}`);
  }
  const value = String(result.stdout || '').trim();
  if (!value) throw new Error('could not resolve Git common directory: git returned no path');
  return isAbsolute(value) ? value : resolve(repoRoot, value);
}
