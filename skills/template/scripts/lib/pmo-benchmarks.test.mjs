import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  benchmarkTemplateValues,
  loadBenchmarkDataset,
  validateBenchmarkDataset,
} from './pmo-benchmarks.mjs';

test('benchmarks.json is fully sourced, dated, and carries the honest framing', () => {
  const dataset = loadBenchmarkDataset();
  assert.deepEqual(validateBenchmarkDataset(dataset), []);
});

test('benchmark guard fails unsourced or undated figures', () => {
  const broken = {
    schema: 'pmo-benchmarks-v1',
    generatedAt: '2026-07-13',
    framing: 'Differential, not a controlled experiment.',
    figures: {
      bad: {
        value: 1,
        unit: 'hours',
        direction: 'lower_is_better',
        source: { title: 'Missing dates', publisher: 'Nobody', url: 'https://example.com' },
      },
    },
  };
  assert.deepEqual(validateBenchmarkDataset(broken), [
    'bad: source.publishedDate is required',
    'bad: source.accessedDate is required',
  ]);
});

test('benchmarkTemplateValues exposes the figures templates need', () => {
  const values = benchmarkTemplateValues(loadBenchmarkDataset());
  assert.equal(values.deploysPerWeek, 3);
  assert.equal(values.prCycleMedianHours, 24);
  assert.equal(values.epicLeadMedianDays, 7);
  assert.equal(values.changeFailureRatePercent, 15);
  assert.match(values.framing, /not a controlled experiment/);
  assert.ok(values.sources.every((source) => source.url.startsWith('https://')));
});
