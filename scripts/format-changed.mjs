#!/usr/bin/env node
// format-changed.mjs — run Prettier over ONLY the files this branch actually changed.
//
// ── Why not just `prettier --check .` (decided 2026-07-24) ────────────────────────────────────
// Because a full check fails on 292 pre-existing files, and the fix — `prettier --write .` — is a
// 292-file reformat that moves every `git blame` line and un-does deliberate hand formatting
// (lib/telegram.ts's escape chain is written one `.replace()` per line ON PURPOSE; Prettier joins
// it into one 90-column line). Paying that cost buys nothing: this repo has one human and a set
// of agents, and ESLint — which finds actual bugs — is already clean and enforced at
// `--max-warnings=0`. Prettier's entire job here is keeping NEW code stylistically consistent,
// and that job is done perfectly well by a changed-files gate with zero legacy debt.
//
// ── The gate is NEW files only, and that asymmetry is the whole design ────────────────────────
// A first attempt gated every *changed* file. It failed its first real test: fixing a single
// apostrophe in a 400-line experiment page demanded reformatting the entire page, burying a
// one-character fix in a 60-line whitespace diff. A gate that punishes small fixes teaches people
// to avoid small fixes.
//
// So `--check` (the CI shape) looks ONLY at files this branch ADDED. A new file has no legacy
// debt, no blame history to move and no hand-tuning to destroy — formatting it costs literally
// nothing, and it means every file agents write from here lands consistent. Modified legacy files
// are deliberately exempt.
//
// `--write` (the local shape) is broader on purpose: it covers everything changed, so converging
// a legacy file stays a deliberate, one-command act when someone decides it's worth a commit of
// its own — never a side effect of an unrelated fix.
//
//   node scripts/format-changed.mjs           # check ADDED files (exit 1 on a violation) — CI
//   node scripts/format-changed.mjs --write   # format ALL changed files in place — local, opt-in
//
// Base ref resolution: --base <ref>, else $PRETTIER_BASE_REF, else origin/main, else main.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';

const args = process.argv.slice(2);
const write = args.includes('--write');
const baseFlag = args.indexOf('--base');
const explicitBase = baseFlag !== -1 ? args[baseFlag + 1] : undefined;

function git(argv) {
  const r = spawnSync('git', argv, { encoding: 'utf8' });
  return r.status === 0 ? (r.stdout || '').trim() : null;
}

function resolveBase() {
  for (const ref of [explicitBase, process.env.PRETTIER_BASE_REF, 'origin/main', 'main']) {
    if (ref && git(['rev-parse', '--verify', '--quiet', ref])) return ref;
  }
  return null;
}

const base = resolveBase();
if (!base) {
  // A shallow clone or a fresh repo with no main to diff against. Checking nothing is the right
  // answer — the alternative is a gate that fails for a reason the author cannot act on.
  process.stderr.write(
    'format-changed: no base ref resolvable (tried origin/main, main) — nothing to check.\n'
  );
  process.exit(0);
}

// `A` = added only (the check gate); `ACMR` = added/copied/modified/renamed (the --write shape).
// Deletions are excluded either way — a deleted file cannot be formatted.
const filter = write ? 'ACMR' : 'A';

// Three-dot: merge-base(base, HEAD) → HEAD, i.e. ONLY this branch's own changes. Two-dot would
// fold in the inverse of everything `main` gained since we branched, and we would "format" files
// a sibling epic added (Roadmap/LEARNINGS.md — the two-dot-diff-lies rule).
const committed = git(['diff', '--name-only', `--diff-filter=${filter}`, `${base}...HEAD`]) || '';
// Uncommitted work counts too, so a local run covers what you're about to commit. For the check
// gate this is only meaningful alongside untracked files, which are added-but-uncommitted.
const working = write ? git(['diff', '--name-only', `--diff-filter=${filter}`, 'HEAD']) || '' : '';
const untracked = git(['ls-files', '--others', '--exclude-standard']) || '';

// existsSync is not belt-and-braces: `--diff-filter=A` against the merge base reports a file this
// branch ADDED, and a later commit on the same branch may have moved or deleted it. Prettier exits
// non-zero on a path it cannot open, so without this filter the gate fails for a file that is
// correctly absent — a red CI nobody can act on. Cross-review flagged it on PR #24.
const files = [...new Set([...committed.split('\n'), ...working.split('\n'), ...untracked.split('\n')])]
  .map((f) => f.trim())
  .filter(Boolean)
  .filter((f) => existsSync(f));

if (files.length === 0) {
  process.stdout.write(`format-changed: no ${write ? 'changed' : 'added'} files vs ${base}.\n`);
  process.exit(0);
}

// --ignore-unknown makes Prettier skip file types it has no parser for (.sql, .png, the migration
// files) instead of erroring, so we can hand it the raw changed-file list without pre-filtering.
// .prettierignore still applies on top of it.
const r = spawnSync('npx', ['prettier', write ? '--write' : '--check', '--ignore-unknown', ...files], {
  stdio: 'inherit',
  encoding: 'utf8',
});

if (!write && r.status !== 0) {
  process.stderr.write(
    `\nformat-changed: the files above differ from Prettier's output.\n` +
      `Fix with: npm run format:changed -- --write\n`
  );
}
process.exit(r.status ?? 1);
