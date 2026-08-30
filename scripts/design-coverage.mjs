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
// ⚠️ `||`, NOT `??`, plus an explicit emptiness refusal — cross-family review (agy), **Blocking**.
//
// `??` only falls through on `null`/`undefined`, and an EMPTY STRING is neither. A GitHub
// expression that does not resolve — `github.event.pull_request.base.sha` on any event that is not
// a pull_request — expands to `""`, so this arrived empty and `"" ?? 'origin/main'` stayed `""`.
//
// The consequence is the worst kind. `git show :<path>` with an empty ref is not an error: the
// colon-prefixed form reads **the git INDEX**. The ratchet would have compared the working tree's
// coverage against the working tree's own staged coverage, found them equal, and printed a green
// tick — a gate silently comparing a thing to itself, inside the tool built to prevent exactly
// that. Verified before fixing: `git show :apps/web/design-system/coverage.json` returns the
// staged file.
//
// An empty value is REFUSED rather than defaulted. Defaulting is the smaller fix and the wrong one:
// a workflow that sets `COVERAGE_BASE_REF=` deliberately-but-wrongly would then quietly compare
// against `origin/main` instead of failing and being noticed.
const BASE_REF_RAW = process.env.COVERAGE_BASE_REF;
if (BASE_REF_RAW !== undefined && BASE_REF_RAW.trim() === '') {
  console.error(
    '✗ COVERAGE_BASE_REF is set but empty. That usually means a workflow expression did not ' +
      'resolve — `github.event.pull_request.base.sha` is empty on any event that is not a ' +
      'pull_request. Refusing rather than defaulting: an empty ref makes `git show :<path>` read ' +
      'the INDEX, so the ratchet would compare coverage against itself and report green.'
  );
  process.exit(1);
}
const BASE_REF = BASE_REF_RAW || 'origin/main';

// ⚠️ This imports a `.ts` file from a `.mjs` script, which works because Node strips types by
// default from **22.18** onward. `ci.yml` pins `node-version: 22`, which FLOATS within the major, so
// an older 22.x would fail here. It fails LOUDLY — a syntax error, not a wrong number — and the repo
// already depends on the same behaviour for `npm run test:unit`, so this is a stated dependency
// rather than a hidden one (fresh reviewer).
const { coverage, liveRows } = await import(join(REPO, MANIFEST));

// ⚠️ `--sprint N` (fresh reviewer). Everything was reported at `coverage(6)`, so the three routes
// Story 4.5 retires were already out of the denominator while they are still live and off-system —
// the epic's own trajectory table says 30 through Sprint 3, and this printed 27. `route-manifest.ts`
// documents "the sprint being asked about" and nothing ever asked it anything but 6.
//
// The committed report stays at 6 — it is the epic's finish line and the ratchet's baseline, and a
// per-sprint baseline would ratchet against a moving denominator. The flag is for reading the
// number as of a sprint, which is what the sprint walkthroughs quote.
const sprintFlag = process.argv.indexOf('--sprint');
const SPRINT = sprintFlag === -1 ? 6 : Number(process.argv[sprintFlag + 1]);
if (!Number.isInteger(SPRINT) || SPRINT < 1 || SPRINT > 6) {
  console.error(`✗ --sprint must be 1-6, got ${JSON.stringify(process.argv[sprintFlag + 1])}`);
  process.exit(1);
}

