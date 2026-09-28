import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  baselineSummary,
  formatBaselineSummary,
  inWindow,
  parseStoryProgress,
  summarizeChangeFailProxy,
  summarizeDeployFrequency,
  summarizeDocOps,
  summarizeEpicLeadTime,
  summarizePmoMetrics,
  summarizePrCycleTimes,
  summarizeThroughput,
} from './pmo-metrics.mjs';

const WINDOW = {
  sinceISO: '2026-07-01T00:00:00Z',
  untilISO: '2026-07-08T00:00:00Z',
};

test('inWindow uses half-open [since, until) boundaries', () => {
  assert.equal(inWindow('2026-07-01T00:00:00Z', WINDOW.sinceISO, WINDOW.untilISO), true);
  assert.equal(inWindow('2026-07-07T23:59:59Z', WINDOW.sinceISO, WINDOW.untilISO), true);
  assert.equal(inWindow('2026-07-08T00:00:00Z', WINDOW.sinceISO, WINDOW.untilISO), false);
  assert.equal(inWindow('not-a-date', WINDOW.sinceISO, WINDOW.untilISO), false);
});

test('parseStoryProgress reads build-order/Notion extractor sprint progress strings', () => {
  assert.deepEqual(parseStoryProgress('7/10 stories'), { done: 7, total: 10 });
  assert.deepEqual(parseStoryProgress('—'), { done: 0, total: 0 });
});

test('summarizePrCycleTimes computes exact count, average, median and p90 for merged PRs in the window', () => {
  const prs = [
    { number: 1, createdAt: '2026-07-01T00:00:00Z', mergedAt: '2026-07-01T06:00:00Z' },
    { number: 2, createdAt: '2026-07-02T00:00:00Z', mergedAt: '2026-07-03T00:00:00Z' },
    { number: 3, createdAt: '2026-07-03T00:00:00Z', mergedAt: '2026-07-05T00:00:00Z' },
    { number: 4, createdAt: '2026-06-28T00:00:00Z', mergedAt: '2026-06-30T00:00:00Z' },
  ];
  assert.deepEqual(summarizePrCycleTimes(prs, WINDOW), {
    count: 3,
    averageHours: 26,
    medianHours: 24,
    p90Hours: 48,
  });
});

test('summarizeEpicLeadTime computes lead time from scaffold to shipped date', () => {
  const epics = [
    { slug: 'a', scaffoldedAt: '2026-06-25T00:00:00Z', shippedAt: '2026-07-02T00:00:00Z' },
    { slug: 'b', scaffoldedAt: '2026-07-01T00:00:00Z', shippedAt: '2026-07-05T00:00:00Z' },
    { slug: 'old', scaffoldedAt: '2026-06-01T00:00:00Z', shippedAt: '2026-06-15T00:00:00Z' },
  ];
  assert.deepEqual(summarizeEpicLeadTime(epics, WINDOW), {
    count: 2,
    averageDays: 5.5,
    medianDays: 5.5,
  });
});

test('summarizeDeployFrequency treats merges to main as deploys and labels unavailable repos', () => {
  const repoResults = [
    { repo: 'acme/web', available: true, prs: [{ number: 1 }, { number: 2 }] },
    { repo: 'acme/api', available: true, prs: [{ number: 3 }] },
    { repo: 'acme/product', available: false, prs: [] },
  ];
  assert.deepEqual(
    summarizeDeployFrequency(repoResults, {
      deployRepos: ['acme/web', 'acme/api'],
    }),
    {
      total: 3,
      byRepo: {
        'acme/web': 2,
        'acme/api': 1,
      },
      unavailable: 0,
    }
  );
});

test('summarizeChangeFailProxy counts only reverts and hotfixes in the report window', () => {
  const items = [
    { title: 'Revert "feat: bad deploy"', mergedAt: '2026-07-02T00:00:00Z' },
    { title: 'hotfix: restore checkout', mergedAt: '2026-07-03T00:00:00Z' },
    { title: 'fix: normal bugfix', mergedAt: '2026-07-04T00:00:00Z' },
    { title: 'revert old thing', mergedAt: '2026-06-30T00:00:00Z' },
  ];
  const result = summarizeChangeFailProxy(items, WINDOW);
  assert.equal(result.count, 2);
  assert.deepEqual(
    result.items.map((item) => item.title),
    ['Revert "feat: bad deploy"', 'hotfix: restore checkout']
  );
});

