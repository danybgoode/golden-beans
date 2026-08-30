#!/usr/bin/env node
// measure-contract.mjs — read the approved design's real numbers out of a real browser, and EMIT
// them as a file nobody may hand-edit.
//
// ── What changed here, and why it is the whole point of Story 1.4 ─────────────────────────────
// This script's own header used to say "Regenerates the spec table in CONSOLE-CONTRACT.md. Never
// hand-edit that table." **It never regenerated anything** — it printed to stdout and exited, and
// there was no `--check`. So the table stayed hand-written under a comment claiming it was
// measured, and two of its numbers drifted from the prototype without anything noticing: the
// project switcher (written 140x30, measured 122x30) and the feature row (written 78, measured 71).
//
// That is Mechanism C in the epic README — a contract whose whole claim is "measured, not
// described", carrying numbers nobody can reproduce and which stories then reason about as intent.
// The fix is not to correct the two numbers by hand; correcting them by hand would BE the defect
// again. The fix is that the file is generated, CI regenerates it, and any diff is a failure.
//
//   node apps/web/design-system/measure-contract.mjs           # regenerate MEASURED-SPEC.md
//   node apps/web/design-system/measure-contract.mjs --check   # CI: fail on any diff
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openPrototype, HERE } from './_harness.mjs';

const OUT = 'MEASURED-SPEC.md';

// Ship > Features is the state the contract's spec table describes, and the one whose three cheap
// assertions would have caught the whole failure on day one. Every selector below was verified
// present in `console-prototype.html` before this script moved onto it — a missing selector emits a
// **MISSING** row rather than a silently absent one, because a spec table that quietly loses a row
// is a spec that stops covering something without saying so.
// ── What is measured, and WHICH OF ITS DIMENSIONS ARE REPRODUCIBLE ────────────────────────────
//
// Ship > Features is the state the contract's spec table describes, and the one whose three cheap
// assertions would have caught the whole failure on day one. Every selector was verified present in
// `console-prototype.html`; a missing one emits a **MISSING** row rather than vanishing, because a
// spec table that quietly loses a row stops covering something without saying so.
//
// ── `box`, and the finding that produced it ───────────────────────────────────────────────────
// The first version emitted every width and height as a number and compared the file byte-for-byte.
// **That gate went red on its first CI run**, and the diff (which the checker now prints) said why:
// seven rows measure differently on ubuntu-latest than on macOS, with the SAME webfonts loaded and
// verified loaded.
//
//   Page h1              479 -> 496      Feature description  430 -> 420
//   Page subtitle        479 -> 496      Primary button       115 -> 118
//   Stat number       31x34 -> 32x40     Secondary button     175 -> 178
//   Content column   (h) 791 -> 792
//
// Those are text-advance and rasterisation differences. Self-hosting the fonts does not fix them —
// the font FILE would be identical and the rasteriser still is not.
//
// So the rule this file now follows, which is the epic's own rule turned on itself: **a number that
// only reproduces on the machine that generated it has no business in a contract whose entire claim
// is "measured, not described".** That is the exact complaint D8 makes about the hand-typed
// `140 x 30`. A per-machine number is a hand-typed number with extra steps.
//
// `box` therefore says which dimensions are EMITTED AS NUMBERS and so compared:
//
//   'exact'  both, verified reproducing on macOS and ubuntu-latest independently
//   'width'  width only — the height cascades from text laid out above it
//   'height' height only — the width is shrink-to-fit around a glyph run
//   'none'   neither is portable
//
// It is not a guess. Every value below is what two independent platforms actually agreed on, and
// **no contract-cited number was lost to this**: the switcher's `122 x 30`, the feature row's `71`,
// the rail item's `36`, the list header's `36`, the pill's `26` and the switch's `38 x 21` all
// reproduce exactly. The rows that lost numbers are cited by size and weight, never by box.
const TARGETS = [
  ['.topbar', 'Top bar (tier 1)', 'exact'],
  ['.crumb-btn', 'Project switcher', 'exact'],
  ['.tabs', 'Section nav (tier 2)', 'exact'],
  ['.tab[aria-selected="true"]', 'Section tab · active', 'exact'],
  ['.tab', 'Section tab · inactive', 'exact'],
  ['.rail', 'Rail (tier 3)', 'exact'],
  ['.railnav button[aria-current="true"]', 'Rail item · active', 'exact'],
  ['.railnav button', 'Rail item', 'exact'],
  // The column is 1180 wide by CSS; its height is the sum of whatever text laid out inside it, and
  // moved by 1px between platforms.
  ['.content', 'Content column', 'width'],
  ['.page-head h1', 'Page h1', 'height'],
  ['.page-head p', 'Page subtitle', 'height'],
  ['.answer', 'The answer line', 'exact'],
  // Both dimensions moved: 31x34 -> 32x40. The mono digits' advance AND their line box differ.
  ['.stat .n', 'Stat number', 'none'],
  ['.stat .k', 'Stat label', 'exact'],
  ['.listhead', 'List header row', 'exact'],
  ['.row', 'Feature row', 'exact'],
  ['.row-key', 'Feature key', 'exact'],
  ['.row-desc', 'Feature description', 'height'],
  ['.pill.on', 'State pill', 'exact'],
  ['.sw', 'Switch', 'exact'],
  ['.dormant', 'Dormant summary row', 'exact'],
  ['.btn-primary', 'Primary button', 'height'],
  ['.btn-ghost', 'Secondary button', 'height'],
];

