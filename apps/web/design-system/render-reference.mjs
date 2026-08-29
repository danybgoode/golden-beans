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
import { APPROVED_STATES } from './approved-states.mjs';

const DIR = join(HERE, 'reference');
mkdirSync(DIR, { recursive: true });

const { browser, page } = await openPrototype();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
for (const [name, fn] of APPROVED_STATES) {
  await page.evaluate(fn);
  await page.waitForTimeout(250);
  await page.screenshot({ path: join(DIR, `${name}.png`) });
  console.log(`  + apps/web/design-system/reference/${name}.png`);
}
await browser.close();
if (errors.length) {
  console.error(`\n${errors.length} page error(s) while rendering:`);
  errors.forEach((e) => console.error('  ' + e));
  process.exit(1);
}
console.log(`\n${APPROVED_STATES.length} reference states rendered at 1440x960 @2x, zero page errors.`);
