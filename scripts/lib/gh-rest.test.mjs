// gh-rest.test.mjs — pure-logic coverage for gh-rest.mjs's normalizers (no gh/network I/O — those are
// exercised live against real repos, confirmed 2026-07-02 via GH_DEBUG=api tracing).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mapMergeableState,
  buildStatusRollup,
  normalizePullListItem,
  normalizeSearchPrItem,
} from './gh-rest.mjs';

// ---- mapMergeableState ----

test('mapMergeableState: dirty → CONFLICTING', () => {
  assert.equal(mapMergeableState('dirty', false), 'CONFLICTING');
});

test('mapMergeableState: clean/unstable/has_hooks → MERGEABLE', () => {
  assert.equal(mapMergeableState('clean', true), 'MERGEABLE');
  assert.equal(mapMergeableState('unstable', true), 'MERGEABLE');
  assert.equal(mapMergeableState('has_hooks', true), 'MERGEABLE');
});

test('mapMergeableState: unknown falls back to the mergeable boolean when present', () => {
  assert.equal(mapMergeableState('unknown', true), 'MERGEABLE');
  assert.equal(mapMergeableState('unknown', false), 'CONFLICTING');
});

test('mapMergeableState: unknown + null boolean → UNKNOWN', () => {
  assert.equal(mapMergeableState('unknown', null), 'UNKNOWN');
});

// ---- buildStatusRollup ----

test('buildStatusRollup: a failing check-run is uppercased and carries detailsUrl', () => {
  const rollup = buildStatusRollup({
    combinedStatus: { statuses: [] },
    checkRuns: {
      check_runs: [
        { name: 'ci', status: 'completed', conclusion: 'failure', details_url: 'https://x/run/1' },
      ],
    },
  });
  assert.deepEqual(rollup, [
    { name: 'ci', status: 'COMPLETED', conclusion: 'FAILURE', detailsUrl: 'https://x/run/1' },
  ]);
});

test('buildStatusRollup: a legacy commit status is uppercased and mapped to state/context/detailsUrl', () => {
  const rollup = buildStatusRollup({
    combinedStatus: {
      statuses: [{ context: 'legacy-ci', state: 'failure', target_url: 'https://x/legacy' }],
    },
    checkRuns: { check_runs: [] },
  });
  assert.deepEqual(rollup, [{ context: 'legacy-ci', state: 'FAILURE', detailsUrl: 'https://x/legacy' }]);
});

test('buildStatusRollup: combines both sources into one list, and a pending check-run has a null conclusion', () => {
  const rollup = buildStatusRollup({
    combinedStatus: { statuses: [{ context: 'legacy', state: 'success', target_url: null }] },
    checkRuns: {
      check_runs: [{ name: 'ci', status: 'in_progress', conclusion: null, details_url: 'https://x/2' }],
    },
  });
  assert.equal(rollup.length, 2);
  assert.equal(rollup[1].status, 'IN_PROGRESS');
  assert.equal(rollup[1].conclusion, null);
});

test('buildStatusRollup: both sources missing/null → empty rollup, not a throw', () => {
  assert.deepEqual(buildStatusRollup({ combinedStatus: null, checkRuns: null }), []);
});

// ---- normalizePullListItem ----

test('normalizePullListItem: an open PR', () => {
  const p = {
    number: 5,
    title: 'x',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: 'a',
    updated_at: 'b',
    html_url: 'https://x',
    head: { sha: 'abc', ref: 'feat/x' },
  };
  assert.deepEqual(normalizePullListItem(p), {
    number: 5,
    title: 'x',
    state: 'OPEN',
    isDraft: false,
    mergedAt: null,
    createdAt: 'a',
    updatedAt: 'b',
    url: 'https://x',
    headSha: 'abc',
    headRefName: 'feat/x',
  });
});

test('normalizePullListItem: a closed-and-merged PR → state MERGED', () => {
  const p = {
    number: 6,
    title: 'y',
    state: 'closed',
    draft: false,
    merged_at: '2026-01-01T00:00:00Z',
    created_at: 'a',
    updated_at: 'b',
    html_url: 'https://x',
  };
  assert.equal(normalizePullListItem(p).state, 'MERGED');
});

test('normalizePullListItem: a closed-but-not-merged PR → state CLOSED', () => {
  const p = {
    number: 7,
    title: 'z',
    state: 'closed',
    draft: false,
    merged_at: null,
    created_at: 'a',
    updated_at: 'b',
    html_url: 'https://x',
  };
  assert.equal(normalizePullListItem(p).state, 'CLOSED');
});

test('normalizePullListItem: missing head.ref (unexpected shape) → headRefName null, not a throw', () => {
  const p = {
    number: 8,
    title: 'w',
    state: 'open',
    draft: false,
    merged_at: null,
    created_at: 'a',
    updated_at: 'b',
    html_url: 'https://x',
  };
  assert.equal(normalizePullListItem(p).headRefName, null);
});

// ---- normalizeSearchPrItem ----

test('normalizeSearchPrItem: pulls mergedAt from the nested pull_request object', () => {
  const it = {
    number: 9,
    title: 'w',
    created_at: '2026-06-30T00:00:00Z',
    html_url: 'https://x',
    pull_request: { merged_at: '2026-07-01T00:00:00Z' },
  };
  assert.deepEqual(normalizeSearchPrItem(it), {
    number: 9,
    title: 'w',
    createdAt: '2026-06-30T00:00:00Z',
    mergedAt: '2026-07-01T00:00:00Z',
    url: 'https://x',
  });
});

test('normalizeSearchPrItem: missing pull_request → mergedAt null, not a throw', () => {
  const it = { number: 10, title: 'v', html_url: 'https://x' };
  assert.equal(normalizeSearchPrItem(it).mergedAt, null);
  assert.equal(normalizeSearchPrItem(it).createdAt, null);
});
