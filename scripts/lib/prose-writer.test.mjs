// prose-writer — the routing + guard-and-retry orchestration.
//
// Every writer here is injected, so these tests never touch a network or a CLI. What they pin is
// the POLICY: who is tried in what order, what happens to a rejected draft, and — most importantly
// — that a draft which never satisfies the guard is still returned to the caller WITH its findings
// rather than silently swallowed or silently passed off as clean.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planWriters, writeProse, buildWriterPrompt, runCodex } from './prose-writer.mjs';

const CLEAN =
  'Whoever ships next gets faster feedback, and a whole class of mistake is caught before it lands.';
const DIRTY = 'Tenants are delighted that the bug is fixed.';

const okWriter = (text) => () => ({ ok: true, text });
const failWriter = (error) => () => ({ ok: false, text: '', error });
const silent = () => {};

test('planWriters: DEVIN leads, agy follows — the division of labour, expressed as policy', () => {
  // Devin is the dedicated prose writer so that agy's and Codex's quota stays free for review and
  // building. This assertion is the policy: if it changes, every report in the repo changes writer.
  // It was briefly reversed while diagnosing a lost register — the cause turned out to be PROSE_MODEL
  // pointing at a Gemini slug, not the router, so the order is back where it was designed.
  assert.deepEqual(planWriters({ devinAvailable: true, agyAvailable: true }), ['devin', 'agy']);
});

test('planWriters: codex is the third and last quota pool', () => {
  assert.deepEqual(
    planWriters({ devinAvailable: true, agyAvailable: true, codexAvailable: true }),
    ['devin', 'agy', 'codex']
  );
  assert.deepEqual(
    planWriters({ devinAvailable: false, agyAvailable: false, codexAvailable: true }),
    ['codex']
  );
});

test('planWriters: devin carries it alone when agy is missing (a real, separate quota pool)', () => {
  assert.deepEqual(planWriters({ devinAvailable: true, agyAvailable: false }), ['devin']);
});

test('planWriters: agy carries it alone when devin is missing', () => {
  assert.deepEqual(planWriters({ devinAvailable: false, agyAvailable: true }), ['agy']);
});

test('planWriters: an explicit preference wins, and yields nothing when unavailable', () => {
  assert.deepEqual(planWriters({ devinAvailable: true, agyAvailable: true, preferred: 'agy' }), ['agy']);
  assert.deepEqual(planWriters({ devinAvailable: false, agyAvailable: true, preferred: 'devin' }), []);
});

test('a clean first draft is returned immediately, with one attempt', () => {
  const r = writeProse(
    { prompt: 'p', evidence: {} },
    { devin: okWriter(CLEAN), agy: failWriter('should not be reached'), has: () => true, warn: silent }
  );
  assert.equal(r.ok, true);
  assert.equal(r.writer, 'devin');
  assert.equal(r.attempts, 1);
});

test('a rejected draft is RETRIED with the findings, not discarded', () => {
  // The core behaviour: the guard's job is to trigger a correction, not merely to say no.
  const prompts = [];
  const writer = (prompt) => {
    prompts.push(prompt);
    return { ok: true, text: prompts.length === 1 ? DIRTY : CLEAN };
  };
  // BOTH writers stubbed, always. This test previously stubbed only `devin` and relied on devin
  // running first, so the day the router order flipped it reached the REAL agy CLI and hung for two
  // minutes. A unit test that can invoke a network CLI when a policy constant changes is a trap for
  // whoever changes the constant.
  const r = writeProse(
    { prompt: 'BASE', evidence: {} },
    { agy: writer, devin: writer, has: () => true, warn: silent }
  );

  assert.equal(r.ok, true);
  assert.equal(r.attempts, 2);
  assert.equal(r.text, CLEAN);
  // The retry prompt must carry the rejected draft AND the numbered findings, or the writer is
  // just guessing again.
  assert.match(prompts[1], /Your previous draft/);
  assert.match(prompts[1], /Tenants are delighted/);
  assert.match(prompts[1], /^\d+\./m);
});

