// Unit tests for commit-report.mjs's pure core.
//
// What's worth testing here is narrow and specific: the two places this script can silently produce
// something WRONG rather than fail loudly.
//
//   1. Truncate-then-escape ordering. Get it backwards and you slice an HTML entity in half, which
//      Telegram answers with a 400 for the entire message — the prose is lost and the only clue is
//      an error body nobody reads. A test pins the order because the bug is invisible locally.
//   2. summarizeAreas / extractStoryContext feed the model its only understanding of WHO a change
//      affects. If they silently return nothing, the model still produces confident, plausible,
//      contentless prose — the worst failure mode available, because it looks like success.
//
// The model call itself is not tested (it's a network call to a foreign CLI) and neither is the
// Telegram post — those degrade loudly by design.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  escapeHtml,
  truncateWords,
  escapeToFit,
  resolveTarget,
  summarizeAreas,
  extractStoryContext,
  buildPrompt,
  buildTelegramMessage,
  TELEGRAM_LIMIT,
} from './commit-report.mjs';

test('escapeHtml covers exactly the three entities Telegram HTML mode needs', () => {
  assert.equal(escapeHtml('a & b < c > d'), 'a &amp; b &lt; c &gt; d');
  // Ampersand must be escaped FIRST or the entities it introduces get double-escaped.
  assert.equal(escapeHtml('<a>&</a>'), '&lt;a&gt;&amp;&lt;/a&gt;');
  // Quotes are deliberately NOT escaped — they're legal in Telegram HTML text nodes, and escaping
  // them would render literal &quot; to the reader.
  assert.equal(escapeHtml(`it's "fine"`), `it's "fine"`);
  assert.equal(escapeHtml(null), '');
  assert.equal(escapeHtml(undefined), '');
});

test('truncateWords leaves short text untouched and never exceeds the budget', () => {
  assert.equal(truncateWords('short', 100), 'short');
  const long = 'word '.repeat(100).trim();
  const cut = truncateWords(long, 20);
  assert.ok(cut.length <= 20, `expected <= 20 chars, got ${cut.length}`);
  assert.ok(cut.endsWith('…'));
});

test('truncateWords breaks on a word boundary, not mid-word', () => {
  // Asserted as an exact value on purpose. A "does it look clean" regex cannot tell "bravo…"
  // (a correct break) from "brav…" (a mid-word cut) — both are a letter followed by an ellipsis.
  // The only honest check is the whole expected string.
  assert.equal(truncateWords('alpha bravo charlie delta', 15), 'alpha bravo…');
  assert.equal(truncateWords('alpha bravo charlie delta', 21), 'alpha bravo charlie…');
});

test('truncateWords falls back to a hard cut when there is no usable space', () => {
  // A single long token has no space to break on; a word-boundary-only implementation would
  // return just "…" and lose the content entirely.
  const cut = truncateWords('aaaaaaaaaaaaaaaaaaaaaaaaa', 10);
  assert.ok(cut.length <= 10);
  assert.ok(cut.length > 1, 'must not collapse to a bare ellipsis');
});

test('escapeToFit bounds the ESCAPED length, not the raw length', () => {
  // The bug this function exists for. `escapeHtml(truncateWords(t, 1000))` on ampersand-heavy text
  // returns ~5,000 characters, because each & becomes 5. Only a post-escape length check catches it.
  const hostile = '& '.repeat(4000);
  const out = escapeToFit(hostile, 1000);
  assert.ok(out.length <= 1000, `expected <= 1000 escaped chars, got ${out.length}`);
  assert.ok(out.length > 100, 'must not over-trim to almost nothing');
  assert.equal(out.match(/&(?!amp;|lt;|gt;)/g), null, 'no half-written entity');
});

test('escapeToFit is a no-op pass-through for ordinary short prose', () => {
  // The common case must not be degraded by the pathological one: no ellipsis, no trimming.
  const plain = 'Tenants can now push their roadmap and see it rendered.';
  assert.equal(escapeToFit(plain, 4096), plain);
});

test('buildTelegramMessage keeps the whole payload inside Telegram’s cap for hostile input', () => {
  // The regression this exists for: escaping expands text, so truncating the RAW prose to the
  // budget still overflowed — 3,696 raw chars of "& " came out at 11,231 escaped, ~3x the ceiling.
  // Telegram answers that with a 400 for the entire message and the prose is lost.
  const prose = `${'& '.repeat(4000)}end`;
  const msg = buildTelegramMessage({
    shortSha: 'abc1234',
    subject: 'feat: something',
    prose,
    url: 'https://example.com/c/abc',
    model: 'gpt-oss-120b-medium',
  });
  assert.ok(msg.length <= TELEGRAM_LIMIT, `message must fit Telegram's cap, got ${msg.length}`);
  // Every & in the output must be the start of a complete entity — the tell for a mid-entity cut.
  const dangling = msg.match(/&(?!amp;|lt;|gt;)/g);
  assert.equal(dangling, null, `found a truncated HTML entity: ${JSON.stringify(dangling)}`);
});

test('buildTelegramMessage escapes a hostile commit subject rather than emitting raw markup', () => {
  const msg = buildTelegramMessage({
    shortSha: 'abc1234',
    subject: 'fix: <script>alert(1)</script> & more',
    prose: 'A short report.',
    url: 'https://example.com',
    model: 'm',
  });
  assert.ok(!msg.includes('<script>'), 'raw <script> must never reach the payload');
  assert.ok(msg.includes('&lt;script&gt;'));
});

