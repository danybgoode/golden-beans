#!/usr/bin/env node
// render-reference.mjs — render the 32 APPROVED states from the committed prototype.
//
// Baselines are DERIVED, never stored: a checked-in PNG drifts from the design it claims to
// represent and nobody notices. Re-run this to regenerate `apps/web/design-system/reference/*.png` (gitignored).
//
//   node apps/web/design-system/render-reference.mjs
//
// The state ids are the CONTRACT and they live in `approved-states.mjs`, because three things read
// them and only this one needs a browser. Every story in sprints 2-6 cites an id,
// `route-manifest.ts` maps a route to one, and `console-visual.authed.spec.ts` asserts the built
// route against the state of the same id.
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { openPrototype, HERE } from './_harness.mjs';
import { ALL_STATE_IDS, STATE_SOURCES } from './approved-states.mjs';

const DIR = join(HERE, 'reference');
mkdirSync(DIR, { recursive: true });

const errors = [];
// One browser per approved artifact (experiments-for-humans D12).
for (const [source, states] of STATE_SOURCES) {
const { page, close } = await openPrototype(source);
page.on('pageerror', (e) => errors.push(`${source}: ${String(e)}`));
try {
  for (const [name, fn] of states) {
    await page.evaluate(fn);
    await page.waitForTimeout(250);
    // ⚠️ **FULL PAGE — epic `mockups-as-built`, D9.** This shot was the VIEWPORT, so eleven of the
    // approved states were cropped at 960px: `today` is 1711px tall, `ship-activity` 1274, and the
    // picture of `today` showed 56% of its own design. The disclosure `mockups-as-built` Story 2.4
    // deletes sits below that fold, so the reference could not see the thing it was being used to
    // check. Free to change because these PNGs are DERIVED and gitignored — there is no committed
    // baseline to migrate.
    await page.screenshot({ path: join(DIR, `${name}.png`), fullPage: true });
    console.log(`  + apps/web/design-system/reference/${name}.png`);
  }
} finally {
  // ⚠️ The SIBLING of a fix already applied to `measure-contract.mjs` — and it was left behind
  // (cross-family review, agy). A throw mid-loop orphaned Chromium until Node exited, and CI runs
  // this immediately after that script on the same runner. "When a review finds a bug, fix the
  // CLASS or you will be told about it once per instance" (Roadmap/LEARNINGS.md) — this is the
  // instance I did not sweep for.
  await close();
}
}
if (errors.length) {
  console.error(`\n${errors.length} page error(s) while rendering:`);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log(`\n${ALL_STATE_IDS.length} reference states rendered at 1440x960 @2x, zero page errors.`);
