import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDocViewerUrl, buildTemplateData, fillPmoTemplate, fillTemplate } from './pmo-templates.mjs';

const METRICS = {
  window: { sinceISO: '2026-07-01T00:00:00Z', untilISO: '2026-07-08T00:00:00Z' },
  throughput: { shippedStories: 8, shippedEpics: 2, closedEpics: 2 },
  prCycleTime: { medianHours: 9.5, averageHours: 12.2, p90Hours: 24 },
  epicLeadTime: { medianDays: 4, averageDays: 5 },
  deployFrequency: { total: 6 },
  changeFailProxy: { count: 1 },
  docOps: {
    learningsPromotions: 3,
    retroCoverage: { covered: 2, total: 2, percent: 100 },
  },
};

const BENCHMARKS = {
  framing: 'Differential, not a controlled experiment.',
  deploysPerWeek: 3,
  prCycleMedianHours: 24,
  epicLeadMedianDays: 7,
  changeFailureRatePercent: 15,
  restoreTimeHours: 24,
  sources: [
    {
      publisher: 'DORA / Four Keys',
      publishedDate: '2024-01-23',
      accessedDate: '2026-07-13',
    },
  ],
};

test('buildTemplateData maps PMO metrics into stable template fields', () => {
  assert.deepEqual(
    buildTemplateData(METRICS, {
      generatedAt: new Date('2026-07-09T12:00:00Z'),
      benchmarks: BENCHMARKS,
    }),
    {
      window: {
        sinceISO: '2026-07-01T00:00:00Z',
        untilISO: '2026-07-08T00:00:00Z',
        label: '2026-07-01 to 2026-07-08',
        generatedDate: '2026-07-09',
      },
      throughput: { shippedStories: 8, shippedEpics: 2, closedEpics: 2 },
      cycle: { medianHours: 9.5, averageHours: 12.2, p90Hours: 24 },
      epics: { medianDays: 4, averageDays: 5 },
      deploys: { total: 6, perWeek: 6 },
      quality: { changeFailProxy: 1, changeFailureRatePercent: 16.7 },
      docOps: { learningsPromotions: 3, retroCovered: 2, retroTotal: 2, retroPercent: 100 },
      benchmarks: {
        deploysPerWeek: 3,
        prCycleMedianHours: 24,
        epicLeadMedianDays: 7,
        changeFailureRatePercent: 15,
        restoreTimeHours: 24,
        framing: 'Differential, not a controlled experiment.',
        sourceLine: 'DORA / Four Keys (2024-01-23; accessed 2026-07-13)',
      },
    }
  );
});

test('fillTemplate replaces dotted placeholders and leaves unknown placeholders visible', () => {
  const output = fillTemplate(
    'Week {{ window.label }}: {{throughput.shippedStories}} stories; {{missing.value}}.',
    METRICS,
    { generatedAt: new Date('2026-07-09T12:00:00Z') }
  );
  assert.equal(output, 'Week 2026-07-01 to 2026-07-08: 8 stories; {{missing.value}}.');
});

test('weekly story-deck fixture fills to exact doc-viewer markdown markers', () => {
  const output = fillPmoTemplate('weekly', METRICS, {
    generatedAt: new Date('2026-07-09T12:00:00Z'),
    benchmarks: BENCHMARKS,
  });
  assert.match(output, /^---\ntitle: "PMO weekly - 2026-07-01 to 2026-07-08"/);
  assert.match(output, /slideAspectRatio: "16:9"/);
  assert.match(output, /#metric: 8/);
  assert.match(output, /"values":\[8,2,6,1\]/);
  assert.match(output, /Median PR cycle: \*\*9.5h\*\* vs the one-day reference \*\*24h\*\*/);
  assert.match(output, /DORA \/ Four Keys \(2024-01-23; accessed 2026-07-13\)/);
  assert.doesNotMatch(output, /\{\{/);
});

test('monthly packet fixture fills table and chart output', () => {
  const output = fillPmoTemplate('monthly', METRICS, {
    generatedAt: new Date('2026-07-09T12:00:00Z'),
    benchmarks: BENCHMARKS,
  });
  assert.match(output, /\| Stories shipped \| 8 \|/);
  assert.match(output, /\| Median PR cycle \| 9.5h \|/);
  assert.match(output, /\| Change-failure proxy \| 16.7% \| 15% \| Lower is better \|/);
  assert.match(output, /"values":\[8,2,6,3\]/);
  assert.doesNotMatch(output, /\{\{/);
});

test('metrics sheet fixture exports live formula cells', () => {
  const output = fillPmoTemplate('sheet', METRICS, {
    generatedAt: new Date('2026-07-09T12:00:00Z'),
    benchmarks: BENCHMARKS,
  });
  assert.equal(
    output,
    `---
title: "PMO metrics sheet - 2026-07-01 to 2026-07-08"
styles:
  fontFamily: "Inter"
  baseFontSize: 15
  lineHeight: 1.6
---

# PMO metrics sheet - 2026-07-01 to 2026-07-08

\`\`\`cells
Metric,Value,Benchmark,Direction,Differential
Deploys per week,6,3,higher is better,=B2-C2
PR cycle median hours,9.5,24,lower is better,=B3-C3
Epic lead median days,4,7,lower is better,=B4-C4
Change-failure proxy %,16.7,15,lower is better,=B5-C5
Stories shipped,8,0,internal signal,=B6-C6
Epics shipped,2,0,internal signal,=B7-C7
LEARNINGS promotions,3,0,internal signal,=B8-C8
Retro coverage %,100,0,internal signal,=B9-C9
\`\`\`

Notes:

- The formulas export to a spreadsheet as live formulas.
- Benchmark source: DORA / Four Keys (2024-01-23; accessed 2026-07-13).
- Differential, not a controlled experiment.
`
  );
});

test('buildDocViewerUrl emits a doc-viewer hash URL with md payload and optional present mode', () => {
  const url = buildDocViewerUrl('# Hello', { baseUrl: 'https://example.test', present: true });
  assert.match(url, /^https:\/\/example\.test\/#md=/);
  assert.match(url, /present=0/);
});

test('buildDocViewerUrl refuses to build a link with no configured viewer — no borrowed default host', () => {
  assert.throws(() => buildDocViewerUrl('# Hello'), /artifacts\.docViewerUrl/);
});
