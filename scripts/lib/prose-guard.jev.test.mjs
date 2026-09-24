// prose-guard.jev.test.mjs — judgeProse (jev-semantic-guards S3.1, D4/D6). A separate file on purpose:
// prose-guard.test.mjs stays BYTE-IDENTICAL, the proof that the regex fallback (`checkProse`) did not move.
// Jev is injected; nothing here touches the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  checkProse,
  decideProse,
  judgeProse,
  PROSE_CHUNK,
  proseQuestions,
  proseUnits,
  SEMANTIC_CODES,
  semanticNote,
} from './prose-guard.mjs';
import { parseJevConfig } from './jev.mjs';
import { _resetAsked } from './config.mjs';

const cfg = (mode) =>
  parseJevConfig({
    rails: { prose: { mode, ...(mode === 'shadow' ? { shadowExpires: '2099-01-01' } : {}) } },
  });

/** An ask that answers every question with noul from `score(sentence, familyKey)`. */
const jevSays = (score) => {
  const calls = [];
  const ask = async ({ questions }) => {
    calls.push(questions);
    const answers = {};
    for (const [id, q] of Object.entries(questions)) {
      const fam = id.split('_').pop();
      answers[id] = { type: 'noul', noul: score(q.instructions.sentence, fam) };
    }
    return { ok: true, model: 'jev-1.13.0', answers };
  };
  return { ask, calls };
};
const logs = () => {
  const lines = [];
  return { log: (e) => lines.push(e), lines };
};
const codes = (r) => r.findings.map((f) => f.code);
const NEGATION = 'Most of today went into the delivery rail rather than anything a shopper would see.';
const PARAPHRASED_DEADLINE = 'Design needs to bless the new layout before the Thursday demo.';

test('off: exactly checkProse — no call, no log line (the kill-switch, D11)', async () => {
  for (const [draft, ev] of [
    ['Tenants now benefit from a faster suite.', {}],
    ['The review is due by Friday.', { allowsBeneficiary: true, minWords: 1 }],
    ['', {}],
  ]) {
    const { ask, calls } = jevSays(() => 0.99);
    const { log, lines } = logs();
    const v = await judgeProse(draft, ev, { config: cfg('off'), key: 'k', ask, log });
    assert.deepEqual({ ok: v.ok, findings: v.findings }, checkProse(draft, ev));
    assert.equal(v.decider, 'regex');
    assert.equal(calls.length + lines.length, 0);
  }
});

test('shadow: checkProse decides, Jev is asked, both are logged', async () => {
  const { ask } = jevSays((s, fam) => (fam === 'commitment' ? 0.95 : 0.02));
  const { log, lines } = logs();
  const ev = { allowsFixClaim: true, allowsBeneficiary: true, minWords: 1 };
  const v = await judgeProse(PARAPHRASED_DEADLINE, ev, { config: cfg('shadow'), key: 'k', ask, log });
  assert.deepEqual(codes(v), [], 'the regex misses the paraphrase, and in shadow the regex decides');
  assert.deepEqual(v.jevCodes, ['invented-commitment']);
  assert.equal(lines.length, 1);
  assert.deepEqual([lines[0].rail, lines[0].mode, lines[0].decider], ['prose', 'shadow', 'regex']);
  assert.deepEqual([lines[0].regex, lines[0].jev], [[], ['invented-commitment']]);
});

