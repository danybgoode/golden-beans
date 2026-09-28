import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computePmoWindow,
  formatPmoReport,
  lastPmoLogEntry,
  parsePmoLog,
  pmoLogLine,
} from './pmo-window-log.mjs';

test('parsePmoLog skips malformed lines and returns JSONL entries', () => {
  const entries = parsePmoLog(
    '{"windowEnd":"2026-07-01T00:00:00Z"}\nnot-json\n{"windowEnd":"2026-07-02T00:00:00Z"}\n'
  );
  assert.deepEqual(entries, [{ windowEnd: '2026-07-01T00:00:00Z' }, { windowEnd: '2026-07-02T00:00:00Z' }]);
  assert.deepEqual(lastPmoLogEntry(JSON.stringify({ windowEnd: 'x' }) + '\n'), { windowEnd: 'x' });
});

test('computePmoWindow: missing log creates a bounded seven-day baseline window, rounded to the hour', () => {
  const window = computePmoWindow(null, new Date('2026-07-13T12:34:56.789Z'));
  assert.deepEqual(window, {
    sinceISO: '2026-07-06T12:00:00.000Z',
    untilISO: '2026-07-13T12:00:00.000Z',
    baseline: true,
  });
});

test('computePmoWindow: prior log picks up exactly at the last window end', () => {
  const window = computePmoWindow(
    { windowEnd: '2026-07-10T00:00:00.000Z' },
    new Date('2026-07-13T12:34:56.789Z')
  );
  assert.deepEqual(window, {
    sinceISO: '2026-07-10T00:00:00.000Z',
    untilISO: '2026-07-13T12:00:00.000Z',
  });
});

test('computePmoWindow: explicit since/until override the log', () => {
  const window = computePmoWindow(
    { windowEnd: '2026-07-10T00:00:00.000Z' },
    new Date('2026-07-13T12:34:56.789Z'),
    { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' }
  );
  assert.deepEqual(window, {
    sinceISO: '2026-07-01T00:00:00Z',
    untilISO: '2026-07-08T00:00:00Z',
  });
});

test('pmoLogLine writes the compact window-tracking summary shape', () => {
  const line = pmoLogLine({
    window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
    baselineEstablished: true,
    metrics: {
      throughput: { shippedStories: 2, shippedEpics: 1 },
      deployFrequency: { total: 3 },
      changeFailProxy: { count: 1 },
      docOps: { learningsPromotions: 1 },
    },
  });
  const parsed = JSON.parse(line);
  assert.equal(parsed.windowStart, '2026-07-01T00:00:00Z');
  assert.equal(parsed.windowEnd, '2026-07-08T00:00:00Z');
  assert.equal(parsed.baselineEstablished, true);
  assert.deepEqual(parsed.summary, {
    shippedStories: 2,
    shippedEpics: 1,
    deploys: 3,
    changeFailProxy: 1,
    learningsPromotions: 1,
  });
});

test('formatPmoReport renders the expected PMO headline sections', () => {
  const report = formatPmoReport({
    baselineLine:
      'PMO baseline established · 1 open PRs · 2 recently merged PRs · 3 Roadmap rows · 4 doc changes',
    metrics: {
      window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
      throughput: {
        shippedStories: 2,
        shippedEpics: 1,
        closedEpics: 1,
        currentStoryProgress: { done: 7, total: 9 },
      },
      prCycleTime: { count: 3, medianHours: 4, averageHours: 5, p90Hours: 6 },
      deployFrequency: { total: 2, byRepo: { frontend: 1, backend: 1 } },
      changeFailProxy: { count: 1 },
      docOps: {
        docsTouchedPerEpic: { alpha: 2 },
        learningsPromotions: 1,
        retroCoverage: { covered: 1, total: 2, percent: 50 },
      },
    },
  });
  assert.match(report, /PMO operational report/);
  assert.match(report, /baseline established/);
  assert.match(report, /Throughput:/);
  assert.match(report, /PR cycle time:/);
  assert.match(report, /Deploy frequency:/);
  assert.match(report, /Doc-ops:/);
});

test('formatPmoReport renders unavailable hour metrics as n/a, not n/ah', () => {
  const report = formatPmoReport({
    metrics: {
      window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
      throughput: {
        shippedStories: 0,
        shippedEpics: 0,
        closedEpics: 0,
        currentStoryProgress: { done: 0, total: 0 },
      },
      prCycleTime: { count: 0, medianHours: null, averageHours: null, p90Hours: null },
      deployFrequency: { total: 0, byRepo: {} },
      changeFailProxy: { count: 0 },
      docOps: {
        docsTouchedPerEpic: {},
        learningsPromotions: 0,
        retroCoverage: { covered: 0, total: 0, percent: null },
      },
    },
  });
  assert.match(report, /median n\/a · avg n\/a · p90 n\/a/);
  assert.doesNotMatch(report, /n\/ah/);
});

test('formatPmoReport caps a busy doc-ops epic list', () => {
  const docsTouchedPerEpic = Object.fromEntries(
    Array.from({ length: 15 }, (_, i) => [`epic-${i + 1}`, i + 1])
  );
  const report = formatPmoReport({
    metrics: {
      window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
      throughput: {
        shippedStories: 0,
        shippedEpics: 0,
        closedEpics: 0,
        currentStoryProgress: { done: 0, total: 0 },
      },
      prCycleTime: { count: 0, medianHours: null, averageHours: null, p90Hours: null },
      deployFrequency: { total: 0, byRepo: {} },
      changeFailProxy: { count: 0 },
      docOps: {
        docsTouchedPerEpic,
        learningsPromotions: 0,
        retroCoverage: { covered: 0, total: 0, percent: null },
      },
    },
  });
  assert.match(report, /epic-12: 12/);
  assert.match(report, /and 3 more/);
  assert.doesNotMatch(report, /epic-15/);
});
