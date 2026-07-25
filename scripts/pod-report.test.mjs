// pod-report — the gatherer's adapter layer.
//
// The adapter is where a real dishonesty crept in and had to be fixed, so it is what is tested
// here. The lens reads `reviewComments[].isAgentReviewer` and `ciCheckNames`; `gh` returns
// `comments[]` and `statusCheckRollup[]`. Handing the lens gh's raw shape meant it saw 98 pull
// requests with no review data and reported the practice as ABSENT — `not_met`, which asserts
// something strictly stronger than "not measured". Understating the pod is still a false claim.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalisePrForLens, parseRiskTier, windowDays, BENCHMARKS, buildArtifact } from './pod-report.mjs';

test('an agent review comment is detected by BODY, never by author identity', () => {
  // Forced by the data, not a preference: these comments are posted under the human maintainer's
  // own account, so there is no bot login to filter on. Filtering by author would find zero
  // reviewed PRs across a repo that reviews most of them.
  const pr = normalisePrForLens({
    number: 1,
    comments: [
      { author: { login: 'danybgoode' }, body: '### 🔎 Cross-agent review (Antigravity)\n\nNo findings.' },
      { author: { login: 'danybgoode' }, body: 'looks good to me' },
    ],
  });
  assert.equal(pr.reviewComments[0].isAgentReviewer, true, 'a human-posted agent review still counts');
  assert.equal(pr.reviewComments[1].isAgentReviewer, false, 'ordinary chatter must not count');
});

test('every reviewer-comment shape this repo actually produces is recognised', () => {
  for (const body of [
    '### 🔎 Cross-agent review (Antigravity)',
    '## Fresh-reviewer findings — disposition',
    'This is the judgment-layer review, not a second CI',
  ]) {
    const pr = normalisePrForLens({ number: 1, comments: [{ body }] });
    assert.equal(pr.reviewComments[0].isAgentReviewer, true, `missed: ${body}`);
  }
});

test('gh check names are mapped to the field the lens actually reads', () => {
  const pr = normalisePrForLens({
    number: 2,
    statusCheckRollup: [{ name: 'guards' }, { name: 'inflight' }, { notAName: true }],
  });
  assert.deepEqual(
    pr.ciCheckNames,
    ['guards', 'inflight'],
    'nameless entries are dropped, not passed as undefined'
  );
});

test('a PR with no comments or checks yields empty arrays, never undefined fields', () => {
  // The lens distinguishes "absent" from "empty"; the adapter must not blur that by emitting
  // undefined where gh simply returned nothing for this PR.
  const pr = normalisePrForLens({ number: 3 });
  assert.deepEqual(pr.reviewComments, []);
  assert.deepEqual(pr.ciCheckNames, []);
});

test('windowDays measures the real span and never returns zero for a live repo', () => {
  assert.equal(windowDays([{ date: '2026-06-06' }, { date: '2026-07-25' }]), 49);
  // A single-day repo is one day, not zero — a zero window would make every per-week rate null.
  assert.equal(windowDays([{ date: '2026-07-25' }]), 1);
  assert.equal(windowDays([]), 0);
  assert.equal(windowDays([{ date: 'garbage' }]), 0);
});

test('benchmarks are CITED and linked, never republished', () => {
  assert.ok(BENCHMARKS.length >= 3);
  for (const b of BENCHMARKS) {
    assert.ok(b.id && b.label, 'every benchmark needs an identity');
    assert.match(b.url, /^https:\/\//, 'a citation without a link is not a citation');
    assert.ok(b.note.length > 20, 'state what the published level is, and that it is cited');
  }
});

test('the artifact always carries its caveats, whatever it is built from', () => {
  // The renderer cannot drop what it never had to opt into.
  const a = buildArtifact({ delivery: {}, source: {}, generatedAt: 'x' });
  assert.ok(a.caveats.length >= 3);
  assert.ok(a.caveats.some((c) => /not instrumented/i.test(c)));
  assert.ok(a.caveats.some((c) => /published benchmarks/i.test(c)));
  assert.equal(a.schemaVersion, 1);
});

test('the maturity section is included only when computed, never as an empty shell', () => {
  assert.equal(buildArtifact({ delivery: {}, source: {}, generatedAt: 'x' }).maturity, undefined);
  assert.ok(
    buildArtifact({ delivery: {}, source: {}, generatedAt: 'x', maturity: { verdict: {} } }).maturity
  );
});

// ── Regressions from cross-review round 2 (PR #32) ──────────────────────────────────────────
// The adapter dropped three fields the gatherer was already fetching, so the risk-tier and
// self-verification criteria read `not_instrumented` on every real repo and the ladder was capped
// at step 1. The same bug class as round 1 — fetch the data, forget to map it — in a second place.

test('the adapter maps riskTier, mergedByIsAgent and ciPassedBeforeMerge', () => {
  const pr = normalisePrForLens({
    number: 1,
    mergedAt: '2026-07-01T00:00:00Z',
    mergedBy: { login: 'danybgoode', is_bot: false },
    body: 'Risk tier: HIGH\n\nSome description.',
    statusCheckRollup: [{ name: 'ci', conclusion: 'SUCCESS' }],
  });
  assert.equal(pr.riskTier, 'HIGH');
  assert.equal(pr.mergedByIsAgent, false);
  assert.equal(pr.ciPassedBeforeMerge, true);
});

test('both risk-tier spellings in the dataset are parsed', () => {
  // This repo's template writes `Risk tier:`; the sibling roadmap docs write `**Risk:** LOW`.
  assert.equal(parseRiskTier('Risk tier: LOW'), 'LOW');
  assert.equal(parseRiskTier('- [x] **Risk tier:** HIGH'), 'HIGH');
  assert.equal(parseRiskTier('**Risk:** MED'), 'MED');
  assert.equal(parseRiskTier('**Risk:** MEDIUM'), 'MED', 'MEDIUM normalises to MED');
  assert.equal(parseRiskTier('risk TIER : high'), 'HIGH', 'case and spacing are tolerated');
});

test('an UNDECLARED risk tier is undefined — never guessed, never defaulted', () => {
  // Coverage is partial by nature: many PR bodies declare no tier. Undefined means "not measured"
  // to the lens; any default would be a claim the body does not support.
  assert.equal(parseRiskTier('no tier here'), undefined);
  assert.equal(parseRiskTier(''), undefined);
  assert.equal(parseRiskTier(null), undefined);
  assert.equal(parseRiskTier(undefined), undefined);
});

test('a PR with NO checks reports ciPassedBeforeMerge as undefined, not false', () => {
  // "This PR ran no checks" and "we don't know whether checks passed" are different facts, and
  // `false` would assert the first.
  assert.equal(normalisePrForLens({ number: 1, statusCheckRollup: [] }).ciPassedBeforeMerge, undefined);
  assert.equal(normalisePrForLens({ number: 1 }).ciPassedBeforeMerge, undefined);
  // A failing check is a real false.
  assert.equal(
    normalisePrForLens({ number: 1, statusCheckRollup: [{ name: 'ci', conclusion: 'FAILURE' }] })
      .ciPassedBeforeMerge,
    false
  );
});

test('an UNMERGED pr has no merged-by verdict', () => {
  assert.equal(normalisePrForLens({ number: 1, mergedBy: { is_bot: true } }).mergedByIsAgent, undefined);
});
