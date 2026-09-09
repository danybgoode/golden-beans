#!/usr/bin/env node
// state-contract.mjs — the STRUCTURE of every approved state, read out of the approved prototype
// and emitted as a file nobody may hand-edit.
//
//   node apps/web/design-system/state-contract.mjs            # regenerate STATE-CONTRACT.json
//   node apps/web/design-system/state-contract.mjs --check    # CI: regenerate and fail on any diff
//
// ── Why this exists, and what it replaced ─────────────────────────────────────────────────────
// The epic scaffolded a per-route SCREENSHOT DIFF against the reference PNGs (D2 as groomed), with
// a threshold to be settled by making `/app/journeys` red and `/app/flags` green. It was measured
// before it was written, and the two routes come out in the WRONG ORDER:
//
//   ship-features   (built to its state)      6.9% raw pixel difference   band count off by 2
//   measure-journeys (NOT built to its state) 6.4% raw pixel difference   band count off by 0
//
// The page we know is correct is farther from its picture than the page we know is wrong, and the
// structural metric calls the wrong page a perfect match. That is not a threshold problem. The
// reference PNG is a picture of a DIFFERENT ARTIFACT: the prototype's content column is x=236
// w=1180 and the product's is x=278 w=1120, so every glyph on every route is displaced by
// construction; the PNG paints a `PROTOTYPE` badge, a `D` avatar and a `.callout.info` designer
// annotation that must never be product UI; and it is a 960px clip of designs up to 1711px tall,
// so `today.png` shows 56% of its own state. Full numbers and the four causes: the epic README, D2.
//
// So the comparison moves from PIXELS to STRUCTURE, and the source moves from the picture to the
// artifact the picture is rendered from — `console-prototype.html`, which is the file `APPROVED.md`
// hashes. Nothing moves further from the approval; it moves closer to it. The PNGs keep the job a
// picture is actually good for: they are uploaded with every CI run and put in front of a person.
//
// ── What a signature is ───────────────────────────────────────────────────────────────────────
// For one approved state: the ordered sequence of content blocks inside the content column, by
// KIND, with only the facts that survive a change of dataset — the tile count, the list's column
// words, the primary action's label, the number of small plots. Never a value, never a row count,
// never a pixel. Production holds ONE journey where `measure-journeys` draws three (epic D13-c), so
// a signature that could see data would be a signature that goes red on a correct page.
//
// The same function extracts it from the prototype and from a built route — one implementation, two
// consumers (CODE-QUALITY #2). That is the whole reason `extractSignature` takes its vocabulary as
// an argument instead of closing over it: it is serialised into two different browsers.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { openPrototype, HERE } from './_harness.mjs';
import { APPROVED_STATES } from './approved-states.mjs';
import { extractSignature, signatureArgs } from './state-contract-core.mjs';

// The vocabulary and the comparison live in `state-contract-core.mjs` — see its header for why the
// split exists. Re-exported so the one import path keeps working for anything that can take it.
export * from './state-contract-core.mjs';

const OUT = 'STATE-CONTRACT.json';

/** Read every approved state's signature out of the prototype. */
export async function readContract() {
  const { page, close } = await openPrototype();
  const errors = [];
  page.on('pageerror', (error) => errors.push(String(error)));
  const contract = {};
  try {
    for (const [name, apply] of APPROVED_STATES) {
      await page.evaluate(apply);
      await page.waitForTimeout(120);
      contract[name] = await page.evaluate(extractSignature, signatureArgs('proto'));
    }
  } finally {
    // The sibling of the fix `render-reference.mjs` records: a throw mid-loop orphans Chromium
    // until Node exits, and CI runs these back to back on one runner.
    await close();
  }
  if (errors.length > 0) {
    throw new Error(`${errors.length} page error(s) while reading the prototype:\n  ${errors.join('\n  ')}`);
  }
  const holes = Object.entries(contract).filter(([, signature]) => signature.unknown.length > 0);
  if (holes.length > 0) {
    throw new Error(
      'the block vocabulary does not cover every block the approved design draws, so these states ' +
        'would be asserted with a hole in them:\n' +
        holes.map(([name, s]) => `  ${name}: ${s.unknown.join(', ')}`).join('\n') +
        '\nAdd the missing kind to BLOCK_KINDS with BOTH selectors — never widen a selector to ' +
        'swallow it.'
    );
  }
  // ⚠️ **The proto side's `disclosures` is ASSERTED, not assumed** (fresh reviewer, Minor). The type
  // doc and `diffSignature` both state "always 0 in an approved state", and nothing checked it. A
  // future approved prototype containing a `<details>` would have been accepted into the contract
  // as `disclosures: 1` — and since `diffSignature` only ever tests `built.disclosures !== 0`, that
  // route would become permanently unmatchable. It fails closed rather than open, so it is not the
  // class this epic hunts; it is still a claim the code did not make, which is CODE-QUALITY #3.
  const withDisclosures = Object.entries(contract).filter(([, signature]) => signature.disclosures !== 0);
  if (withDisclosures.length > 0) {
    throw new Error(
      'an approved state contains a <details>, and the whole contract is written on the premise ' +
        'that none does:\n' +
        withDisclosures.map(([name, sig]) => `  ${name}: ${sig.disclosures}`).join('\n') +
        '\nIf the approved design genuinely draws one, `diffSignature` has to compare the two ' +
        'counts instead of testing the built side against zero.'
    );
  }

  const empty = Object.entries(contract).filter(
    ([, signature]) => signature.missing || signature.blocks.length === 0
  );
  if (empty.length > 0) {
    throw new Error(
      `these approved states produced an EMPTY signature, which reads exactly like a state that ` +
        `matches anything:\n  ${empty.map(([name]) => name).join(', ')}`
    );
  }
  return contract;
}

function serialise(contract) {
  return `${JSON.stringify(
    {
      _: 'GENERATED — do not hand-edit. Run: node apps/web/design-system/state-contract.mjs',
      _source: 'console-prototype.html — the states approved in APPROVED.md',
      states: contract,
    },
    null,
    2
  )}\n`;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const check = process.argv.includes('--check');
  const target = join(HERE, OUT);
  const next = serialise(await readContract());
  if (!check) {
    writeFileSync(target, next);
    console.log(`wrote ${relative(process.cwd(), target)} — ${APPROVED_STATES.length} approved states`);
  } else {
    const current = readFileSync(target, 'utf8');
    if (current === next) {
      console.log(`${OUT} reproduces from the approved prototype (${APPROVED_STATES.length} states).`);
    } else {
      console.error(
        `${OUT} does not reproduce from the approved prototype.\n` +
          'Either the prototype changed (which needs an APPROVED.md line) or this file was ' +
          'hand-edited. Regenerate with:\n  node apps/web/design-system/state-contract.mjs\n'
      );
      process.exit(1);
    }
  }
}
