#!/usr/bin/env node
// report-new-commits.mjs — post a 📝 product report for every new `main` commit, exactly once.
//
// The deterministic local trigger for scripts/commit-report.mjs. Deliberately dumb: it compares two
// SHAs, walks the commits between them, and posts one report each. No model decides whether to run,
// no schedule to interpret, no cloud runner.
//
//   node scripts/report-new-commits.mjs              # post reports for anything unreported
//   node scripts/report-new-commits.mjs --dry-run    # list what WOULD be posted, post nothing
//   node scripts/report-new-commits.mjs --limit 3    # bound a large catch-up
//   node scripts/report-new-commits.mjs --ref origin/main # report the deployed remote branch
//   node scripts/report-new-commits.mjs --mark-only  # accept current main as reported, post nothing
//
// ── Why a state file and not "report HEAD on every hook fire" ──────────────────────────────────
// Because the hook fires on things that are not "a new commit shipped" — a `git pull` with nothing to
// fetch, a second pull, a rebase. Reporting HEAD unconditionally is how a channel gets the same
// message repeatedly, which is exactly the failure this rail was asked to fix. The state file makes
// "already reported" a fact on disk rather than an inference.
//
// ── The invariant ─────────────────────────────────────────────────────────────────────────────
// A commit is reported AT MOST ONCE. The state file advances only for commits whose report actually
// posted, so a failed post is retried next run rather than silently skipped — and a successful post is
// never repeated even if the hook fires ten times.

import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { die, need } from './lib/cross-agent-cli.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Inside .git/ on purpose: this is per-checkout operational state, not project content. It must never
// be committed (it would post a different set of reports on every machine) and .git/ is already
// outside the working tree, so there is nothing to add to .gitignore and nothing to accidentally stage.
const STATE_PATH = join(REPO_ROOT, '.git', 'gb-reported-commits');

/** How many commits a single catch-up run will report before stopping. */
const DEFAULT_LIMIT = 5;

function git(args, { allowFail = false } = {}) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  if (r.status !== 0) {
    if (allowFail) return '';
    die(`git ${args.join(' ')} failed: ${(r.stderr || '').trim().split('\n').pop() || 'unknown'}`);
  }
  return (r.stdout || '').trim();
}

export function readState(read = readFileSync, exists = existsSync) {
  if (!exists(STATE_PATH)) return null;
  const raw = read(STATE_PATH, 'utf8').trim();
  return /^[0-9a-f]{40}$/.test(raw) ? raw : null;
}

export function writeState(sha, write = writeFileSync) {
  mkdirSync(dirname(STATE_PATH), { recursive: true });
  write(STATE_PATH, `${sha}\n`, 'utf8');
}

/**
 * Which commits still need a report.
 *
 * ── The missing-baseline case is a BOUNDED no-op, not "report everything" ──────────────────────
 * With no state file (a fresh clone, a wiped .git), every commit in history is technically
 * "unreported". Walking them would fire hundreds of messages — this repo has a LEARNINGS entry for
 * exactly that shape of bug ("a delta-only reporting tool must special-case a missing/wiped baseline
 * as a bounded no-op, never as everything happened"). So: no baseline ⇒ report NOTHING, adopt HEAD as
 * the baseline, and say so. The first real report is the next commit after setup.
 */
export function planReports({ lastReported, commits, limit = DEFAULT_LIMIT }) {
  if (!lastReported) return { adoptOnly: true, shas: [] };
  // Oldest first, so the channel reads in the order things happened.
  const pending = [...commits].reverse();
  return { adoptOnly: false, shas: pending.slice(0, limit), skipped: Math.max(0, pending.length - limit) };
}

/**
 * Pick the source of truth for shipped commits.
 *
 * A local `main` can be days behind while a feature branch is checked out; that is the exact
 * failure that left production prose reports stranded. Prefer the tracking ref whenever it is
 * available. The local branch remains a deliberate offline fallback for a developer who has just
 * merged locally and has not pushed yet.
 */
export function resolveMainRef({ requestedRef, hasOriginMain, hasLocalMain }) {
  if (requestedRef) return requestedRef;
  if (hasOriginMain) return 'origin/main';
  if (hasLocalMain) return 'main';
  return null;
}

