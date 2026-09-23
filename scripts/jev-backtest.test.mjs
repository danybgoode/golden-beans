// jev-backtest.test.mjs — the pure half of the backtest (jev-semantic-guards S2.3).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harvest, jevVerdict, renderReport, stripComment } from './jev-backtest.mjs';

const COMMENT =
  '### 🔎 Cross-agent review (Codex)\n\n> banner\n\n_codex 0.155.1._\n\n---\n\n## Blocking\n- `a.mjs:3` — bug.\n\n<!-- cross-review lens=general sha=abc -->\n<!-- jev:{"mode":"shadow"} -->';

test('stripComment recovers the reviewer reply: no header, no markers; a non-review comment is null', () => {
  assert.equal(stripComment(COMMENT), '## Blocking\n- `a.mjs:3` — bug.');
  assert.equal(
    stripComment('### 🔐 Cross-agent review — security lens (Antigravity)\n\n---\n\nClean.'),
    'Clean.'
  );
  assert.equal(stripComment('LGTM'), null);
});

test('jevVerdict: real / not-real / uncertain / could-not-look at the thresholds, inclusive', () => {
  const t = { real: 0.85, notReal: 0.15 };
  assert.deepEqual(
    [0.85, 0.15, 0.5, null, NaN].map((n) => jevVerdict(n, t)),
    ['real', 'not-real', 'uncertain', 'could-not-look', 'could-not-look']
  );
});

test('harvest keeps only cross-review comments and throws on a gh failure', () => {
  const spawn = () => ({
    status: 0,
    stdout: `${JSON.stringify({ url: 'u1', created: 'c', body: COMMENT })}\n${JSON.stringify({ url: 'u2', created: 'c', body: 'plain' })}\n`,
  });
  const got = harvest('o/r', { spawn });
  assert.deepEqual(
    got.map((c) => [c.url, c.repo]),
    [['u1', 'o/r']]
  );
  assert.throws(() => harvest('o/r', { spawn: () => ({ status: 1, stderr: 'HTTP 404' }) }), /HTTP 404/);
});

test('renderReport states the corpus bias and tables only real disagreements', () => {
  const rows = [
    {
      repo: 'o/r',
      url: 'u1',
      regexOk: true,
      noul: 0.05,
      severity: 'clean',
      verdict: 'not-real',
      firstLine: 'x | y',
    },
    {
      repo: 'o/r',
      url: 'u2',
      regexOk: true,
      noul: 0.95,
      severity: 'nit',
      verdict: 'real',
      firstLine: 'fine',
    },
    {
      repo: 'o/r',
      url: 'u3',
      regexOk: true,
      noul: 0.5,
      severity: 'nit',
      verdict: 'uncertain',
      firstLine: 'hmm',
    },
  ];
  const md = renderReport({
    rows,
    date: 'D',
    thresholds: { real: 0.85, notReal: 0.15 },
    model: 'm',
    repos: ['o/r'],
  });
  assert.match(md, /Corpus bias/);
  assert.match(md, /\| 3 \| 3 \| 1 \| 1 \| 1 \| 0 \| 1 \|/);
  assert.match(md, /\(u1\) \| review \| not-real \(0\.05\)/);
  assert.match(md, /x \\\| y/, 'pipes escaped');
  assert.ok(!md.includes('(u2) |'), 'agreement is not a disagreement row');
});

test('the harvest jq filter tolerates a null comment body (agy, golden-beans #159)', () => {
  let args = null;
  harvest('o/r', { spawn: (cmd, a) => ((args = a), { status: 0, stdout: '' }) });
  const jq = args[args.indexOf('--jq') + 1];
  assert.match(jq, /select\(\(\.body \/\/ ""\) \| test\(/);
});
