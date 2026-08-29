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
const TARGETS = [
  ['.topbar', 'Top bar (tier 1)'],
  ['.crumb-btn', 'Project switcher'],
  ['.tabs', 'Section nav (tier 2)'],
  ['.tab[aria-selected="true"]', 'Section tab · active'],
  ['.tab', 'Section tab · inactive'],
  ['.rail', 'Rail (tier 3)'],
  ['.railnav button[aria-current="true"]', 'Rail item · active'],
  ['.railnav button', 'Rail item'],
  ['.content', 'Content column'],
  ['.page-head h1', 'Page h1'],
  ['.page-head p', 'Page subtitle'],
  ['.answer', 'The answer line'],
  ['.stat .n', 'Stat number'],
  ['.stat .k', 'Stat label'],
  ['.listhead', 'List header row'],
  ['.row', 'Feature row'],
  ['.row-key', 'Feature key'],
  ['.row-desc', 'Feature description'],
  ['.pill.on', 'State pill'],
  ['.sw', 'Switch'],
  ['.dormant', 'Dormant summary row'],
  ['.btn-primary', 'Primary button'],
  ['.btn-ghost', 'Secondary button'],
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
    const read = ([selector, label]) => {
      const element = document.querySelector(selector);
      if (!element) return { label, selector, missing: true };
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        label,
        selector,
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
  const cell = (row) =>
    row.missing
      ? `| ${row.label} | **MISSING** \`${row.selector}\` | | | |`
      : `| ${row.label} | ${row.fontSize} / ${row.fontWeight} | ${row.family} | ${row.width} × ${row.height} | ${row.textTransform} |`;

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

## Uppercase (Do-not #3: exactly two places, and never in mono)

**${out.uppercaseElements.length}** uppercase elements in the content column:
${out.uppercaseElements.length ? out.uppercaseElements.map((e) => `\`${e}\``).join(' · ') : '_none_'}

## The spec

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
    console.error(
      `✗ ${relative(process.cwd(), path)} is ${onDisk === null ? 'missing' : 'out of date'}.\n` +
        '  Run: node apps/web/design-system/measure-contract.mjs\n' +
        '  Never hand-edit it — a number nobody can reproduce is what this file exists to prevent.'
    );
    process.exit(1);
  }

  writeFileSync(path, content);
  console.log(`  + ${relative(process.cwd(), path)}`);
}