test('resolveTarget precedence: range beats sha beats HEAD', () => {
  assert.deepEqual(resolveTarget({}), { kind: 'commit', ref: 'HEAD' });
  assert.deepEqual(resolveTarget({ sha: 'abc' }), { kind: 'commit', ref: 'abc' });
  assert.deepEqual(resolveTarget({ range: 'a..b' }), { kind: 'range', ref: 'a..b' });
  assert.deepEqual(resolveTarget({ sha: 'abc', range: 'a..b' }), { kind: 'range', ref: 'a..b' });
});

test('summarizeAreas maps paths to product-facing areas, most-touched first', () => {
  const areas = summarizeAreas([
    'apps/web/lib/one.ts',
    'apps/web/lib/two.ts',
    'apps/web/lib/three.ts',
    'apps/web/app/api/v1/track/route.ts',
    'apps/web/supabase/migrations/20260101_x.sql',
  ]);
  assert.equal(areas[0], 'server-side application logic (3 files)');
  assert.ok(areas.includes('public API routes (1 file)'));
  assert.ok(areas.includes('database schema (1 file)'));
  // Singular/plural matters: this text goes straight into the model's prompt.
  assert.ok(
    areas.some((a) => a.endsWith('(1 file)')),
    'expected singular "file" for a count of 1'
  );
});

test('summarizeAreas orders api/dashboard/pages rules from most to least specific', () => {
  // All three start with `apps/web/app/`. If the generic rule were tested first, an API route
  // would be reported as a "public web page" — telling the model the wrong audience entirely.
  assert.deepEqual(summarizeAreas(['apps/web/app/api/v1/track/route.ts']), ['public API routes (1 file)']);
  assert.deepEqual(summarizeAreas(['apps/web/app/app/funnel/page.tsx']), [
    'signed-in dashboard pages (1 file)',
  ]);
  assert.deepEqual(summarizeAreas(['apps/web/app/page.tsx']), ['public web pages (1 file)']);
});

test('summarizeAreas buckets an unrecognized path as "other" instead of dropping it', () => {
  // Dropping it would understate the change's size to the model; "other" is honest.
  assert.deepEqual(summarizeAreas(['weird/place/thing.txt']), ['other (1 file)']);
  assert.deepEqual(summarizeAreas([]), []);
});

test('extractStoryContext pulls story headings and story fields from ADDED diff lines only', () => {
  const diff = [
    'diff --git a/Roadmap/x/sprint-1.md b/Roadmap/x/sprint-1.md',
    '+++ b/Roadmap/x/sprint-1.md',
    '+### Story 1.1 — Report artifacts',
    '+**As a** tenant, **I want** to push my roadmap, **so that** the engine renders it.',
    '-### Story 0.9 — a REMOVED heading',
    ' ### Story 0.8 — an untouched context line',
    '+some ordinary added prose that is not a story field',
  ].join('\n');
  const out = extractStoryContext(diff);
  assert.ok(out.includes('Story 1.1 — Report artifacts'));
  assert.ok(out.some((l) => l.startsWith('**As a**')));
  // A removed heading is not what this commit asserted about the product.
  assert.ok(!out.some((l) => l.includes('0.9')), 'removed lines must be ignored');
  // Nor is unchanged context.
  assert.ok(!out.some((l) => l.includes('0.8')), 'context lines must be ignored');
  assert.ok(!out.some((l) => l.includes('ordinary added prose')), 'non-story prose must be ignored');
});

test('extractStoryContext never mistakes the +++ file header for content', () => {
  // `+++ b/path` starts with '+' — a naive startsWith('+') check leaks the filename into the
  // prompt, which is precisely the thing the prompt forbids the model from talking about.
  const out = extractStoryContext('+++ b/Roadmap/### Story fake.md\n+### Story 2.1 — real');
  assert.deepEqual(out, ['Story 2.1 — real']);
});

test('extractStoryContext de-dupes and caps, so a huge doc diff cannot blow the argv budget', () => {
  const many = Array.from({ length: 80 }, (_, i) => `+### Story ${i}.1 — s${i}`).join('\n');
  assert.equal(extractStoryContext(many).length, 25);
  assert.deepEqual(extractStoryContext('+### Story 1.1 — dup\n+### Story 1.1 — dup'), ['Story 1.1 — dup']);
  assert.deepEqual(extractStoryContext(''), []);
  assert.deepEqual(extractStoryContext(null), []);
});

test('buildPrompt orders style → change → intent → instruction, and omits an empty intent block', () => {
  const base = {
    style: 'STYLE_BLOCK',
    meta: { ref: 'abc1234', author: 'Someone', date: '2026-07-25', message: 'feat: thing' },
    areas: ['public API routes (1 file)'],
    stat: '1 file changed',
  };
  const withIntent = buildPrompt({ ...base, storyContext: ['Story 1.1 — X'] });
  assert.ok(withIntent.startsWith('STYLE_BLOCK'), 'the style brief must lead');
  assert.ok(withIntent.indexOf('## The change') < withIntent.indexOf('Product intent'));
  assert.ok(withIntent.trimEnd().endsWith('sixty words maximum.'), 'the length rule must be last');

  const without = buildPrompt({ ...base, storyContext: [] });
  assert.ok(
    !without.includes('Product intent'),
    'an empty intent block must be omitted, not left as a stub header'
  );
});

test('buildPrompt states the no-files rule beside the area list', () => {
  // The area labels are the one place file locations enter the prompt at all, so the prohibition
  // has to travel with them — not just live in the style block far above.
  const p = buildPrompt({
    style: 's',
    meta: { ref: 'a', author: 'b', date: 'c', message: 'd' },
    areas: ['internal tooling (2 files)'],
    storyContext: [],
    stat: 'x',
  });
  assert.match(p, /do NOT name files/i);
});
