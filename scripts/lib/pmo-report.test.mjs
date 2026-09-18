import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildReport,
  buildReportArtifacts,
  gatherRepoResults,
  loadLogContent,
  parseArgs,
  shouldPersistWindow,
} from '../pmo-report.mjs';

// The project's doc viewer — in a real project, reporting.config.json → artifacts.docViewerUrl.
const VIEWER = 'https://viewer.example.test';

test('parseArgs reads dry-run and explicit window overrides', () => {
  assert.deepEqual(
    parseArgs([
      '--dry-run',
      '--weekly',
      '--open',
      '--since',
      '2026-07-01T00:00:00Z',
      '--until',
      '2026-07-08T00:00:00Z',
    ]),
    {
      dryRun: true,
      weekly: true,
      monthly: false,
      sheet: false,
      open: true,
      sinceISO: '2026-07-01T00:00:00Z',
      untilISO: '2026-07-08T00:00:00Z',
    }
  );
});

test('parseArgs makes monthly produce both packet and sheet', () => {
  assert.deepEqual(parseArgs(['--monthly']), {
    dryRun: false,
    weekly: false,
    monthly: true,
    sheet: true,
    open: false,
    sinceISO: null,
    untilISO: null,
  });
});

test('shouldPersistWindow advances scheduled reports but not on-demand artifacts', () => {
  assert.equal(shouldPersistWindow(parseArgs(['--weekly'])), true);
  assert.equal(shouldPersistWindow(parseArgs([])), false);
  assert.equal(shouldPersistWindow(parseArgs(['--dry-run', '--weekly'])), false);
  assert.equal(shouldPersistWindow(parseArgs(['--monthly'])), false);
  assert.equal(shouldPersistWindow(parseArgs(['--sheet'])), false);
});

test('buildReport uses injected data and does not perform script I/O when imported', () => {
  const { metrics, text } = buildReport({
    window: {
      sinceISO: '2026-07-01T00:00:00Z',
      untilISO: '2026-07-08T00:00:00Z',
      baseline: true,
    },
    repoResults: [
      {
        repo: 'acme/web',
        available: true,
        openPrs: [{ number: 10 }],
        prs: [
          {
            number: 1,
            title: 'hotfix: restore',
            createdAt: '2026-07-01T00:00:00Z',
            mergedAt: '2026-07-02T00:00:00Z',
          },
        ],
      },
      { repo: 'acme/api', available: true, openPrs: [], prs: [] },
    ],
    roadmapRows: [{ grain: 'Sprint', sprint_progress: '2/3 stories' }],
    epicStatusFlips: [{ status: 'shipped', date: '2026-07-03T00:00:00Z' }],
    docOpsInputs: {
      docChanges: [{ epicSlug: 'pmo', path: 'Roadmap/09-platform-infra/pmo/sprint-1.md' }],
      learningsPromotions: [],
      shippedEpics: [{ slug: 'pmo', hasRetrospective: true }],
    },
    epicLeadInputs: [{ scaffoldedAt: '2026-07-01T00:00:00Z', shippedAt: '2026-07-03T00:00:00Z' }],
  });
  assert.equal(metrics.deployFrequency.total, 1);
  assert.equal(metrics.changeFailProxy.count, 1);
  assert.match(text, /PMO operational report/);
  assert.match(text, /baseline established/);
  assert.match(text, /Roadmap progress 2\/3 stories/);
});

test('loadLogContent always reads the fetched remote log branch, including dry-run preflight', () => {
  let reads = 0;
  assert.equal(
    loadLogContent({
      readRemoteLog: () => {
        reads += 1;
        return '{"untilISO":"fresh"}\n';
      },
    }),
    '{"untilISO":"fresh"}\n'
  );
  assert.equal(reads, 1);
});

test('gatherRepoResults populates open PRs from REST listPulls', () => {
  const results = gatherRepoResults('2026-07-01T00:00:00Z', '2026-07-08T00:00:00Z', {
    searchMerged: ({ repo }) => [
      { repo, number: 1, title: 'feat: inside', mergedAt: '2026-07-02T00:00:00Z' },
      { repo, number: 2, title: 'feat: outside', mergedAt: '2026-07-09T00:00:00Z' },
    ],
    listOpen: ({ repo }) => [{ repo, number: 10, title: 'open work' }],
    repos: ['acme/product', 'acme/web', 'acme/api'],
  });
  assert.equal(results.length, 3);
  assert.ok(results.every((result) => result.available));
  assert.ok(results.every((result) => result.prs.length === 1));
  assert.ok(results.every((result) => result.openPrs.length === 1));
});

