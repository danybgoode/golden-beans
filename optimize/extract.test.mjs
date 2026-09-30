// extract.test.mjs — the Node half of the refit's parity check (compiled-prompts S1.3). CI runs no Python (D4), so
// the property the Python fit rests on — the reduction reproduces the real judge — is pinned here, in node --test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIXTURES_PATH, loadRails } from '../scripts/jev-eval.mjs';
import { loadJevConfig, repoRoot } from '../scripts/lib/jev.mjs';
import { PROSE_FAMILIES } from '../scripts/lib/prose-guard.mjs';
import { extract, parity, proseDecision, reviewDecision } from './extract.mjs';

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
const base = loadJevConfig({ root: repoRoot() });
let cached;
const stats = async () =>
  (cached ??= await extract({ fixtures, rails: await loadRails(), base, families: PROSE_FAMILIES }));

test('the reduction reproduces the real judges on every fixture at every grid threshold', async () => {
  const s = await stats();
  assert.equal(s.review.length, fixtures.review.length);
  assert.equal(s.prose.length, fixtures.prose.length);
  assert.ok(s.parity.checks > 10_000, `${s.parity.checks} checks`);
  assert.equal(s.parity.mismatches, 0, s.parity.first.join('; '));
});

test("at the hand thresholds the statistics give the spike's counts: review 76, prose 141", async () => {
  const s = await stats();
  assert.equal(s.review.filter((x) => reviewDecision(x, s.thresholds) === x.label).length, 76);
  assert.equal(
    s.prose.filter((x) => JSON.stringify(proseDecision(x, s.thresholds.claim)) === JSON.stringify(x.label))
      .length,
    141
  );
});

test('the parity check can fail: a statistic nudged off the judge is caught', async () => {
  const s = await stats();
  const i = s.prose.findIndex((x) => x.stats['flag-state-claim'] !== null);
  const bent = structuredClone(s.prose);
  bent[i].stats['flag-state-claim'] = null; // the judge raises it; the reduction now says it never would
  const r = await parity({ fixtures, rails: await loadRails(), base, review: s.review, prose: bent });
  assert.ok(r.mismatches.length > 0);
  assert.match(r.mismatches[0], new RegExp(`^prose/${s.prose[i].id} at `));
});

test("reviewDecision keeps the rail's band: pass at ≥ real, fail at ≤ notReal (inclusive), regex between", () => {
  const t = { real: 0.85, notReal: 0.3 };
  assert.equal(reviewDecision({ noul: 0.85, regexOk: false }, t), true);
  assert.equal(reviewDecision({ noul: 0.3, regexOk: true }, t), false);
  assert.equal(reviewDecision({ noul: 0.5, regexOk: true }, t), true);
  assert.equal(reviewDecision({ noul: null, regexOk: false }, t), false);
});