/** The report, as it should appear on disk. Sorted and pretty so a diff is readable. */
function buildReport() {
  // Always 6 — the report is the ratchet's baseline and the epic's finish line. `--sprint` changes
  // what is PRINTED, never what is committed, because a baseline computed against a moving
  // denominator would ratchet against itself.
  const now = coverage(6);
  return `${JSON.stringify(
    {
      _: 'GENERATED — do not hand-edit. Run: node scripts/design-coverage.mjs',
      routes: now.total,
      // ⚠️ BOTH numbers, because agy raised the same point in two rounds and a reviewer repeating a
      // finding you reasoned your way out of is a signal to find a third option
      // (Roadmap/LEARNINGS.md). `routes` is the epic-close denominator, which is what the ratchet
      // must compare against — a baseline computed on a moving denominator ratchets against itself.
      // But reporting only that hid the fact that 30 routes are live TODAY while the three Story 4.5
      // retires are already out of the count. Now the file says both, and neither is inferred.
      // ⚠️ Named for the sprint it is computed at, not "today" (fresh reviewer, round 2). It was
      // `liveRoutesToday: liveRows(1).length` — a hard-coded 1 wearing a name that claims to track
      // the present, which would still have read 30 during Sprint 4 when 27 are live. A number that
      // says one thing and means another is the shape D13 exists to kill.
      liveRoutesAtSprint1: liveRows(1).length,
      hasReferenceState: now.hasReferenceState,
      rendersFromDesignSystem: now.rendersFromDesignSystem,
      complete: now.complete,
      // BOTH lists. The ratchet has to name what REGRESSED, and `outstanding` alone cannot do it:
      // diffing it reports a brand-new uncovered route as one that "lost coverage" (agy).
      covered: [...now.covered].sort(),
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
console.log(
  `\n  denominator: ${liveRows(6).length} routes live at epic close (see the D13 ledger)` +
    (SPRINT === 6
      ? ''
      : `\n  as of sprint ${SPRINT}: ${liveRows(SPRINT).length} live, ${coverage(SPRINT).complete} covered`)
);

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
  let missingFile = /does not exist|exists on disk, but not in/.test(message);

  // ⚠️ **The hatch must be keyed on the DESIGN SYSTEM being absent, not on this one file** (fresh
  // reviewer). Keyed on the report alone, renaming or moving `coverage.json` would make every
  // subsequent PR take this branch, print a green tick, and disable the ratchet — a gate switched
  // off by a refactor nobody would connect to it. So a missing report is only forgiven when the
  // manifest is missing from the base ref too, i.e. this really is the first PR to introduce any of
  // it. Anything else is a broken gate and must be loud.
  if (missingFile) {
    try {
      execFileSync('git', ['show', `${BASE_REF}:${MANIFEST}`], {
        cwd: REPO,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      // The manifest EXISTS on the base and the report does not — so the report moved, or was
      // deleted. Not a first PR.
      missingFile = false;
      console.error(
        `\n✗ ${MANIFEST} exists on ${BASE_REF} but ${REPORT} does not. The coverage report has been ` +
          'moved, renamed or deleted — which would silently disable the ratchet for every PR after ' +
          'this one. Restore it, or update REPORT and regenerate on the base branch first.'
      );
    } catch {
      // Neither exists on the base ref: genuinely the first PR to add the design system.
    }
  }

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
  // What was covered on the base and is not covered now. Diffing `outstanding` instead reports a
  // brand-new uncovered route as one that "lost coverage" — it never had any (cross-family review,
  // agy). `base.covered` may be absent on a report written before that field existed, and an older
  // baseline must not crash the gate: it falls back to saying it cannot name them, rather than to a
  // wrong list.
  const lost = Array.isArray(base.covered)
    ? base.covered.filter((route) => !parsed.covered.includes(route))
    : null;
  console.error(
    `\n✗ RATCHET: coverage fell from ${base.complete} to ${parsed.complete}.\n` +
      (lost === null
        ? '  (this baseline predates the `covered` field, so the routes cannot be named)\n'
        : lost.length > 0
          ? `  Routes that lost coverage: ${lost.join(', ')}\n`
          : '  No route left `covered`, so a covered route left the MANIFEST entirely.\n') +
      '  Coverage may not decrease. If a route was deliberately retired, retire its manifest row ' +
      'with `retiresIn` so it leaves the denominator too.'
  );
  process.exit(1);
}

console.log(`\n✓ coverage ${parsed.complete}/${parsed.routes} — not below ${BASE_REF}'s ${base.complete}`);