test('buildReportArtifacts fills requested templates and emits doc-viewer URLs', () => {
  const metrics = {
    window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
    throughput: { shippedStories: 1, shippedEpics: 1, closedEpics: 1 },
    prCycleTime: { medianHours: 2, averageHours: 3, p90Hours: 4 },
    epicLeadTime: { medianDays: 5, averageDays: 6 },
    deployFrequency: { total: 7 },
    changeFailProxy: { count: 0 },
    docOps: { learningsPromotions: 1, retroCoverage: { covered: 1, total: 1, percent: 100 } },
  };
  const artifacts = buildReportArtifacts(
    metrics,
    { weekly: true, monthly: false, sheet: true },
    { docViewerUrl: VIEWER }
  );
  assert.deepEqual(
    artifacts.map((a) => a.name),
    ['weekly', 'sheet']
  );
  assert.match(artifacts[0].markdown, /PMO weekly/);
  assert.match(artifacts[0].markdown, /DORA\/Four Keys daily benchmark: \*\*3\*\*/);
  assert.match(artifacts[0].url, /present=0/);
  assert.match(artifacts[1].markdown, /```cells/);
  assert.match(artifacts[1].markdown, /Change-failure proxy %,0,15,lower is better/);
  assert.match(artifacts[1].url, /^https:\/\/viewer\.example\.test\/#md=/);
});

test('buildReportArtifacts treats monthly as packet plus sheet', () => {
  const metrics = {
    window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
    throughput: { shippedStories: 1, shippedEpics: 1, closedEpics: 1 },
    prCycleTime: { medianHours: 2, averageHours: 3, p90Hours: 4 },
    epicLeadTime: { medianDays: 5, averageDays: 6 },
    deployFrequency: { total: 7 },
    changeFailProxy: { count: 0 },
    docOps: { learningsPromotions: 1, retroCoverage: { covered: 1, total: 1, percent: 100 } },
  };
  const artifacts = buildReportArtifacts(metrics, parseArgs(['--monthly']), { docViewerUrl: VIEWER });
  assert.deepEqual(
    artifacts.map((a) => a.name),
    ['monthly', 'sheet']
  );
});

// reporthub-as-notion S2.2 acceptance: "weekly PMO Telegram message links a chart view." This is
// already true today — scripts/pmo/templates/weekly-story-deck.md embeds ```chart fenced blocks, and
// Sprint 1's report-registry upgrades that artifact's URL to a short /r/<slug> link before it reaches
// Telegram (see pmo-report.mjs's main()). Locking it here so a future template edit that accidentally
// drops the chart block fails a test, not a live Telegram send.
test('buildReportArtifacts: the weekly artifact embeds at least one chart fenced block', () => {
  const metrics = {
    window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
    throughput: { shippedStories: 1, shippedEpics: 1, closedEpics: 1 },
    prCycleTime: { medianHours: 2, averageHours: 3, p90Hours: 4 },
    epicLeadTime: { medianDays: 5, averageDays: 6 },
    deployFrequency: { total: 7 },
    changeFailProxy: { count: 0 },
    docOps: { learningsPromotions: 1, retroCoverage: { covered: 1, total: 1, percent: 100 } },
  };
  const [weekly] = buildReportArtifacts(
    metrics,
    { weekly: true, monthly: false, sheet: false },
    { docViewerUrl: VIEWER }
  );
  const blocks = [...weekly.markdown.matchAll(/```chart\n(.+?)\n/g)].map((m) => m[1]);
  assert.ok(blocks.length >= 1, 'weekly deck must embed at least one ```chart fenced block');
  for (const block of blocks) assert.ok(JSON.parse(block).type, 'each chart block must be valid, typed JSON');
});

// reporthub-as-notion S2.2 acceptance: "monthly artifact mode stays stateless (window log untouched —
// shouldPersistWindow test extended)." The monthly artifact ALSO embeds a chart block (a snapshot bar
// chart + benchmarks table); this test ties that chart-bearing artifact production directly to the
// statelessness guarantee, so the two can't silently decouple (e.g. a future change that starts
// persisting the window whenever a chart artifact is built).
test('buildReportArtifacts: the monthly artifact embeds a chart block, and shouldPersistWindow stays false for --monthly', () => {
  const metrics = {
    window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
    throughput: { shippedStories: 1, shippedEpics: 1, closedEpics: 1 },
    prCycleTime: { medianHours: 2, averageHours: 3, p90Hours: 4 },
    epicLeadTime: { medianDays: 5, averageDays: 6 },
    deployFrequency: { total: 7 },
    changeFailProxy: { count: 0 },
    docOps: { learningsPromotions: 1, retroCoverage: { covered: 1, total: 1, percent: 100 } },
  };
  const args = parseArgs(['--monthly']);
  const [monthly] = buildReportArtifacts(metrics, args, { docViewerUrl: VIEWER });
  assert.match(monthly.markdown, /```chart/);
  assert.equal(
    shouldPersistWindow(args),
    false,
    'a chart-bearing monthly artifact must not advance the PMO window log'
  );
});

test('buildReportArtifacts with no doc viewer configured builds no artifacts (never a borrowed host)', () => {
  assert.deepEqual(buildReportArtifacts({}, { weekly: true, monthly: true, sheet: true }), []);
});
