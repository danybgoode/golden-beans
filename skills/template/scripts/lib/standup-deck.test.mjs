import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendStandupArtifactsToMessage,
  buildStandupArtifacts,
  buildStandupDeckData,
  buildStandupDeckMarkdown,
  fillStandupTemplate,
  telegramHtmlToMarkdown,
} from './standup-deck.mjs';
import { telegramHtmlVisibleLength } from './telegram-format.mjs';

const SNAPSHOT = {
  ts: '2026-07-14T12:00:00Z',
  repos: {
    'acme/product': {
      openNumbers: [84],
      mergedNumbers: [82, 83],
      failingOpenNumbers: [],
      conflictingOpenNumbers: [],
    },
    'acme/web': {
      openNumbers: [250, 251],
      mergedNumbers: [249],
      failingOpenNumbers: [251],
      conflictingOpenNumbers: [],
    },
  },
  smoke: { conclusion: 'success', status: 'completed', createdAt: '2026-07-14T05:00:00Z' },
  buildOrderDrifted: false,
  stalePreviews: 3,
};

test('telegramHtmlToMarkdown keeps standup emphasis readable in doc-viewer markdown', () => {
  assert.equal(
    telegramHtmlToMarkdown('✅ <b>product</b> merged: #84 PMO &amp; reporting'),
    '✅ **product** merged: #84 PMO & reporting'
  );
});

test('buildStandupDeckData summarizes repo and guard signals', () => {
  const data = buildStandupDeckData({
    snapshot: SNAPSHOT,
    deltaLines: ['✅ <b>product</b> merged: #84 PMO'],
    generatedAt: new Date('2026-07-14T13:00:00Z'),
  });
  assert.equal(data.deck.aspectRatio, '16:9');
  assert.equal(data.window.date, '2026-07-14');
  assert.match(data.summary.bullets, /\*\*product\*\* merged: #84 PMO/);
  assert.match(data.repos.bullets, /^- \*\*product:\*\*/m);
  assert.match(data.repos.bullets, /web:\*\* 2 open; 1 red; 0 conflicts/);
  assert.equal(data.guards.browserSmoke, 'success (2026-07-14)');
  assert.equal(data.guards.buildOrder, 'up to date');
  assert.equal(data.guards.stalePreviews, '3');
});

test('fillStandupTemplate replaces dotted placeholders and leaves unknowns visible', () => {
  const out = fillStandupTemplate('{{window.date}} {{missing.value}}', {
    window: { date: '2026-07-14' },
  });
  assert.equal(out, '2026-07-14 {{missing.value}}');
});

test('buildStandupDeckMarkdown emits a landscape doc-viewer slide deck with no unresolved placeholders', () => {
  const markdown = buildStandupDeckMarkdown({
    snapshot: SNAPSHOT,
    deltaLines: ['🌙 Quiet night'],
    generatedAt: new Date('2026-07-14T13:00:00Z'),
  });
  assert.match(markdown, /^---\ntitle: "Daily standup - 2026-07-14"/);
  assert.match(markdown, /slideAspectRatio: "16:9"/);
  assert.match(markdown, /~~~slide/);
  assert.match(markdown, /#title: Daily standup/);
  assert.match(markdown, /#title: What changed/);
  assert.doesNotMatch(markdown, /\{\{/);
});

test('buildStandupArtifacts returns a doc-viewer presentation URL', () => {
  const [artifact] = buildStandupArtifacts({
    docViewerUrl: 'https://viewer.example.test',
    snapshot: SNAPSHOT,
    deltaLines: ['🌙 Quiet night'],
    generatedAt: new Date('2026-07-14T13:00:00Z'),
  });
  assert.equal(artifact.name, 'standup');
  assert.match(artifact.url, /^https:\/\/viewer\.example\.test\/#md=/);
  assert.match(artifact.url, /present=0/);
});

test('appendStandupArtifactsToMessage preserves artifact links when truncating the headline text', () => {
  const result = appendStandupArtifactsToMessage(
    `<b>Standup</b>\n${'x'.repeat(200)}`,
    [{ name: 'standup', url: 'https://example.test/#md=abc&present=0' }],
    120
  );
  assert.ok(telegramHtmlVisibleLength(result) <= 120);
  assert.match(
    result,
    /Deck standup: <a href="https:\/\/example\.test\/#md=abc&amp;present=0">open daily story<\/a>$/
  );
  assert.match(result, /…/);
});

test('appendStandupArtifactsToMessage keeps very long doc-viewer hrefs whole because only the label is visible', () => {
  const href = `https://example.test/#md=${'x'.repeat(1200)}&present=0`;
  const result = appendStandupArtifactsToMessage(
    `<b>Standup</b>\n${'x'.repeat(200)}`,
    [{ name: 'standup', url: href }],
    120
  );
  assert.ok(telegramHtmlVisibleLength(result) <= 120);
  assert.match(result, new RegExp(`${'x'.repeat(1200)}&amp;present=0">open daily story</a>$`));
});

test('buildStandupArtifacts with no doc viewer configured returns no artifact — the Telegram text stands alone', () => {
  assert.deepEqual(
    buildStandupArtifacts({
      snapshot: SNAPSHOT,
      deltaLines: [],
      generatedAt: new Date('2026-07-14T13:00:00Z'),
    }),
    []
  );
});
