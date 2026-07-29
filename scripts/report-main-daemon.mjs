#!/usr/bin/env node
// report-main-daemon.mjs — local, retrying delivery trigger for production prose reports.
//
// GitHub Actions cannot run the interactive OAuth-backed local writer chain. This process is run by
// the user's launchd agent instead: fetch the deployed branch without changing the checkout, then
// delegate exactly-once-per-channel delivery to report-new-commits.mjs. A failed fetch, writer, or channel send
// leaves that reporter's baseline untouched, so the next interval retries rather than losing a report.

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveGitCommonDir } from './lib/git-common-dir.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');
const GIT_COMMON_DIR = resolveGitCommonDir(REPO_ROOT);
const STATUS_PATH = join(GIT_COMMON_DIR, 'gb-main-report-status.json');
const LOCK_PATH = join(GIT_COMMON_DIR, 'gb-main-report.lock');
const INITIALIZING_LOCK_GRACE_MS = 60 * 1000;

function git(args) {
  return spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 1024 * 1024 });
}

function writeStatus(status) {
  const temporary = `${STATUS_PATH}.${process.pid}.tmp`;
  writeFileSync(temporary, `${JSON.stringify(status, null, 2)}\n`, 'utf8');
  renameSync(temporary, STATUS_PATH);
}

function readStatus() {
  if (!existsSync(STATUS_PATH)) return null;
  try {
    return JSON.parse(readFileSync(STATUS_PATH, 'utf8'));
  } catch {
    return { state: 'invalid-status-file' };
  }
}

/**
 * Hooks and launchd can fire at nearly the same time. `wx` makes starting a second reporter
 * impossible, while the recorded PID lets a later interval recover from a killed process instead
 * of leaving a permanent dead lock. A skipped overlapping run is harmless: the current owner will
 * either deliver and advance state or fail and leave it pending for the next interval.
 */
export function lockDecision({ raw, ageMs, ownerAlive }) {
  try {
    const { pid } = JSON.parse(raw);
    if (Number.isInteger(pid)) return ownerAlive ? 'held' : 'recover';
    // Valid JSON without the owner PID is still an incomplete lock initialization. It must receive
    // the same grace as invalid/empty JSON; otherwise a concurrent trigger can unlink it mid-write.
    return ageMs < INITIALIZING_LOCK_GRACE_MS ? 'held' : 'recover';
  } catch {
    // `open(..., wx)` makes the filename visible a few instructions before its JSON owner metadata
    // is written. Treat that short window as HELD, never as a dead lock: unlinking it would allow a
    // hook and launchd invocation to both post. A genuinely abandoned empty/malformed lock expires.
    return ageMs < INITIALIZING_LOCK_GRACE_MS ? 'held' : 'recover';
  }
}

function acquireLock() {
  try {
    const fd = openSync(LOCK_PATH, 'wx');
    writeFileSync(fd, `${JSON.stringify({ pid: process.pid, startedAt: new Date().toISOString() })}\n`);
    return fd;
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    let raw;
    let ageMs;
    try {
      raw = readFileSync(LOCK_PATH, 'utf8');
      ageMs = Date.now() - statSync(LOCK_PATH).mtimeMs;
    } catch (readError) {
      // The holder can finish between `open(..., wx)` observing EEXIST and this inspection. That
      // is successful contention, not a daemon failure: contend again against the now-absent file.
      if (readError.code === 'ENOENT') return acquireLock();
      throw readError;
    }
    let ownerAlive = false;
    try {
      const { pid } = JSON.parse(raw);
      process.kill(pid, 0);
      ownerAlive = true;
    } catch {
      /* invalid owner metadata or a dead PID is handled by lockDecision */
    }
    if (lockDecision({ raw, ageMs, ownerAlive }) === 'held') return null;
    try {
      // The owner died or its never-finished initialization grace elapsed. Recover only this
      // private lock file, then contend normally again.
      unlinkSync(LOCK_PATH);
    } catch (unlinkError) {
      if (unlinkError.code === 'ENOENT') return acquireLock();
      throw unlinkError;
    }
    return acquireLock();
  }
}

function usage() {
  process.stdout.write(
    'Usage: node scripts/report-main-daemon.mjs [--dry-run|--status]\n' +
      '  --dry-run  fetch and show pending reports without invoking writers or notification channels\n' +
      '  --status   print the last local runner result\n'
  );
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) return usage();
  if (args.includes('--status')) {
    process.stdout.write(`${JSON.stringify(readStatus(), null, 2)}\n`);
    return;
  }
  if (args.some((arg) => arg !== '--dry-run')) {
    usage();
    process.exitCode = 2;
    return;
  }

  const lock = acquireLock();
  if (lock === null) {
    process.stderr.write('another main-report runner is active; leaving this interval to it.\n');
    return;
  }

  try {
    run(args);
  } finally {
    closeSync(lock);
    try {
      unlinkSync(LOCK_PATH);
    } catch {
      /* the only possible writer is this process; a missing lock needs no recovery */
    }
  }
}

function run(args) {
  const checkedAt = new Date().toISOString();
  const fetched = git(['fetch', '--quiet', 'origin', 'main']);
  if (fetched.status !== 0) {
    writeStatus({
      checkedAt,
      state: 'fetch-failed',
      detail: (fetched.stderr || '').trim().split('\n').at(-1) || 'git fetch failed',
    });
    process.stderr.write('✗ unable to refresh origin/main; no report state changed.\n');
    process.exitCode = 1;
    return;
  }

  const head = git(['rev-parse', 'origin/main']);
  if (head.status !== 0) {
    writeStatus({ checkedAt, state: 'missing-origin-main' });
    process.stderr.write('✗ origin/main did not resolve after fetch; no report state changed.\n');
    process.exitCode = 1;
    return;
  }

  const dryRun = args.includes('--dry-run');
  const reported = spawnSync(
    process.execPath,
    [join(__dirname, 'report-new-commits.mjs'), '--ref', 'origin/main', ...(dryRun ? ['--dry-run'] : [])],
    { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024, timeout: 12 * 60 * 1000 }
  );
  if (reported.stdout) process.stdout.write(reported.stdout);
  if (reported.stderr) process.stderr.write(reported.stderr);

  const state = reported.status === 0 ? (dryRun ? 'dry-run-ok' : 'ok') : 'report-failed';
  writeStatus({
    checkedAt,
    state,
    head: head.stdout.trim(),
    exitCode: reported.status,
    detail: (reported.stderr || '').trim().split('\n').at(-1) || reported.error?.message || null,
  });
  if (reported.status !== 0) process.exitCode = 1;
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
