import assert from 'node:assert/strict';
import test from 'node:test';
import { countStories } from './roadmap-to-notion.mjs';

test('story count recognizes status emoji before canonical Story headings', () => {
  const body = [
    '## Stories',
    '### ✅ Story 1.1 — complete',
    '### ✅ Story 1.2 — complete',
    '### Story 1.3 — planned',
    '### Story 1.4 — planned',
  ].join('\n');

  assert.deepEqual(countStories(body), { total: 4, done: 2 });
});

test('story count retains legacy heading variants without treating section headings as stories', () => {
  const body = ['## QA', '## ✅ US-1 shipped', '### 🟦 S2.1 (API) in review', '## C.3 planned'].join('\n');

  assert.deepEqual(countStories(body), { total: 3, done: 1 });
});

test('richText splits long text across ≤2000-char objects instead of failing or cutting it (the S1 kickoff regression)', async () => {
  const { richText, NOTION_TEXT_LIMIT } = await import('./roadmap-to-notion.mjs');
  assert.deepEqual(richText(null), { rich_text: [] });
  assert.deepEqual(richText('short'), { rich_text: [{ text: { content: 'short' } }] });
  const long = 'x'.repeat(2534);
  const parts = richText(long).rich_text;
  assert.equal(parts.length, 2);
  assert.ok(parts.every((p) => p.text.content.length <= NOTION_TEXT_LIMIT));
  assert.equal(parts.map((p) => p.text.content).join(''), long, 'nothing is cut');
});
