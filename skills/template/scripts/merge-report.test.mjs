// merge-report.test.mjs — the exactly-once guarantee and the evidence derivation. Pure: no git, no
// network, no writer.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitsToReport,
  summarizeAreas,
  buildTask,
  deriveEvidence,
  buildMessage,
  readState,
} from './merge-report.mjs';

// ---- the exactly-once guarantee ----
//
// The hook over-fires by design (a pull that fetched nothing, a second pull, a rebase, any checkout).
// If this logic is wrong the channel gets the same report repeatedly, which is the failure the whole
// state file exists to prevent.

test('no new commits → nothing to report (the common case on an over-firing hook)', () => {
  assert.deepEqual(commitsToReport({ lastSha: 'abc', head: 'abc', listBetween: () => [] }), []);
});

test('a fresh install reports only HEAD — never the whole history', () => {
  // Walking all of history on first run would spray the channel. Same "a missing baseline is a
  // bounded no-op, never 'everything happened'" rule the standup learned the hard way.
  const calls = [];
  const out = commitsToReport({ lastSha: null, head: 'head1', listBetween: (...a) => (calls.push(a), []) });
  assert.deepEqual(out, ['head1']);
  assert.equal(calls.length, 0, 'must not even walk the range without a baseline');
});

test('a normal advance reports every commit between, oldest first', () => {
  const out = commitsToReport({ lastSha: 'a', head: 'd', listBetween: () => ['b', 'c', 'd'] });
  assert.deepEqual(out, ['b', 'c', 'd']);
});

test('an unreachable baseline (force-push/rebase) falls back to HEAD, not an unrelated range', () => {
  assert.deepEqual(commitsToReport({ lastSha: 'gone', head: 'h', listBetween: () => null }), ['h']);
  assert.deepEqual(commitsToReport({ lastSha: 'gone', head: 'h', listBetween: () => [] }), ['h']);
});

test('readState rejects a corrupt state file rather than treating garbage as a sha', () => {
  assert.equal(readState({ exists: () => true, read: () => 'not-a-sha!!', path: '/x' }), null);
  assert.equal(readState({ exists: () => false, read: () => '', path: '/x' }), null);
  assert.equal(readState({ exists: () => true, read: () => 'deadbeef\n', path: '/x' }), 'deadbeef');
});

// ---- areas: shape only, never paths ----
//
// The persona forbids naming files, so the writer must never receive one.

test('summarizeAreas maps paths to human areas and dedupes', () => {
  const areas = summarizeAreas([
    'Roadmap/README.md',
    'Roadmap/LEARNINGS.md',
    'scripts/x.mjs',
    'apps/web/app/page.tsx',
    'src/api/store/route.ts',
    'supabase/migrations/1_x.sql',
  ]);
  assert.ok(areas.includes('product/roadmap docs'));
  assert.ok(areas.includes('internal delivery tooling'));
  assert.ok(areas.includes('customer-facing pages'));
  assert.ok(areas.includes('commerce API routes'));
  assert.ok(areas.includes('the database schema'));
  assert.equal(areas.filter((a) => a === 'product/roadmap docs').length, 1, 'must dedupe');
});

test('buildTask never leaks a file path to the writer', () => {
  const commit = { subject: 's', body: '', files: [] };
  const task = buildTask(commit, summarizeAreas(['scripts/secret-name.mjs', 'Roadmap/x.md']));
  assert.doesNotMatch(task, /secret-name/);
  assert.match(task, /never name a file/);
});

test('buildTask includes the commit body — the richest input available', () => {
  const task = buildTask({ subject: 's', body: 'WHY-MARKER: chose X over Y', files: [] }, []);
  assert.match(task, /WHY-MARKER/);
});

// ---- evidence: derived, and closed by default ----

test('a non-fix commit does not permit fix language', () => {
  assert.equal(deriveEvidence({ subject: 'feat: add a thing', body: '' }, []).allowsFixClaim, false);
});

test('a real fix: subject permits it', () => {
  assert.equal(deriveEvidence({ subject: 'fix(checkout): stop a double charge', body: '' }, []).allowsFixClaim, true);
});

test('customer language is permitted only when a customer-visible area was touched', () => {
  assert.equal(deriveEvidence({ subject: 's', body: '' }, ['internal delivery tooling']).allowsBeneficiary, false);
  assert.equal(deriveEvidence({ subject: 's', body: '' }, ['customer-facing pages']).allowsBeneficiary, true);
});

test('liveFlags stays EMPTY unless the commit itself says a flag was turned on', () => {
  // Most merges here ship dark. An empty liveFlags is what makes flag-state-claim meaningful.
  assert.deepEqual(deriveEvidence({ subject: 'feat: build the rail', body: 'ships behind a flag' }, []).liveFlags, []);
  assert.ok(
    deriveEvidence({ subject: 'chore: flip', body: 'promoter.activation_crm_enabled flag is flipped on' }, []).liveFlags.length > 0
  );
});

test('the merge surface forbids structural markdown — it is a chat message', () => {
  assert.equal(deriveEvidence({ subject: 's', body: '' }, []).allowsMarkdown, false);
});

// ---- the posted message ----

test('buildMessage labels a flagged draft so a human can see it did not converge', () => {
  const commit = { subject: 'feat: x', short: 'abc1234' };
  const clean = buildMessage({ commit, prose: 'p', guardOk: true, writer: 'devin', model: 'devin' });
  const flagged = buildMessage({ commit, prose: 'p', guardOk: false, writer: 'agy', model: 'gpt-oss' });
  assert.doesNotMatch(clean, /FLAGGED/);
  assert.match(flagged, /FLAGGED/);
});

test('buildMessage escapes HTML in the subject — a commit message is untrusted input to Telegram', () => {
  const msg = buildMessage({
    commit: { subject: 'fix: <script>alert(1)</script> & more', short: 'abc1234' },
    prose: 'p',
    guardOk: true,
    writer: 'devin',
    model: 'devin',
  });
  assert.doesNotMatch(msg, /<script>/);
  assert.match(msg, /&lt;script&gt;/);
  assert.match(msg, /&amp; more/);
});

test('buildMessage names the writer and model, so the channel records who wrote it', () => {
  const msg = buildMessage({
    commit: { subject: 's', short: 'abc1234' },
    prose: 'p',
    guardOk: true,
    writer: 'agy',
    model: 'gpt-oss-120b-medium',
  });
  assert.match(msg, /agy\/gpt-oss-120b-medium/);
});

test('loadChatId: the merge surface, then the project chat, then TELEGRAM_CHAT_ID; no config falls back to env', async () => {
  const { loadChatId } = await import('./merge-report.mjs');
  const { ReportingConfigError } = await import('./lib/reporting-config.mjs');
  const cfg = (telegram) => () => ({ telegram: { chatId: null, chatIds: {}, ...telegram } });
  assert.equal(loadChatId({ load: cfg({ chatIds: { merge: 'm' }, chatId: 'p' }), env: { TELEGRAM_CHAT_ID: 'e' } }), 'm');
  assert.equal(loadChatId({ load: cfg({ chatId: 'p' }), env: { TELEGRAM_CHAT_ID: 'e' } }), 'p');
  assert.equal(loadChatId({ load: () => { throw new ReportingConfigError('absent'); }, env: { TELEGRAM_CHAT_ID: 'e' } }), 'e');
  assert.equal(loadChatId({ load: () => { throw new ReportingConfigError('absent'); }, env: {} }), null);
});
