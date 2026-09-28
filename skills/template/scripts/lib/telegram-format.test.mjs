// telegram-format.test.mjs — pure-logic coverage for the shared Telegram message-length safety nets
// (formatPrList, truncateForTelegram), used by both standup.mjs and weekly-recap.mjs.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPrList,
  formatTelegramHtmlLink,
  telegramHtmlToConsoleText,
  telegramHtmlVisibleLength,
  telegramHtmlVisibleText,
  truncateForTelegram,
} from './telegram-format.mjs';

// ---- formatPrList ----

test('formatPrList: under the cap → lists every PR, no "more" tail', () => {
  const prs = [
    { number: 1, title: 'a' },
    { number: 2, title: 'b' },
  ];
  assert.equal(formatPrList(prs, 12), '#1 a; #2 b');
});

test('formatPrList: over the cap → truncates the list and appends an exact remainder count', () => {
  const prs = Array.from({ length: 15 }, (_, i) => ({ number: i + 1, title: `pr${i + 1}` }));
  const out = formatPrList(prs, 12);
  assert.match(out, /#12 pr12; …and 3 more$/);
  assert.doesNotMatch(out, /#13/);
});

// ---- HTML links ----

test('formatTelegramHtmlLink: escapes visible label and href for Telegram HTML', () => {
  assert.equal(
    formatTelegramHtmlLink('open deck <weekly>', 'https://example.test/#md=abc&present=0'),
    '<a href="https://example.test/#md=abc&amp;present=0">open deck &lt;weekly&gt;</a>'
  );
});

test('telegramHtmlVisibleText/Length count the short label, not the long href payload', () => {
  const href = `https://example.test/#md=${'x'.repeat(1000)}&present=0`;
  const html = `Deck standup: ${formatTelegramHtmlLink('open daily story', href)}`;
  assert.equal(telegramHtmlVisibleText(html), 'Deck standup: open daily story');
  assert.equal(telegramHtmlVisibleLength(html), 'Deck standup: open daily story'.length);
});

test('telegramHtmlToConsoleText shows hrefs during dry-run output', () => {
  const html = `<b>Standup</b>\nDeck standup: ${formatTelegramHtmlLink('open daily story', 'https://example.test/#md=abc&present=0')}`;
  assert.equal(
    telegramHtmlToConsoleText(html),
    'Standup\nDeck standup: open daily story (https://example.test/#md=abc&present=0)'
  );
});

// ---- truncateForTelegram ----

test('truncateForTelegram: under the limit → unchanged', () => {
  assert.equal(truncateForTelegram('short', 4096), 'short');
});

test('truncateForTelegram: over the limit → cut with an ellipsis, length bounded', () => {
  const long = 'x'.repeat(5000);
  const out = truncateForTelegram(long, 4096);
  assert.ok(out.length <= 4096);
  assert.ok(out.endsWith('…'));
});

test('truncateForTelegram: an unclosed <b> after truncation gets auto-closed (valid HTML), and the FINAL length (incl. the closing tag) still respects the limit', () => {
  const text = `${'x'.repeat(90)}<b>${'y'.repeat(90)}`; // <b> opened, never closed, spans the cut
  const out = truncateForTelegram(text, 100);
  const opens = (out.match(/<b>/g) || []).length;
  const closes = (out.match(/<\/b>/g) || []).length;
  assert.equal(opens, closes);
  assert.ok(out.length <= 100, `expected <=100 chars (incl. the appended </b>), got ${out.length}`);
});

test('truncateForTelegram: appending closing tags must never push the result back OVER the limit — the exact overflow the naive version had', () => {
  // Every character up to the limit is inside an unclosed <b> — the naive "slice then append </b>"
  // approach would land at exactly `limit` chars BEFORE the closing tag, then overshoot by 4 once
  // "</b>" is appended. The fix must shrink the cut point so the room for "</b>" is reserved up front.
  const text = `<b>${'y'.repeat(5000)}`;
  const out = truncateForTelegram(text, 100);
  assert.ok(out.length <= 100, `expected <=100 chars, got ${out.length}`);
  const opens = (out.match(/<b>/g) || []).length;
  const closes = (out.match(/<\/b>/g) || []).length;
  assert.equal(opens, closes);
});

test('truncateForTelegram: the cut landing INSIDE a tag itself (a dangling "<b") never leaves a stray "<" in the output', () => {
  const text = `${'x'.repeat(97)}<b>`; // length 100; slice(0,99) lands after "<b", missing the ">"
  const out = truncateForTelegram(text, 100);
  assert.doesNotMatch(out, /<(?!\/?b>)/); // no "<" except as part of a complete <b> or </b>
});

test('truncateForTelegram: the cut landing mid-"</b>" (a dangling "</b") also never leaves a stray fragment', () => {
  const text = `${'x'.repeat(50)}<b>${'y'.repeat(43)}</b>`; // slice(0,99) lands after "</b", missing the ">"
  const out = truncateForTelegram(text, 100);
  assert.doesNotMatch(out, /<(?!\/?b>)/);
  const opens = (out.match(/<b>/g) || []).length;
  const closes = (out.match(/<\/b>/g) || []).length;
  assert.equal(opens, closes);
});