export async function measure() {
  const { browser, page } = await openPrototype();
  try {
    return await measureIn(page);
  } finally {
    // ⚠️ `finally`, not a trailing `await browser.close()` — cross-family review (agy). A throw from
    // `page.evaluate` left Chromium running until Node exited, and CI runs this beside a render of
    // 32 states: one leaked browser per failure, on the runner that is already the slow job.
    await browser.close();
  }
}

async function measureIn(page) {
  const errors = [];
  page.on('pageerror', (event) => errors.push(String(event)));
  await page.evaluate(() => {
    APP.section = 'ship';
    APP.rail = 'features';
    APP.dormantOpen = false;
    APP.view = 'list';
    render();
  });
  await page.waitForTimeout(250);

  const out = await page.evaluate((targets) => {
    const read = ([selector, label, boxMode]) => {
      const element = document.querySelector(selector);
      if (!element) return { label, selector, missing: true };
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        label,
        selector,
        box: boxMode,
        missing: false,
        fontSize: parseFloat(style.fontSize),
        fontWeight: style.fontWeight,
        family: style.fontFamily.split(',')[0].replace(/["']/g, ''),
        textTransform: style.textTransform,
        width: Math.round(box.width),
        height: Math.round(box.height),
      };
    };
    return {
      rows: targets.map(read),
      noVerticalScroll: document.documentElement.scrollHeight <= window.innerHeight,
      noHorizontalScroll: document.body.scrollWidth <= window.innerWidth,
      featureRows: document.querySelectorAll('.row').length,
      dormantSummaryPresent: !!document.querySelector('.dormant'),
      uppercaseElements: [...document.querySelectorAll('.content *')]
        .filter((e) => getComputedStyle(e).textTransform === 'uppercase' && e.textContent.trim())
        .map((e) => e.className || e.tagName),
      ground: getComputedStyle(document.body).backgroundColor,
    };
  }, TARGETS);

  // A page error means the numbers were read off a half-rendered prototype. Emitting them anyway
  // would write a plausible file that is wrong — the failure mode this whole story exists to close.
  if (errors.length) {
    throw new Error(`measure-contract: ${errors.length} page error(s):\n  ${errors.join('\n  ')}`);
  }
  return out;
}

export function render(out) {
  /**
   * The Box cell — numbers only where they reproduce.
   *
   * `text-sized` is not a shrug. It says: this dimension is decided by how a glyph run happens to
   * rasterise on the machine doing the measuring, so writing a number here would be writing down a
   * fact about my laptop and calling it the design.
   */
  const boxCell = (row) => {
    if (row.box === 'exact') return `${row.width} × ${row.height}`;
    if (row.box === 'width') return `${row.width} × _text-sized_`;
    if (row.box === 'height') return `_text-sized_ × ${row.height}`;
    return '_text-sized_';
  };

  const cell = (row) =>
    row.missing
      ? `| ${row.label} | **MISSING** \`${row.selector}\` | | | |`
      : `| ${row.label} | ${row.fontSize} / ${row.fontWeight} | ${row.family} | ${boxCell(row)} | ${row.textTransform} |`;

  return `# The measured spec — Ship › Features at 1440 × 960

⚠️ **GENERATED — DO NOT HAND-EDIT.** Regenerate with:

\`\`\`bash
node apps/web/design-system/measure-contract.mjs
\`\`\`

CI runs \`--check\` and **fails on any diff**, so a number here cannot be argued into existence.
Source: \`apps/web/design-system/console-prototype.html\`, the 32 states approved 2026-08-29
(\`APPROVED.md\`). Font is whatever the prototype resolves; the Family column says which.

> **Why this file exists rather than a table inside \`CONSOLE-CONTRACT.md\`.** That table was
> hand-written under a heading reading *"Measured, not described"*, and two of its numbers did not
> survive re-measurement — the project switcher (written \`140 × 30\`) and the feature row (written
> \`h 78\`). A story then reasoned about \`78\` as declared design intent. Correcting those two numbers
> by hand would have been the same defect a second time; generating the file is the fix.

## The three assertions the visual gate leads with

| Property | Measured |
|---|---|
| Ground | \`${out.ground}\` |
| No vertical page scroll | ${out.noVerticalScroll ? '**true**' : '**false**'} |
| No horizontal page scroll | ${out.noHorizontalScroll ? '**true**' : '**false**'} |
| Feature rows rendered | **${out.featureRows}** |
| Dormant summary line present | ${out.dormantSummaryPresent ? '**yes**' : '**no**'} |

⚠️ **\`${out.featureRows}\` rows is the PROTOTYPE's dataset, not production's.** Production
\`miyagisanchez\` carries 42 flags with **3** active in Production and **39** never activated
(queried 2026-08-29 — epic README, D10). The gate asserts the *shape* — rows plus at most one
summary line, the summary standing for rows that are not also listed — never the literal number.

## Uppercase

Do-not #3 says uppercase appears in **exactly two places, and never in mono**: the list header row
and the group heading.

⚠️ The count below is of ELEMENTS, not of places, and the two numbers are different on purpose — a
previous version of this heading said *"exactly two places"* directly above a count of six, which
reads as the generated file contradicting itself (cross-family review, agy). The list header row is
one place rendered as four elements (the row plus its three column labels), and the group heading is
the second. Two places, six elements.

**${out.uppercaseElements.length}** uppercase elements in the content column:
${out.uppercaseElements.length ? out.uppercaseElements.map((e) => '`' + e + '`').join(' · ') : '_none_'}

## The spec

> **\`_text-sized_\`** means that dimension is decided by how a glyph run rasterises, and **does not
> reproduce across platforms** — measured here and on \`ubuntu-latest\`, the same webfonts loaded and
> verified loaded, \`Page h1\` is 479px wide on one and 496px on the other. Writing a number there
> would be recording a fact about one machine and calling it the design, which is the same defect
> D8 catches in the hand-typed \`140 × 30\`. Those dimensions are emitted as a marker and are **not
> compared** by \`--check\`; everything else is, exactly. No contract-cited number is affected — the
> switcher's \`122 × 30\`, the feature row's \`71\`, the rail item's \`36\`, the list header's \`36\`, the
> pill's \`26\` and the switch's \`38 × 21\` all reproduce on both.

| Element | Size / weight | Family | Box | Transform |
|---|---|---|---|---|
${out.rows.map(cell).join('\n')}
`;
}

// `fileURLToPath(...)`, matching every other script in this repo. The `file://${argv[1]}` form
// breaks on any path needing URL escaping — a space, an accent — and this file then silently
// becomes import-only: the CLI does nothing and exits 0 (cross-family review, agy). A tool that
// reports success while doing nothing is the failure mode this whole story is about.
if (fileURLToPath(import.meta.url) === process.argv[1]) {
  const check = process.argv.includes('--check');
  const path = join(HERE, OUT);
  const content = render(await measure());
  let onDisk = null;
  try {
    onDisk = readFileSync(path, 'utf8');
  } catch {
    onDisk = null;
  }

  if (check) {
    if (onDisk === content) {
      console.log(`✓ measure-contract: ${OUT} matches a fresh measurement of the approved prototype`);
      process.exit(0);
    }
    console.error(`✗ ${relative(process.cwd(), path)} is ${onDisk === null ? 'missing' : 'out of date'}.`);
    // ⚠️ PRINT THE DIFF. The first CI run of this step failed with nothing but "out of date", and
    // the numbers only exist inside a headless browser on a runner — so there was no way to tell a
    // font that had not loaded from a genuine design change without another cycle. A check that
    // says a file is wrong and not HOW is a check somebody re-runs rather than reads.
    if (onDisk !== null) {
      const was = onDisk.split('\n');
      const now = content.split('\n');
      const changed = [];
      for (let i = 0; i < Math.max(was.length, now.length); i += 1) {
        if (was[i] !== now[i])
          changed.push({ line: i + 1, was: was[i] ?? '(absent)', now: now[i] ?? '(absent)' });
      }
      console.error(`\n  ${changed.length} line(s) differ. Committed → measured just now:\n`);
      for (const row of changed.slice(0, 30)) {
        console.error(`   ${String(row.line).padStart(3)} - ${row.was}`);
        console.error(`       + ${row.now}`);
      }
      if (changed.length > 30) console.error(`   … and ${changed.length - 30} more`);
    }
    console.error(
      '\n  If the SIZES moved and the weights did not, the approved fonts rendered as a fallback — ' +
        'the harness now refuses that case outright, so this should not be reachable.\n' +
        '  Run: node apps/web/design-system/measure-contract.mjs\n' +
        '  Never hand-edit it — a number nobody can reproduce is what this file exists to prevent.'
    );
    process.exit(1);
  }

  writeFileSync(path, content);
  console.log(`  + ${relative(process.cwd(), path)}`);
}
