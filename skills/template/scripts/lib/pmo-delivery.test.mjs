import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTelegramDeliveryMessage, sendTelegramMessage } from './pmo-delivery.mjs';
import { telegramHtmlVisibleLength, telegramHtmlVisibleText } from './telegram-format.mjs';

const METRICS = {
  window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
  throughput: { shippedStories: 8, shippedEpics: 2 },
  prCycleTime: { medianHours: 9.5, p90Hours: 24 },
  deployFrequency: { total: 6 },
  changeFailProxy: { count: 1 },
  docOps: {
    learningsPromotions: 3,
    retroCoverage: { covered: 2, total: 2 },
  },
};

test('buildTelegramDeliveryMessage includes headline metrics and preserves the deck link', () => {
  const message = buildTelegramDeliveryMessage({
    metrics: METRICS,
    artifacts: [{ name: 'weekly', url: 'https://viewer.example.test/#md=abc&present=0' }],
  });
  assert.match(message, /PMO weekly - 2026-07-01 to 2026-07-08/);
  assert.match(message, /Stories shipped: 8 \| Epics shipped: 2/);
  assert.match(
    message,
    /Story-deck: <a href="https:\/\/viewer\.example\.test\/#md=abc&amp;present=0">open weekly deck<\/a>/
  );
  assert.doesNotMatch(telegramHtmlVisibleText(message), /https:\/\//);
  assert.ok(telegramHtmlVisibleLength(message) <= 4096);
});

test('buildTelegramDeliveryMessage truncates headline text before chopping artifact links', () => {
  const message = buildTelegramDeliveryMessage({
    metrics: {
      ...METRICS,
      prCycleTime: { medianHours: 'x'.repeat(160), p90Hours: 24 },
    },
    artifacts: [{ name: 'weekly', url: 'https://viewer.example.test/#md=abc' }],
    maxChars: 230,
  });
  assert.ok(telegramHtmlVisibleLength(message) <= 230);
  assert.match(
    message,
    /Story-deck: <a href="https:\/\/viewer\.example\.test\/#md=abc">open weekly deck<\/a>$/
  );
  assert.match(message, /…/);
});

test('buildTelegramDeliveryMessage preserves very long doc-viewer hrefs behind short visible labels', () => {
  const href = `https://viewer.example.test/#md=${'x'.repeat(1200)}&present=0`;
  const message = buildTelegramDeliveryMessage({
    metrics: {
      ...METRICS,
      prCycleTime: { medianHours: 'x'.repeat(160), p90Hours: 24 },
    },
    artifacts: [{ name: 'weekly', url: href }],
    maxChars: 230,
  });
  assert.ok(telegramHtmlVisibleLength(message) <= 230);
  assert.match(message, new RegExp(`${'x'.repeat(1200)}&amp;present=0">open weekly deck</a>$`));
});

test('sendTelegramMessage posts the same sendMessage shape used by routines', async () => {
  const calls = [];
  await sendTelegramMessage({
    chatId: '123',
    token: 'token',
    text: 'hello',
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, text: async () => '{"ok":true}' };
    },
  });
  assert.equal(calls[0].url, 'https://api.telegram.org/bottoken/sendMessage');
  assert.deepEqual(JSON.parse(calls[0].options.body), {
    chat_id: '123',
    text: 'hello',
    parse_mode: 'HTML',
    disable_web_page_preview: true,
  });
});

test('sendTelegramMessage preserves non-JSON API error context', async () => {
  await assert.rejects(
    sendTelegramMessage({
      chatId: '123',
      token: 'token',
      text: 'hello',
      fetchImpl: async () => ({ ok: false, status: 502, text: async () => '<html>bad gateway</html>' }),
    }),
    /Telegram sendMessage failed: 502 <html>bad gateway<\/html>/
  );
});
