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
export function buildEnvelope(items, { commit, ref, generatedAt } = {}) {
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
  };
}

/** Rows from `roadmap-to-notion.mjs --extract`. Dies loudly on empty output (LEARNINGS: treat empty as failure). */
export function readExtract(run = spawnSync) {
  const r = run('node', [resolve(__dirname, 'roadmap-to-notion.mjs'), '--extract'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (r.status !== 0) {
    throw new Error(`roadmap-to-notion.mjs --extract failed: ${(r.stderr || '').trim().split('\n').pop()}`);
  }
  const out = (r.stdout || '').trim();
  if (!out)
    throw new Error('roadmap-to-notion.mjs --extract produced no output — treating empty as failure.');
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
  const envelope = buildEnvelope(items, {
    commit: git(['rev-parse', 'HEAD']),
    ref: git(['rev-parse', '--abbrev-ref', 'HEAD']),
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