test('summarizeThroughput combines dated epic flips, injected story ship events, and current Roadmap progress', () => {
  const result = summarizeThroughput({
    ...WINDOW,
    roadmapRows: [
      { grain: 'Sprint', sprint_progress: '3/4 stories' },
      { grain: 'Sprint', sprint_progress: '2/2 stories' },
      { grain: 'Seed', sprint_progress: null },
    ],
    epicStatusFlips: [
      { file: 'Roadmap/09-platform-infra/a/README.md', status: 'shipped', date: '2026-07-02T00:00:00Z' },
      { file: 'Roadmap/09-platform-infra/b/README.md', status: 'archived', date: '2026-07-03T00:00:00Z' },
      { file: 'Roadmap/09-platform-infra/c/README.md', status: 'shipped', date: '2026-07-08T00:00:00Z' },
    ],
    storyShipEvents: [
      { story: 'S1.1', shippedAt: '2026-07-02T00:00:00Z' },
      { story: 'S1.2', shippedAt: '2026-07-07T00:00:00Z' },
      { story: 'S0.1', shippedAt: '2026-06-30T00:00:00Z' },
    ],
  });
  assert.deepEqual(result, {
    shippedStories: 2,
    shippedEpics: 1,
    closedEpics: 2,
    currentStoryProgress: { done: 5, total: 6 },
  });
});

test('summarizeDocOps counts unique Roadmap docs by epic, LEARNINGS promotions, and retro coverage', () => {
  const result = summarizeDocOps({
    docChanges: [
      { epicSlug: 'alpha', path: 'Roadmap/09-platform-infra/alpha/README.md' },
      { epicSlug: 'alpha', path: 'Roadmap/09-platform-infra/alpha/README.md' },
      { epicSlug: 'alpha', path: 'Roadmap/09-platform-infra/alpha/sprint-1.md' },
      { epicSlug: 'beta', path: 'Roadmap/09-platform-infra/beta/RETROSPECTIVE.md' },
    ],
    learningsPromotions: [{ path: 'Roadmap/LEARNINGS.md' }],
    shippedEpics: [
      { slug: 'alpha', hasRetrospective: true },
      { slug: 'beta', hasRetrospective: false },
    ],
  });
  assert.deepEqual(result, {
    docsTouchedPerEpic: { alpha: 2, beta: 1 },
    learningsPromotions: 1,
    retroCoverage: { covered: 1, total: 2, percent: 50 },
  });
});

test('baseline summary is bounded and never enumerates a large PR history', () => {
  const summary = baselineSummary({
    repoResults: [
      {
        repo: 'a',
        openPrs: Array.from({ length: 12 }, (_, i) => ({ number: i + 1 })),
        prs: Array.from({ length: 120 }, (_, i) => ({ number: i + 1 })),
      },
      { repo: 'b', openPrs: [{ number: 200 }], prs: [{ number: 201 }] },
    ],
    roadmapRows: Array.from({ length: 42 }, (_, i) => ({ slug: `row-${i}` })),
    docChanges: Array.from({ length: 9 }, (_, i) => ({ path: `doc-${i}.md` })),
  });
  assert.deepEqual(summary, {
    openPrs: 13,
    recentlyMergedPrs: 121,
    roadmapItems: 42,
    docChanges: 9,
  });
  const line = formatBaselineSummary(summary);
  assert.match(line, /baseline established/);
  assert.match(line, /121 recently merged PRs/);
  assert.doesNotMatch(line, /#120/);
  assert.ok(line.length < 180);
});

test('summarizePmoMetrics returns the full report shape from injected fixtures', () => {
  const result = summarizePmoMetrics({
    ...WINDOW,
    deployRepos: ['frontend', 'backend'],
    repoResults: [
      { repo: 'frontend', available: true, prs: [{ number: 1 }, { number: 2 }] },
      { repo: 'backend', available: true, prs: [{ number: 3 }] },
    ],
    prs: [
      { title: 'feat: a', createdAt: '2026-07-01T00:00:00Z', mergedAt: '2026-07-01T12:00:00Z' },
      { title: 'hotfix: b', createdAt: '2026-07-02T00:00:00Z', mergedAt: '2026-07-03T00:00:00Z' },
    ],
    epics: [{ scaffoldedAt: '2026-06-30T00:00:00Z', shippedAt: '2026-07-02T00:00:00Z' }],
    roadmapRows: [{ grain: 'Sprint', sprint_progress: '1/2 stories' }],
    epicStatusFlips: [{ status: 'shipped', date: '2026-07-02T00:00:00Z' }],
    storyShipEvents: [{ shippedAt: '2026-07-02T00:00:00Z' }],
    docChanges: [{ epicSlug: 'pmo', path: 'Roadmap/x/sprint-1.md' }],
    learningsPromotions: [],
    shippedEpics: [{ hasRetrospective: true }],
  });
  assert.equal(result.throughput.shippedStories, 1);
  assert.equal(result.deployFrequency.total, 3);
  assert.equal(result.changeFailProxy.count, 1);
  assert.equal(result.prCycleTime.medianHours, 18);
  assert.equal(result.epicLeadTime.medianDays, 2);
  assert.equal(result.docOps.retroCoverage.percent, 100);
});
