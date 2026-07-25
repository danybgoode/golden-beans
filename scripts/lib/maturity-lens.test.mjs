// maturity-lens — placing the pod on the published Steps-of-AI-Adoption ladder.
//
// This is the section a buyer's leadership reads as a position on a named external scale, so the
// tests that matter are the ones that stop it flattering us. Two in particular are stated as
// acceptance criteria in sprint-2.md and are asserted here directly:
//
//   · no row may be `met` without a resolvable evidence pointer — the renderer must be
//     STRUCTURALLY incapable of an unevidenced claim;
//   · a deliberately low-maturity fixture must score LOW — the lens must not be tuned to the shape
//     of the one repo it was developed against.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeMaturityLens, scoreVerdict, NOT_INSTRUMENTED, LADDER_CITATION } from './maturity-lens.mjs';

/** A repo doing essentially everything: reviewed, gated, parallel, agent-written, disciplined. */
const HIGH = {
  prs: Array.from({ length: 20 }, (_, i) => ({
    number: i + 1,
    createdAt: `2026-07-${String((i % 27) + 1).padStart(2, '0')}T00:00:00Z`,
    mergedAt: `2026-07-${String((i % 27) + 1).padStart(2, '0')}T04:00:00Z`,
    body: 'Risk tier: LOW\n\nCross-agent review (Antigravity): clean.',
    comments: [{ body: '### 🔎 Cross-agent review (Antigravity)\n\nNo blocking findings.' }],
    checks: [{ name: 'Static gate + build', conclusion: 'success' }],
    headRefName: `feat/thing-${i}`,
  })),
  commits: Array.from({ length: 100 }, (_, i) => ({
    sha: `sha${i}`,
    date: '2026-07-10',
    subject: `feat: thing ${i}`,
    agentCoAuthored: i < 90,
  })),
  ciCheckNames: ['Static gate + build', 'Playwright vs local Supabase'],
  hasClaudeMd: true,
  skillsProvenance: ['ways-of-work'],
};

/** A repo doing none of it: no review, no checks, no agents, no standards. */
const LOW = {
  prs: [
    {
      number: 1,
      createdAt: '2026-07-01T00:00:00Z',
      mergedAt: '2026-07-01T01:00:00Z',
      body: '',
      comments: [],
      checks: [],
      headRefName: 'main',
    },
  ],
  commits: [{ sha: 'a', date: '2026-07-01', subject: 'wip', agentCoAuthored: false }],
  ciCheckNames: [],
  hasClaudeMd: false,
  skillsProvenance: [],
};

const rowsOf = (input) => computeMaturityLens(input).rows;

test('ACCEPTANCE: no row can be `met` without a resolvable evidence pointer', () => {
  // The structural guarantee sprint-2.md demands. Checked across BOTH fixtures so it holds for a
  // row that legitimately earned `met` and for one that did not.
  for (const input of [HIGH, LOW]) {
    for (const row of rowsOf(input)) {
      assert.ok(['met', 'not_met', 'not_instrumented'].includes(row.status), `bad status: ${row.status}`);
      if (row.status === 'met') {
        assert.ok(row.evidence, `${row.criterion} is met with no evidence field`);
        const text = typeof row.evidence === 'string' ? row.evidence : JSON.stringify(row.evidence);
        assert.ok(text.length > 3, `${row.criterion} has an empty evidence pointer`);
      }
    }
  }
});

test('ACCEPTANCE: a deliberately LOW-maturity repo scores lower than a high-maturity one', () => {
  // The lens must not be tuned to the shape of the repo it was built against.
  const high = computeMaturityLens(HIGH).verdict;
  const low = computeMaturityLens(LOW).verdict;
  assert.ok(low.step < high.step, `low (${low.step}) must score below high (${high.step})`);
  assert.ok(low.metCriteria < high.metCriteria);
});

test('ACCEPTANCE: the verdict ALWAYS travels with the not-instrumented count', () => {
  // Coverage can never be hidden by the score, because they are returned from the same call — a
  // renderer cannot show one without having the other in hand.
  for (const input of [HIGH, LOW, {}]) {
    const { verdict } = computeMaturityLens(input);
    assert.equal(typeof verdict.step, 'number');
    assert.equal(typeof verdict.notInstrumentedCount, 'number');
    assert.ok(
      verdict.notInstrumentedCount >= NOT_INSTRUMENTED.length,
      'the fixed v1 gaps must always be included in the count'
    );
  }
});

test('every not-instrumented gap names a reason AND the guardrail that would close it', () => {
  // The epic's design: an honest gap doubles as the upsell. A gap without its remedy is an apology.
  assert.ok(NOT_INSTRUMENTED.length >= 6);
  for (const row of NOT_INSTRUMENTED) {
    assert.ok(row.label, 'every gap needs a label');
    assert.ok((row.reason ?? '').length > 15, `${row.label} needs a real reason`);
    assert.ok((row.guardrail ?? '').length > 10, `${row.label} must name what would fix it`);
  }
});

test('every derived row states its PROXY nature where it is one', () => {
  // A Co-Authored-By trailer ratio is a proxy for "the agent wrote most of the code", not proof.
  const row = rowsOf(HIGH).find((r) => /most of the code/i.test(r.criterion));
  assert.ok(row, 'the trailer-ratio criterion must exist');
  const text = `${row.proxyNote ?? ''}${row.note ?? ''}${row.interpretation ?? ''}`;
  assert.match(text, /proxy/i, 'the trailer-ratio row must admit it is a proxy');
});

test('the ladder citation is version-pinned, so an old report stays interpretable', () => {
  assert.ok(LADDER_CITATION.title);
  assert.ok(LADDER_CITATION.author);
  assert.ok(LADDER_CITATION.date, 'without a date, a future ladder revision silently rescores history');
  const { ladder } = computeMaturityLens(HIGH);
  assert.deepEqual(ladder, LADDER_CITATION);
});

test('an EMPTY input scores step 0 and claims nothing', () => {
  // The pathological case: no data must never produce a flattering position.
  const { verdict, rows } = computeMaturityLens({});
  assert.equal(verdict.step, 0);
  assert.equal(rows.filter((r) => r.status === 'met').length, 0);
});

test('the lens is DETERMINISTIC — same input, byte-identical output, twice', () => {
  assert.equal(JSON.stringify(computeMaturityLens(HIGH)), JSON.stringify(computeMaturityLens(HIGH)));
  assert.equal(JSON.stringify(computeMaturityLens({})), JSON.stringify(computeMaturityLens({})));
});

test('scoreVerdict never reports a step above what the evidence supports', () => {
  // A row set with nothing met cannot yield a positive step, whatever the ladder logic does.
  const allUnmet = [
    { criterion: 'a', status: 'not_met', ladderStep: 2 },
    { criterion: 'b', status: 'not_instrumented', ladderStep: 3 },
  ];
  assert.equal(scoreVerdict(allUnmet).step, 0);
  assert.ok(scoreVerdict(allUnmet).notInstrumentedCount >= NOT_INSTRUMENTED.length);
});
