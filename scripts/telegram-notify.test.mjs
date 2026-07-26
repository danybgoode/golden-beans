// Tests for scripts/telegram-notify.mjs — the CI/CD Telegram ping.
//
// This rail has been broken twice in ways a green CI run hid, so these tests target the two failure
// modes specifically rather than the happy path: a payload Telegram REJECTS, and a delivery failure
// that reports success.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildNotification, send } from './telegram-notify.mjs';
import { TELEGRAM_LIMIT } from './lib/telegram-text.mjs';

const base = {
  chatId: '-100123',
  repo: 'golden-beans',
  sha: 'abc1234def5678',
  icon: '📦',
  subject: 'feat(pod-report): the surface renders',
  meta: 'by @danybgoode',
  status: '',
  url: 'https://github.com/danybgoode/golden-beans/commit/abc1234',
  linkLabel: 'view diff',
};

test('an ordinary push builds a complete, well-formed payload', () => {
  const p = buildNotification(base);
  assert.equal(p.chat_id, '-100123');
  assert.equal(p.parse_mode, 'HTML');
  assert.equal(p.disable_web_page_preview, true);
  assert.match(p.text, /golden-beans · 📦 · <code>abc1234<\/code>/);
  assert.match(p.text, /feat\(pod-report\): the surface renders/);
  assert.match(p.text, /by @danybgoode/);
  assert.match(p.text, /<a href="https:\/\/github\.com\/[^"]+">view diff<\/a>/);
});

test('the sha is shortened to 7 characters, not printed whole', () => {
  assert.match(buildNotification(base).text, /<code>abc1234<\/code>/);
  assert.equal(buildNotification(base).text.includes('abc1234def5678'), false);
});

test('the href is NOT double-encoded — the bug that rejected every ping this rail ever sent', () => {
  // The original built text in one `jq -n` pass and the body in a second, so Telegram received a
  // literal `href=\"…\"` and answered 400 "can't parse entities" for the workflow's entire life,
  // behind a green check. This is the assertion that would have caught it on day one.
  const p = buildNotification(base);
  assert.equal(p.text.includes('\\"'), false, 'backslash-escaped quotes leaked into the text');
  assert.match(p.text, /href="https/);
});

test('HTML metacharacters from a commit subject are escaped, never passed through', () => {
  const p = buildNotification({ ...base, subject: 'fix: handle <script> & "quotes" > here' });
  assert.match(p.text, /&lt;script&gt;/);
  assert.match(p.text, /&amp;/);
  assert.equal(/<script>/.test(p.text), false);
});

test('only the FIRST line of a multi-line commit message is used', () => {
  const p = buildNotification({ ...base, subject: 'feat: the subject\n\nA long body.\nAnd more.' });
  assert.match(p.text, /feat: the subject/);
  assert.equal(p.text.includes('A long body'), false);
});

// ── The length guard, and the exact input that proved a previous version of it wrong ───────────

test('a runaway single-line subject stays under Telegram’s cap', () => {
  const p = buildNotification({ ...base, subject: 'x'.repeat(20_000) });
  assert.ok(p.text.length <= TELEGRAM_LIMIT, `text is ${p.text.length} chars`);
});

test('an ENTITY-HEAVY subject stays under the cap — capping the raw length is not enough', () => {
  // This is the case that killed the first attempt at this guard. A jq version capped the RAW subject
  // at 3,500 characters; 3,500 `>` characters escape to `&gt;` and become 14,129 — nearly 3.5x the
  // limit. escapeToFit bounds the ESCAPED length by shrinking the raw budget and re-checking, which
  // is the only order that is correct.
  for (const ch of ['>', '<', '&']) {
    const p = buildNotification({ ...base, subject: ch.repeat(20_000) });
    assert.ok(
      p.text.length <= TELEGRAM_LIMIT,
      `a subject of ${ch.repeat(3)}… produced ${p.text.length} chars`
    );
  }
});

test('truncation sacrifices the SUBJECT and keeps the structure', () => {
  // The sha and the link are what make a ping actionable. Trimming them to fit a runaway subject
  // would discard what the reader needs and keep what caused the problem.
  const p = buildNotification({ ...base, subject: '&'.repeat(20_000) });
  assert.match(p.text, /<code>abc1234<\/code>/);
  assert.match(p.text, /<a href="https:\/\/github\.com\/[^"]+">view diff<\/a>/);
  assert.match(p.text, /by @danybgoode/);
});

test('an absent meta or status line is OMITTED, not rendered blank', () => {
  const p = buildNotification({ ...base, meta: '', status: '' });
  assert.equal(/\n\n/.test(p.text), false, 'a blank line means an absent field was rendered');
  assert.equal(p.text.split('\n').length, 3, 'head + subject + link only');
});

test('a deploy-shaped ping carries its status line and its own link label', () => {
  const p = buildNotification({
    ...base,
    icon: '🚀',
    meta: '',
    status: '✅ READY',
    linkLabel: 'open deployment',
  });
  assert.match(p.text, /🚀/);
  assert.match(p.text, /✅ READY/);
  assert.match(p.text, /open deployment<\/a>/);
});

test('a URL containing an ampersand is escaped for an HTML attribute', () => {
  const p = buildNotification({ ...base, url: 'https://example.com/x?a=1&b=2' });
  assert.match(p.text, /href="https:\/\/example\.com\/x\?a=1&amp;b=2"/);
});

// ── Delivery reporting: "the job ran" and "the message arrived" must stay different facts ──────

test('send() reports Telegram’s own verdict, not the HTTP call’s success', async () => {
  // The whole incident this rail is famous for: curl exited 0, Telegram had rejected the message, and
  // the workflow reported success. A 200-with-ok:false must read as a failure here.
  const rejected = await send('tok', { text: 'x' }, async () => ({
    json: async () => ({ ok: false, error_code: 400, description: "can't parse entities" }),
  }));
  assert.equal(rejected.ok, false);
  assert.match(rejected.description, /parse entities/);

  const accepted = await send('tok', { text: 'x' }, async () => ({ json: async () => ({ ok: true }) }));
  assert.equal(accepted.ok, true);
});

test('a thrown network error becomes an ok:false result, never an exception', async () => {
  const r = await send('tok', { text: 'x' }, async () => {
    throw new Error('ETIMEDOUT');
  });
  assert.equal(r.ok, false);
  assert.match(r.description, /ETIMEDOUT/);
});

test('an unparseable response body is a failure, not an empty success', async () => {
  const r = await send('tok', { text: 'x' }, async () => ({
    json: async () => {
      throw new Error('not json');
    },
  }));
  assert.equal(r.ok, false);
});
