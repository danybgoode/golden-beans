import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { render, stepsBody, REWRITES, SOURCE } from './render-skills-ci.mjs';

const real = readFileSync(new URL(`../${SOURCE}`, import.meta.url), 'utf8');

test('the real skills workflow renders, with no checkout reference left unrewritten', () => {
  const out = render(real);
  const steps = out.slice(out.indexOf('echo "mirror tree:'));
  assert.doesNotMatch(steps, /\$GITHUB_WORKSPACE|origin\/\$BASE_REF/);
  assert.match(out, /--base "\$MIRROR_BASE"/);
  assert.match(out, /git subtree split --prefix=skills HEAD/);
});

test('every skills step after setup-node is carried over verbatim (names in the same order)', () => {
  const names = (t) => [...t.matchAll(/^ {6}- name: (.+)$/gm)].map((m) => m[1]);
  const out = render(real);
  const carried = names(stepsBody(real));
  assert.ok(carried.length > 10, 'the skills job should have its full step list');
  assert.deepEqual(names(out).slice(-carried.length), carried);
});

test('a new step that names the checkout fails the render instead of running against the wrong tree', () => {
  const extra = real + '\n      - name: new\n        run: node "$GITHUB_WORKSPACE/x.mjs"\n';
  assert.throws(() => render(extra), /expected 3/);
});

test('a rewrite that no longer matches fails loudly', () => {
  const gone = real.replace(REWRITES[0].from, 'something-else');
  assert.throws(() => render(gone), /expected 1/);
});

test('a source without the setup-node step is refused', () => {
  assert.throws(() => stepsBody('jobs: {}\n'), /setup-node/);
});
