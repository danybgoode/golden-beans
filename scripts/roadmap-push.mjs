#!/usr/bin/env node
// roadmap-push.mjs — push this repo's roadmap extract to a Growth Engine as a report artifact.
//
// pod-report · Sprint 1, Story 1.1. golden-beans is tenant #0: it dogfoods the same client-pushes
// rail a customer uses, through the same public endpoint, with the same kind of API key. There is
// no privileged internal path — if this script works, a customer's does too.
//
//   node scripts/roadmap-push.mjs                       # push to $GROWTH_ENGINE_URL
//   node scripts/roadmap-push.mjs --dry-run             # print the envelope, send nothing
//   node scripts/roadmap-push.mjs --url http://localhost:3000
//
// Env: GROWTH_ENGINE_URL (default http://localhost:3000) and SELF_PROJECT_API_KEY.
// A missing key is a CLEAN SKIP (exit 0), not a failure — see the note in the CI step.

import { spawnSync } from 'node:child_process';
import { writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getKey } from './lib/config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..');

// Must match apps/web/lib/roadmap-artifact-schema.ts's ROADMAP_SCHEMA_VERSION. Duplicated rather
// than imported because this is a zero-dependency .mjs script and that module is TypeScript behind
// a Next.js path alias — a spec asserts the two agree so the duplication cannot silently drift.
export const ROADMAP_SCHEMA_VERSION = 1;

function git(args) {
  const r = spawnSync('git', args, { cwd: REPO_ROOT, encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

/**
 * Build the push envelope from the extract rows.
 *
 * Pure and exported so a unit test pins the contract without running git, spawning the generator or
 * touching the network — the envelope is the thing the server validates, so it is the thing worth
 * testing.
 */
export function buildEnvelope(items, { commit, ref, generatedAt, board = null } = {}) {
  return {
    schemaVersion: ROADMAP_SCHEMA_VERSION,
    generatedAt: generatedAt ?? new Date().toISOString(),
    source: {
      // null, never undefined: JSON.stringify DROPS undefined keys, and a silently absent field is
      // harder to diagnose server-side than an explicit null.
      commit: commit ?? null,
      ref: ref ?? null,
    },
    items,
    // board-sinks-and-scrumban D21 — optional and additive; absent rather than null when there is nothing in it,
    // so the server's unchanged-board check (D16) never sees a difference that carries no information.
    ...(board ? { board } : {}),
  };
}

/**
 * The https base a card's repo-relative doc links resolve against, from the `origin` remote:
 * `git@github.com:o/r.git` or `https://github.com/o/r(.git)` → `https://github.com/o/r/blob/<branch>/`.
 * null for any other host — a link the Hub cannot build is better left out than guessed.
 */
export function repoBlobBase(remoteUrl, branch = 'main') {
  const m = String(remoteUrl || '')
    .trim()
    .match(
      /^(?:git@github\.com:|https:\/\/(?:[^@/]+@)?github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/
    );
  if (!m || !/^[A-Za-z0-9_./-]+$/.test(branch)) return null;
  return `https://github.com/${m[1]}/${m[2]}/blob/${branch}/`;
}

/** The envelope's `board` block: the WIP limits from config (D22) and the repo base for doc links. null when empty. */
export function buildBoard({ wip, repo }) {
  const limits = {};
  for (const stage of ['Building', 'QA']) {
    const n = wip?.[stage];
    if (Number.isInteger(n) && n > 0) limits[stage] = n;
  }
  const board = {};
  if (Object.keys(limits).length) board.wip = limits;
  if (repo) board.repo = repo;
  return Object.keys(board).length ? board : null;
}

/**
 * Rows from `roadmap-extract.mjs --live` — the ONE extractor (board-sinks-and-scrumban D15), with git and GitHub facts
 * gathered now, so the pushed stages are the ones the event that triggered this run produced. Dies loudly on empty
 * output (LEARNINGS: treat empty as failure).
 */
export function readExtract(run = spawnSync) {
  // --require-live: a failed git/GitHub gather turns the run red rather than publishing a docs-only board.
  const r = run('node', [resolve(__dirname, 'roadmap-extract.mjs'), '--live', '--require-live'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`roadmap-extract.mjs --live failed: ${(r.stderr || '').trim().split('\n').pop()}`);
  }
  const out = (r.stdout || '').trim();
  if (!out) throw new Error('roadmap-extract.mjs --live produced no output — treating empty as failure.');
  const items = JSON.parse(out);
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('extract returned no rows — refusing to push an empty roadmap.');
  }
  return items;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const urlFlag = args.indexOf('--url');
  const baseUrl =
    (urlFlag !== -1 ? args[urlFlag + 1] : undefined) ||
    process.env.GROWTH_ENGINE_URL ||
    'http://localhost:3000';
  const apiKey = process.env.SELF_PROJECT_API_KEY;

  const items = readExtract();
  const defaultBranch = (
    git(['symbolic-ref', '--short', 'refs/remotes/origin/HEAD']) || 'origin/main'
  ).replace(/^origin\//, '');
  const envelope = buildEnvelope(items, {
    commit: git(['rev-parse', 'HEAD']),
    ref: git(['rev-parse', '--abbrev-ref', 'HEAD']),
    board: buildBoard({
      wip: getKey('board.wip', { root: REPO_ROOT }),
      repo: repoBlobBase(git(['remote', 'get-url', 'origin']), defaultBranch),
    }),
  });

  if (dryRun) {
    writeSync(1, `${JSON.stringify(envelope, null, 2)}\n`);
    return;
  }

  if (!apiKey) {
    // Clean skip, not a failure. The CI step that calls this runs on every merge to `main`, and a
    // repo without the secret configured must not turn every merge red over an observability-grade
    // nicety — same stance as the Telegram workflow.
    process.stderr.write(
      'SELF_PROJECT_API_KEY not set — skipping the roadmap push cleanly.\n' +
        `  ${items.length} rows were generated and discarded. Set the key to enable this.\n`
    );
    return;
  }

  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/v1/roadmap/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(envelope),
    signal: AbortSignal.timeout(30_000),
  });

  const text = await res.text();
  if (!res.ok) {
    // The server's own error body names WHICH field failed and whether it was a version or a shape
    // problem — far more useful than a status code alone, so print it rather than swallowing it.
    process.stderr.write(`✗ roadmap push failed (${res.status}): ${text}\n`);
    process.exitCode = 1;
    return;
  }
  writeSync(1, `✓ roadmap pushed (${items.length} rows): ${text}\n`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  main().catch((err) => {
    process.stderr.write(`✗ ${err.message}\n`);
    process.exit(1);
  });
}