test('jev: an honest negation the regex family would flag passes; a paraphrase it misses is caught', async () => {
  const { ask } = jevSays(() => 0.03);
  const v = await judgeProse(NEGATION, { minWords: 1 }, { config: cfg('jev'), key: 'k', ask, log: () => {} });
  assert.equal(v.ok, true);
  assert.equal(v.decider, 'jev');
  const { ask: ask2 } = jevSays((s, fam) => (fam === 'commitment' ? 0.95 : 0.02));
  const ev = { allowsFixClaim: true, allowsBeneficiary: true, minWords: 1 };
  const w = await judgeProse(PARAPHRASED_DEADLINE, ev, {
    config: cfg('jev'),
    key: 'k',
    ask: ask2,
    log: () => {},
  });
  assert.deepEqual(codes(w), ['invented-commitment']);
  assert.match(w.findings[0].note, /The sentence: "Design needs to bless/);
});

test('jev: the mechanical rules still come from checkProse', async () => {
  const { ask } = jevSays(() => 0.01);
  const draft = 'This seamlessly leverages the Playwright suite and the checks now run on every change and';
  const v = await judgeProse(draft, { minWords: 1 }, { config: cfg('jev'), key: 'k', ask, log: () => {} });
  assert.deepEqual(codes(v).sort(), ['marketing-language', 'names-implementation', 'unfinished'].sort());
});

test('evidence still gates families: an allowed fix or beneficiary is never even asked', () => {
  const units = proseUnits('A. B.');
  const all = proseQuestions(units, {}).map((q) => q.family);
  assert.deepEqual([...new Set(all)], SEMANTIC_CODES);
  const gated = proseQuestions(units, { allowsFixClaim: true, allowsBeneficiary: true }).map((q) => q.family);
  assert.deepEqual(
    [...new Set(gated)],
    ['flag-state-claim', 'invented-commitment'],
    'commitment is never gated'
  );
});

test('liveness: Jev says the sentence ASSERTS it; code decides whether liveFlags CORROBORATE it', async () => {
  const { ask } = jevSays((s, fam) => (fam === 'live' ? 0.97 : 0.01));
  const draft = 'A shop owner can now hand a partner one shop instead of the whole account.';
  const ev = { allowsBeneficiary: true, minWords: 1 };
  const off = await judgeProse(
    draft,
    { ...ev, liveFlags: [] },
    { config: cfg('jev'), key: 'k', ask, log: () => {} }
  );
  assert.deepEqual(codes(off), ['flag-state-claim']);
  const on = await judgeProse(
    draft,
    { ...ev, liveFlags: ['promoter.partner_handoff_enabled'] },
    {
      config: cfg('jev'),
      key: 'k',
      ask,
      log: () => {},
    }
  );
  assert.deepEqual(codes(on), []);
});

test('could-not-look: every family falls back to the regex, and the decider says so', async () => {
  const ask = async () => ({ ok: false, state: 'could-not-look', error: 'HTTP 529' });
  const { log, lines } = logs();
  const draft = 'Tenants now benefit from a faster suite.';
  const v = await judgeProse(draft, {}, { config: cfg('jev'), key: 'k', ask, log });
  assert.deepEqual(codes(v), codes(checkProse(draft, {})));
  assert.equal(v.decider, 'jev+regex');
  assert.equal(lines[0].error, 'HTTP 529');
});

test('an invalid noul for a family makes THAT family fall back — the others stay Jev-decided', () => {
  const units = ['The review is due by Friday.'];
  const questions = proseQuestions(units, { allowsFixClaim: true, allowsBeneficiary: true });
  const answers = { s0_live: 0.01, s0_commitment: 'high' };
  const d = decideProse({ units, questions, answers, evidence: {}, threshold: 0.5 });
  assert.deepEqual(d.unanswered, ['invented-commitment']);
  assert.deepEqual(d.findings, []);
});

test('a long draft is chunked into parallel calls of at most PROSE_CHUNK questions', async () => {
  const draft = Array.from({ length: 70 }, (_, i) => `Sentence number ${i} is plain.`).join(' ');
  const { ask, calls } = jevSays(() => 0.01);
  const v = await judgeProse(
    draft,
    { maxWords: 4000, minWords: 1 },
    { config: cfg('jev'), key: 'k', ask, log: () => {} }
  );
  assert.equal(v.ok, true);
  assert.equal(calls.length, Math.ceil((70 * 4) / PROSE_CHUNK));
  assert.ok(calls.every((c) => Object.keys(c).length <= PROSE_CHUNK));
});

test('proseUnits: bullets are separate units, list markers stripped, empty lines dropped', () => {
  assert.deepEqual(proseUnits('- no customer-visible effect\n- users now benefit from faster publishing'), [
    'no customer-visible effect',
    'users now benefit from faster publishing',
  ]);
});

test('semanticNote is held to checkProse’s own text — the notes cannot drift apart', () => {
  const trig = {
    'unsupported-fix-claim': ['The leak is now closed.', { allowsBeneficiary: true, minWords: 1 }],
    'invented-beneficiary': ['Tenants now benefit from a faster suite.', { minWords: 1 }],
    'invented-commitment': ['The review is due by Friday.', { allowsBeneficiary: true, minWords: 1 }],
    'flag-state-claim': [
      'The portfolio is live.',
      { allowsBeneficiary: true, minWords: 1, liveFlags: ['a.b_enabled'] },
    ],
  };
  for (const [code, [draft, ev]] of Object.entries(trig)) {
    const regexNote = checkProse(draft, ev).findings.find((f) => f.code === code).note;
    assert.equal(semanticNote(code, { liveFlags: ev.liveFlags ?? [], sentence: draft }), regexNote, code);
  }
});

test('one chunk failing does not discard what Jev found in the chunks that answered (fresh review, PR #36)', async () => {
  const filler = Array.from({ length: 40 }, (_, i) => `Plain sentence ${i} is here.`).join(' ');
  const draft = `${PARAPHRASED_DEADLINE} ${filler}`;
  let call = 0;
  const ask = async ({ questions }) => {
    call++;
    if (call === 2) return { ok: false, state: 'could-not-look', error: 'HTTP 529' };
    const answers = {};
    for (const [id, q] of Object.entries(questions))
      answers[id] = {
        noul: /Thursday demo/.test(q.instructions.sentence) && id.endsWith('_commitment') ? 0.95 : 0.01,
      };
    return { ok: true, model: 'jev-1.13.0', answers };
  };
  const v = await judgeProse(
    draft,
    { maxWords: 4000, minWords: 1 },
    { config: cfg('jev'), key: 'k', ask, log: () => {} }
  );
  assert.ok(
    codes(v).includes('invented-commitment'),
    'the caught paraphrase survives a failed sibling chunk'
  );
  assert.ok(v.jevCodes.includes('invented-commitment'), 'and shadow data records it');
  assert.equal(v.decider, 'jev+regex');
});

test('proseUnits: a markdown heading is structure, never a unit Jev is asked about', () => {
  assert.deepEqual(proseUnits('## What shipped\n\nThe rail is live.'), ['The rail is live.']);
});

test('egress not answered (null): the regex decides, why names it, and nothing is asked of Jev (D12)', async () => {
  _resetAsked();
  const config = parseJevConfig({ egress: null, rails: { prose: { mode: 'jev' } } });
  let asked = 0;
  const r = await judgeProse('The flag is on in production.', {}, {
    config,
    key: 'k',
    ask: async () => {
      asked += 1;
      return { ok: false };
    },
    write: () => {},
    log: () => {},
  });
  assert.equal(r.decider, 'regex');
  assert.equal(r.why, 'egress not answered');
  assert.equal(asked, 0);
  _resetAsked();
});
