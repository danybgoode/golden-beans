// jev-eval.test.mjs — the replay harness and the shadow rot guard (jev-semantic-guards S1.4).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  coverageFailures,
  evaluate,
  expiredShadowRails,
  FIXTURES_PATH,
  loadRails,
  MIN_FIXTURES,
  replayAsk,
} from './jev-eval.mjs';
import { loadJevConfig, parseJevConfig, repoRoot } from './lib/jev.mjs';

test('expiredShadowRails: a shadow rail past its date is named; a live one and an off one are not', () => {
  const c = parseJevConfig({
    rails: {
      review: { mode: 'shadow', shadowExpires: '2026-01-01' },
      prose: { mode: 'shadow', shadowExpires: '2099-01-01' },
    },
  });
  assert.deepEqual(expiredShadowRails(c, '2026-09-22'), [
    { rail: 'review', shadowExpires: '2026-01-01', why: 'past its shadowExpires' },
    { rail: 'prose', shadowExpires: '2099-01-01', why: 'more than 21 days out' },
  ]);
  const fine = parseJevConfig({ rails: { review: { mode: 'shadow', shadowExpires: '2026-10-13' } } });
  assert.deepEqual(expiredShadowRails(fine, '2026-09-22'), [], 'exactly 21 days out is allowed');
  assert.deepEqual(expiredShadowRails(fine, '2026-10-13'), [], 'the expiry day itself still runs');
  assert.deepEqual(expiredShadowRails(parseJevConfig({}), '2099-12-31'), []);
});

test('replayAsk: answers only from the recording; a missing answer is could-not-look (a stale fixture)', async () => {
  const ask = replayAsk({ model: 'jev-1.13.0', answers: { a: { type: 'noul', noul: 1 } } });
  assert.equal((await ask({ questions: { a: {} } })).answers.a.noul, 1);
  const r = await ask({ questions: { a: {}, b: {} } });
  assert.equal(r.state, 'could-not-look');
  assert.match(r.error, /no recording for b/);
});

test('evaluate: a replay that disagrees with its recorded decision is a failure', async () => {
  const rail = {
    run: async (fx, deps) => ({
      ok: (await deps.ask({ questions: { q: {} } })).answers.q.noul > 0.5,
      decider: 'jev',
    }),
    regex: () => false,
    predicted: (d) => d.ok,
    expected: (fx) => fx.label,
    summary: (d) => ({ ok: d.ok, decider: d.decider }),
  };
  const fx = (noul, recordedOk) => ({
    id: `n${noul}`,
    label: true,
    recorded: { model: 'jev-1.13.0', answers: { q: { type: 'noul', noul } } },
    decision: { ok: recordedOk, decider: 'jev' },
  });
  const { failures, report } = await evaluate({
    fixtures: { review: [fx(0.9, true), fx(0.1, true)] },
    rails: { review: rail },
    config: parseJevConfig({}),
  });
  assert.equal(failures.length, 1);
  assert.match(failures[0], /review\/n0.1/);
  assert.equal(report.review.jevRight, 1);
  assert.equal(report.review.regexRight, 0);
});

test('the committed fixtures replay clean against the committed judges', async () => {
  const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8'));
  const rails = await loadRails();
  const { failures } = await evaluate({ fixtures, rails, config: loadJevConfig({ root: repoRoot() }) });
  assert.deepEqual([...failures, ...coverageFailures(fixtures, rails)], []);
});

test('coverageFailures: fixtures with no judge fail (a renamed judge must not go green); a thin judge fails', () => {
  assert.match(coverageFailures({ review: [{}] }, {})[0], /no judge to replay them/);
  assert.match(coverageFailures({ review: [{}] }, { review: {} })[0], new RegExp(`≥${MIN_FIXTURES}`));
  assert.deepEqual(
    coverageFailures({ review: [] }, {}),
    [],
    'no judge and no fixtures is a clean pre-judge checkout'
  );
});

test('evaluate: a recording made by a different model than the pinned one is stale — offline replay fails', async () => {
  const rail = {
    run: async () => ({ ok: true }),
    regex: () => true,
    predicted: (d) => d.ok,
    expected: () => true,
    summary: (d) => ({ ok: d.ok }),
  };
  const { failures } = await evaluate({
    fixtures: {
      review: [
        { id: 'old', label: true, recorded: { model: 'jev-1.12.0', answers: {} }, decision: { ok: true } },
      ],
    },
    rails: { review: rail },
    config: parseJevConfig({}),
  });
  assert.match(failures[0], /recorded by jev-1.12.0, config pins jev-1.13.0/);
});
