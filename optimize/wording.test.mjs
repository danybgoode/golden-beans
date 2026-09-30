// wording.test.mjs — the wording harness, driven by a replay client: no key, no egress (compiled-prompts S2.1).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FIXTURES_PATH, loadRails } from '../scripts/jev-eval.mjs';
import { loadJevConfig, parseJevConfig, repoRoot } from '../scripts/lib/jev.mjs';
import { loadQuestions } from '../scripts/lib/jev-questions.mjs';
import { draftQuestions, FOLDS_PATH, parseCandidates, run, verdict } from './wording.mjs';

const fixtures = JSON.parse(readFileSync(FIXTURES_PATH, 'utf8')).prose;
const folds = JSON.parse(readFileSync(FOLDS_PATH, 'utf8'));
const questions = loadQuestions('prose');
const live = questions.find((q) => q.id === 'live');
const config = loadJevConfig({ root: repoRoot() });
const rails = await loadRails();

const cand = (name, instructions = `${live.instructions} (${name})`) => ({
  name,
  instructions,
  criteria: live.criteria,
});
const labelled = new Set(fixtures.filter((f) => f.label.includes('flag-state-claim')).map((f) => f.draft));

/** A replay client. `mode`: 'recorded' answers what the current wording got; 'oracle' answers the label. */
function client(mode) {
  const asked = [];
  const ask = async ({ state, questions: qs }) => {
    asked.push(...Object.keys(qs));
    const fx = fixtures.find((f) => f.draft === state.report_draft);
    const answers = Object.fromEntries(
      Object.keys(qs).map((id) => [
        id,
        {
          type: 'noul',
          noul: mode === 'oracle' ? (labelled.has(fx.draft) ? 0.99 : 0.01) : fx.recorded.answers[id].noul,
        },
      ])
    );
    return { ok: true, answers, model: config.model };
  };
  return { ask, asked };
}

function harness({
  candidates = [cand('a')],
  mode = 'recorded',
  cfg = config,
  confirm = true,
  cache = {},
} = {}) {
  const c = client(mode);
  const h = { out: '', err: '', reports: {}, confirmed: 0, cache, ...c };
  h.io = {
    fixtures,
    folds,
    config: cfg,
    rails,
    questions,
    readCandidates: () => ({ question: 'flag-state-claim', candidates }),
    readCache: (k) => h.cache[k] ?? null,
    writeCache: (k, v) => (h.cache[k] = structuredClone(v)),
    writeReport: (n, t) => (h.reports[n] = t),
    key: () => 'k',
    ask: c.ask,
    confirm: async () => ((h.confirmed += 1), confirm),
    stdout: (t) => (h.out += t),
    stderr: (t) => (h.err += t),
    today: '2026-09-30',
  };
  return h;
}
const ARGS = ['--rail', 'prose', '--question', 'flag-state-claim', '--candidates', 'x.json'];
const json = (h) => JSON.parse(h.reports['wording-flag-state-claim-2026-09-30.json']);

test('the harness asks the same sentences the judge asked when the fixtures were recorded', () => {
  for (const fx of fixtures) {
    const recorded = Object.keys(fx.recorded.answers)
      .filter((id) => id.endsWith('_live'))
      .sort();
    assert.deepEqual(
      draftQuestions(fx, 'live', live)
        .map((q) => q.id)
        .sort(),
      recorded,
      fx.id
    );
  }
});

test('prints the question count and asks before sending; a no sends nothing', async () => {
  const h = harness({ confirm: false });
  assert.equal(await run(ARGS, h.io), 1);
  assert.match(h.out, /To ask: 159 question\(s\) in 147 request\(s\)/);
  assert.equal(h.confirmed, 1);
  assert.deepEqual(h.asked, []);
  assert.match(h.out, /nothing sent/);
});

test('refuses without egress: true, before asking or confirming anything', async () => {
  const h = harness({ cfg: parseJevConfig({ ...config, egress: null }) });
  assert.equal(await run(ARGS, h.io), 2);
  assert.match(h.err, /egress/);
  assert.equal(h.confirmed, 0);
  assert.deepEqual(h.asked, []);
});

test('cached by wording hash: the second run asks nothing and prints the same table', async () => {
  const first = harness();
  assert.equal(await run([...ARGS, '--yes'], first.io), 0);
  assert.equal(first.asked.length, 159);
  const second = harness({ cache: first.cache });
  assert.equal(await run(ARGS, second.io), 0);
  assert.deepEqual(second.asked, []);
  assert.equal(second.confirmed, 0, 'nothing to send, so nothing to confirm');
  assert.match(second.out, /To ask: 0 question/);
  assert.deepEqual(json(second).results, json(first).results);
});

test("the current wording scores the spike's 141, and a wording that answers the same is a tie, not a win", async () => {
  const h = harness();
  assert.equal(await run([...ARGS, '--yes'], h.io), 0);
  const [cur, a] = json(h).results;
  assert.equal(cur.name, 'current');
  assert.equal(cur.total, 141);
  assert.equal(cur.family, 144);
  assert.deepEqual(a.perFold, cur.perFold);
  assert.equal(a.verdict, 'tie');
  assert.match(h.reports['wording-flag-state-claim-2026-09-30.md'], /No candidate wins/);
});

test('a wording that decides the family perfectly wins, held out on every fold', async () => {
  const h = harness({ mode: 'oracle', candidates: [cand('oracle')] });
  assert.equal(await run([...ARGS, '--yes'], h.io), 0);
  const [cur, o] = json(h).results;
  assert.equal(o.family, o.n);
  assert.ok(o.total >= cur.total + 2);
  assert.equal(o.verdict, 'wins');
  assert.match(h.reports['wording-flag-state-claim-2026-09-30.md'], /\*\*Winner: `oracle`\*\*/);
});