function main() {
  const args = process.argv.slice(2);
  let dryRun = false;
  let markOnly = false;
  let requestedRef;
  let status = false;
  let limit = DEFAULT_LIMIT;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') dryRun = true;
    else if (args[i] === '--mark-only') markOnly = true;
    else if (args[i] === '--ref') requestedRef = need(args[++i], '--ref');
    else if (args[i] === '--status') status = true;
    else if (args[i] === '--limit') limit = Number(need(args[++i], '--limit'));
    else die(`unknown arg ${args[i]}`);
  }

  // `main` specifically, never HEAD: the hook can fire while a feature branch is checked out, and a
  // feature commit is not something to report. `origin/main` wins over a stale local checkout.
  const mainRef = resolveMainRef({
    requestedRef,
    hasOriginMain: Boolean(git(['rev-parse', '--verify', 'origin/main'], { allowFail: true })),
    hasLocalMain: Boolean(git(['rev-parse', '--verify', 'main'], { allowFail: true })),
  }) ?? die('neither `main` nor `origin/main` resolves — nothing to report against.');

  const head = git(['rev-parse', mainRef]);
  const last = readState();

  if (status) {
    process.stdout.write(
      JSON.stringify({ ref: mainRef, head, lastReported: last, pending: last === head ? 0 : 'unknown' }) + '\n'
    );
    return;
  }

  if (markOnly) {
    writeState(head);
    process.stderr.write(`✓ baseline set to ${head.slice(0, 7)} — nothing posted.\n`);
    return;
  }

  if (last === head) {
    process.stderr.write(`nothing new on ${mainRef} (${head.slice(0, 7)} already reported).\n`);
    return;
  }

  const commits = last
    ? git(['rev-list', '--first-parent', `${last}..${head}`], { allowFail: true })
        .split('\n')
        .filter(Boolean)
    : [];

  const plan = planReports({ lastReported: last, commits, limit });

  if (plan.adoptOnly) {
    // --dry-run must change NOTHING, including the baseline. The first version advanced state here
    // before the dry-run check below, so `--dry-run` silently consumed the adopt-baseline step and a
    // subsequent real run reported nothing. A dry run that mutates state is not a dry run.
    if (dryRun) {
      process.stderr.write(`would adopt ${head.slice(0, 7)} as the baseline and post nothing.\n`);
      return;
    }
    writeState(head);
    process.stderr.write(
      `no baseline yet — adopting ${head.slice(0, 7)} as the starting point and posting NOTHING.\n` +
        `  (Reporting all of history here would fire one message per commit. The next commit gets the first report.)\n`
    );
    return;
  }

  if (plan.shas.length === 0) {
    // `last..head` is empty but the SHAs differ — main was rewritten or moved backwards. Re-baseline
    // rather than guess; posting a report for a commit that is no longer on main would be worse.
    if (dryRun) {
      process.stderr.write(`would re-baseline to ${head.slice(0, 7)} (no new non-merge commits).\n`);
      return;
    }
    writeState(head);
    process.stderr.write(`main moved to ${head.slice(0, 7)} with no new non-merge commits — re-baselined.\n`);
    return;
  }

  if (dryRun) {
    process.stderr.write(`would report ${plan.shas.length} commit(s):\n`);
    for (const sha of plan.shas) {
      process.stderr.write(`  · ${sha.slice(0, 7)} ${git(['log', '-1', '--format=%s', sha])}\n`);
    }
    if (plan.skipped) process.stderr.write(`  (+${plan.skipped} beyond --limit ${limit})\n`);
    return;
  }

  for (const sha of plan.shas) {
    const subject = git(['log', '-1', '--format=%s', sha]);
    process.stderr.write(`→ reporting ${sha.slice(0, 7)} ${subject}\n`);

    const r = spawnSync('node', [join(__dirname, 'commit-report.mjs'), '--sha', sha, '--post'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'inherit', 'inherit'],
      // A prose model can be slow; a hook should not hang forever either.
      timeout: 10 * 60 * 1000,
    });

    if (r.status !== 0) {
      // STOP, and do NOT advance state past this commit. The next run retries from here, in order.
      // Advancing on failure would silently drop a report; continuing past it would post the channel
      // out of order.
      process.stderr.write(
        `✗ report for ${sha.slice(0, 7)} failed — state left at ${last ? last.slice(0, 7) : 'unset'}, ` +
          `it will be retried on the next run.\n`
      );
      process.exitCode = 1;
      return;
    }

    // Advance PER COMMIT, not once at the end: if commit 3 of 5 fails, the first two stay reported
    // and are never repeated.
    writeState(sha);
  }

  process.stderr.write(
    `✓ ${plan.shas.length} report(s) posted; baseline now ${plan.shas.at(-1).slice(0, 7)}.\n`
  );
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
