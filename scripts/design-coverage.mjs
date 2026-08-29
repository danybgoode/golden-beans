#!/usr/bin/env node
// design-coverage.mjs — one generated number for how much of the product is on the design system,
// and the RATCHET that stops it going backwards.
//
// ── Why a number at all ───────────────────────────────────────────────────────────────────────
// The previous epic's visual gate covered one route of twenty-nine and nothing said so. An XXL
// redesign with no finish line stops when someone gets tired; an off-system page nobody counts is a
// debt nobody can point at. This prints the finish line on every CI run.
//
// ── Why a ratchet, and why it compares against the BASE BRANCH ────────────────────────────────
// A floor committed in the repo is only a floor if lowering it fails. Comparing the working tree's
// coverage against the number on the base branch is what makes "coverage may not decrease" a
// property rather than a promise — a PR that removes a reference state, retires a route without
// retiring its obligation, or flips a `rendersFromDesignSystem` back to false goes red.
//
//   node scripts/design-coverage.mjs           # print + write coverage.json
//   node scripts/design-coverage.mjs --check   # CI: the committed file is accurate AND has not fallen
//
// ⚠️ If the base ref cannot be resolved, this FAILS. It does not pass quietly. `format-changed.mjs`
// taught this repo that lesson the expensive way: without `PRETTIER_BASE_REF` it reported "no added
// files" and exited 0 — a gate that silently checked nothing, which is worse than no gate because
// it reports success (Roadmap/LEARNINGS.md).
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..');
const MANIFEST = 'apps/web/design-system/route-manifest.ts';
const REPORT = 'apps/web/design-system/coverage.json';
const BASE_REF = process.env.COVERAGE_BASE_REF ?? 'origin/main';

const { coverage, liveRows } = await import(join(REPO, MANIFEST));

/** The report, as it should appear on disk. Sorted and pretty so a diff is readable. */
function buildReport() {
  const now = coverage(6);
  return `${JSON.stringify(
    {
      _: 'GENERATED — do not hand-edit. Run: node scripts/design-coverage.mjs',
      routes: now.total,
      hasReferenceState: now.hasReferenceState,
      rendersFromDesignSystem: now.rendersFromDesignSystem,
      complete: now.complete,
      outstanding: [...now.outstanding].sort(),
    },
    null,
    2
  )}\n`;
}

function line(label, value, total) {
  const pct = total === 0 ? 0 : Math.round((value / total) * 100);
  return `  ${label.padEnd(28)} ${String(value).padStart(3)} / ${total}  (${pct}%)`;
}

const report = buildReport();
const parsed = JSON.parse(report);
const reportPath = join(REPO, REPORT);

console.log('design coverage — apps/web/design-system/route-manifest.ts');
console.log(line('has an approved state', parsed.hasReferenceState, parsed.routes));
console.log(line('renders from design-system/', parsed.rendersFromDesignSystem, parsed.routes));
console.log(line('COVERED (both)', parsed.complete, parsed.routes));
// The denominator is computed from the manifest's own lifecycle fields, not typed here: Story 4.5
// retires three routes and Story 4.3 adds one, so "29" is true today and false at epic close.
console.log(`\n  denominator: ${liveRows(6).length} routes live at epic close (see the D13 ledger)`);

if (!process.argv.includes('--check')) {
  writeFileSync(reportPath, report);
  console.log(`\n  + ${relative(process.cwd(), reportPath)}`);
  process.exit(0);
}

// ── 1. the committed report is accurate ──────────────────────────────────────────────────────
let onDisk = null;
try {
  onDisk = readFileSync(reportPath, 'utf8');
} catch {
  onDisk = null;
}
if (onDisk !== report) {
  console.error(
    `\n✗ ${REPORT} is ${onDisk === null ? 'missing' : 'out of date'} — run: node scripts/design-coverage.mjs`
  );
  process.exit(1);
}

// ── 2. …and it has not fallen below the base branch's ────────────────────────────────────────
let baseReport;
try {
  baseReport = execFileSync('git', ['show', `${BASE_REF}:${REPORT}`], {
    cwd: REPO,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (error) {
  // A first PR — the file does not exist on the base branch yet — is the ONE legitimate miss, and
  // it is distinguishable: `git show` says "exists on disk, but not in <ref>" or "does not exist".
  // Anything else (a ref that cannot be resolved, no git, a shallow clone) is a broken gate and
  // must be loud.
  const message = String(error.stderr ?? error.message);
  const missingFile = /does not exist|exists on disk, but not in/.test(message);
  if (!missingFile) {
    console.error(
      `\n✗ could not read ${REPORT} from ${BASE_REF}. The ratchet cannot run, so this fails rather ` +
        `than passing quietly.\n  Set COVERAGE_BASE_REF, or fetch the base branch (CI needs ` +
        `fetch-depth: 0).\n  git said: ${message.trim()}`
    );
    process.exit(1);
  }
  console.log(`\n✓ coverage ${parsed.complete}/${parsed.routes} — no baseline on ${BASE_REF} yet`);
  process.exit(0);
}

const base = JSON.parse(baseReport);
if (parsed.complete < base.complete) {
  // Name the routes when they can be named. An empty list here is not a reason to print an empty
  // line and let the reader assume the tool is broken: it happens when the count fell without any
  // individual route moving out of `outstanding`, which means a covered route LEFT the manifest.
  const lost = parsed.outstanding.filter((route) => !base.outstanding.includes(route));
  console.error(
    `\n✗ RATCHET: coverage fell from ${base.complete} to ${parsed.complete}.\n` +
      (lost.length > 0
        ? `  Routes that lost coverage: ${lost.join(', ')}\n`
        : '  No route moved out of `outstanding`, so a COVERED route left the manifest entirely.\n') +
      '  Coverage may not decrease. If a route was deliberately retired, retire its manifest row ' +
      'with `retiresIn` so it leaves the denominator too.'
  );
  process.exit(1);
}

console.log(`\n✓ coverage ${parsed.complete}/${parsed.routes} — not below ${BASE_REF}'s ${base.complete}`);