test('a writer that FAILS is skipped without burning its retry on a revision note', () => {
  // A broken CLI is not fixed by being told its prose was bad; move to the next writer instead.
  // Written against the FIRST writer in the router rather than a named one, so it keeps testing the
  // behaviour ("a failed writer is not retried") and not the current order.
  let firstCalls = 0;
  const failing = () => {
    firstCalls++;
    return { ok: false, text: '', error: 'the lead writer exploded' };
  };
  const r = writeProse(
    { prompt: 'p', evidence: {} },
    { devin: failing, agy: okWriter(CLEAN), has: () => true, warn: silent }
  );
  assert.equal(firstCalls, 1, 'a failed writer must not be retried');
  assert.equal(r.ok, true);
  assert.equal(r.writer, 'agy', 'the fallback picked it up');
});

test('runs agy alone when devin is not installed at all', () => {
  const r = writeProse(
    { prompt: 'p', evidence: {} },
    { devin: failWriter('never called'), agy: okWriter(CLEAN), has: (c) => c === 'agy', warn: silent }
  );
  assert.equal(r.ok, true);
  assert.equal(r.writer, 'agy');
});

test('falls back to DEVIN when agy is not installed at all', () => {
  // The complement, and the one that matters after the router flip: agy leads now, so "the fallback
  // still works" is a different assertion than it was, and the old suite did not make it.
  const r = writeProse(
    { prompt: 'p', evidence: {} },
    { agy: failWriter('never called'), devin: okWriter(CLEAN), has: (c) => c === 'devin', warn: silent }
  );
  assert.equal(r.ok, true);
  assert.equal(r.writer, 'devin');
});

test('a draft that never satisfies the guard is STILL RETURNED, flagged, never silently passed', () => {
  // The most important case. Returning nothing would make the caller fail closed with no output to
  // learn from; returning it as `ok` would launder a known-bad draft into the channel. So: return
  // it, with ok:false and the findings attached, and let the caller surface them.
  const r = writeProse(
    { prompt: 'p', evidence: {} },
    {
      devin: okWriter(DIRTY),
      agy: okWriter(DIRTY),
      codex: okWriter(DIRTY),
      has: () => true,
      warn: silent,
    }
  );
  assert.equal(r.ok, false);
  assert.equal(r.text, DIRTY, 'the draft must be handed back for a human to fix');
  assert.ok(r.guard.findings.length > 0, 'and it must carry the reasons');
  assert.ok(r.guard.findings.some((f) => f.code === 'invented-beneficiary'));
});

test('runCodex sends the evidence prompt on stdin and trims its result', () => {
  let call;
  const r = runCodex('the full evidence pack', {
    run: (directive, stdin) => {
      call = { directive, stdin };
      return { ok: true, text: '  Finished report.  ' };
    },
  });
  assert.equal(call.stdin, 'the full evidence pack');
  assert.ok(call.directive.length < 200);
  assert.deepEqual(r, { ok: true, text: 'Finished report.', model: 'codex' });
});

test('runCodex does not retry an authentication lapse', () => {
  const r = runCodex('p', {
    run: () => ({ ok: false, text: '', authFailed: true, stderr: 'session ended' }),
  });
  assert.equal(r.ok, false);
  assert.equal(r.retryable, false);
});

test('no writer available is an honest failure, not an empty success', () => {
  const r = writeProse({ prompt: 'p', evidence: {} }, { has: () => false, warn: silent });
  assert.equal(r.ok, false);
  assert.equal(r.text, '');
  assert.match(r.error, /no prose writer available/);
});

test('buildWriterPrompt orders style → lessons → task, and omits an empty lessons block', () => {
  const withLessons = buildWriterPrompt({ style: 'STYLE', lessons: 'LESSON', task: 'TASK' });
  assert.ok(withLessons.indexOf('STYLE') < withLessons.indexOf('LESSON'));
  assert.ok(withLessons.indexOf('LESSON') < withLessons.indexOf('TASK'));
  assert.match(withLessons, /Lessons from previous drafts/);

  const without = buildWriterPrompt({ style: 'STYLE', lessons: '', task: 'TASK' });
  assert.ok(!without.includes('Lessons from previous drafts'), 'an empty lessons block must be omitted');
});