test('verdict (D6): a one-draft margin is a tie; a win confined to folds is unstable; ≥2 worse loses', () => {
  const cur = { total: 141, perFold: [28, 28, 28, 28, 29] };
  assert.equal(verdict({ total: 142, perFold: [29, 28, 28, 28, 29] }, cur).verdict, 'tie');
  assert.equal(verdict({ total: 143, perFold: [29, 29, 28, 28, 29] }, cur).verdict, 'wins');
  assert.equal(verdict({ total: 143, perFold: [33, 29, 27, 27, 27] }, cur).verdict, 'unstable');
  assert.equal(
    verdict({ total: 143, perFold: [31, 29, 28, 28, 27] }, cur).verdict,
    'wins',
    'worse on one fold is allowed'
  );
  assert.equal(verdict({ total: 139, perFold: [27, 27, 28, 28, 29] }, cur).verdict, 'loses');
});

test('candidates: refuses a duplicate of the current wording, a wrong question and a malformed entry', () => {
  const t = live;
  assert.throws(
    () => parseCandidates({ question: 'flag-state-claim', candidates: [cand('x', live.instructions)] }, t),
    /same wording/
  );
  assert.throws(
    () => parseCandidates({ question: 'invented-commitment', candidates: [cand('x')] }, t),
    /not "flag-state-claim"/
  );
  assert.throws(
    () =>
      parseCandidates(
        { question: 'live', candidates: [{ name: 'x', instructions: 'i', criteria: { true: 't' } }] },
        t
      ),
    /exactly \{ true, false \}/
  );
  assert.throws(
    () => parseCandidates({ question: 'live', candidates: [cand('current')] }, t),
    /not "current"/
  );
  assert.equal(parseCandidates({ question: 'live', candidates: [cand('a'), cand('b')] }, t).length, 2);
});

test('refuses when folds.json no longer matches the fixtures', async () => {
  const h = harness();
  h.io.folds = { prose: { only: 0 } };
  assert.equal(await run(ARGS, h.io), 2);
  assert.match(h.err, /folds\.json does not match/);
});

// ── review of #208 (codex + fresh reviewer) ──────────────────────────────────────────────────────────────────
test('a recording that answered the family must be stamped with this wording under this model — else refused', async () => {
  for (const bend of [
    (fx) => delete fx.recorded.questionHashes.live, // unstamped
    (fx) => (fx.recorded.model = 'jev-1.12.0'), // another model
  ]) {
    const h = harness();
    h.io.fixtures = structuredClone(fixtures);
    bend(h.io.fixtures.find((f) => Object.keys(f.recorded.answers).some((id) => id.endsWith('_live'))));
    assert.equal(await run(ARGS, h.io), 2);
    assert.match(h.err, /did not answer this wording of live/);
    assert.deepEqual(h.asked, []);
  }
  // A recording the family's gates skipped (no _live answers) has nothing to prove and is not refused.
  const skipped = fixtures.filter((f) => !Object.keys(f.recorded.answers).some((id) => id.endsWith('_live')));
  assert.ok(skipped.length > 0 && skipped.every((f) => !f.recorded.questionHashes?.live));
});

test('a cache from another model is a miss, and a partial cache re-asks exactly the drafts it lacks', async () => {
  const first = harness();
  assert.equal(await run([...ARGS, '--yes'], first.io), 0);
  const [hash] = Object.keys(first.cache);

  const bumped = harness({
    cache: { [hash]: { ...structuredClone(first.cache[hash]), model: 'jev-0.0.0' } },
  });
  assert.equal(await run([...ARGS, '--yes'], bumped.io), 0);
  assert.equal(bumped.asked.length, 159, 'every question re-asked under the pinned model');
  assert.match(bumped.out, /cache is from jev-0\.0\.0/);

  const partial = structuredClone(first.cache);
  const gone = Object.keys(partial[hash].answers).slice(0, 3);
  for (const id of gone) {
    const one = Object.keys(partial[hash].answers[id])[0];
    delete partial[hash].answers[id][one];
  }
  const again = harness({ cache: partial });
  assert.equal(await run([...ARGS, '--yes'], again.io), 0);
  assert.equal(
    again.asked.length,
    gone.reduce((s, id) => s + Object.keys(first.cache[hash].answers[id]).length, 0)
  );
  assert.deepEqual(json(again).results, json(first).results, 'refilled, then scored exactly as before');

  // A draft edited under the same id, with the same sentences asked, is re-asked, not scored on stale answers.
  const edited = harness({ cache: structuredClone(first.cache) });
  edited.io.fixtures = structuredClone(fixtures);
  const fx = edited.io.fixtures.find((f) =>
    Object.keys(f.recorded.answers).some((id) => id.endsWith('_live'))
  );
  fx.draft = fx.draft.replace(/[a-z]/i, (ch) => (ch === 'x' ? 'y' : 'x'));
  const n = Object.keys(fx.recorded.answers).filter((id) => id.endsWith('_live')).length;
  const original = fixtures.find((f) => f.id === fx.id).draft;
  const replay = edited.io.ask;
  edited.io.ask = (req) =>
    replay({
      ...req,
      state: { report_draft: req.state.report_draft === fx.draft ? original : req.state.report_draft },
    });
  assert.equal(await run([...ARGS, '--yes'], edited.io), 0);
  assert.equal(edited.asked.length, n, 'only the edited draft is re-asked');
});
