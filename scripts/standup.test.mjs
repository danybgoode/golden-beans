// standup.test.mjs — pure-logic coverage for standup.mjs's diffSnapshots (no gh/git/network I/O — those
// are exercised live, --dry-run, against the real repos). Added 2026-07-03 after a live incident:
// diffSnapshots had no test coverage and no bootstrap-safety guard, so a missing/wiped standups.log made
// it enumerate gh's entire recent-PR history as "new," overflowing Telegram's 4096-char limit and dying
// before ever posting or persisting a log.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { diffSnapshots } from './standup.mjs';

const REPO = 'acme/product';

function repoSignal({ byNumber = {} } = {}) {
  return [{ repo: REPO, byNumber }];
}

// ---- bootstrap safety (the live incident) ----

test('diffSnapshots: no prior snapshot (prev=null) → ONE bounded summary line per repo, never a per-PR title dump', () => {
  const cur = {
    ts: '2026-07-03T00:00:00Z',
    repos: {
      [REPO]: {
        openNumbers: [1, 2],
        // simulate a busy repo history — this must NOT be enumerated title-by-title on a missing baseline
        mergedNumbers: Array.from({ length: 120 }, (_, i) => i + 1),
        failingOpenNumbers: [],
        conflictingOpenNumbers: [],
      },
    },
    smoke: null,
    buildOrderDrifted: false,
    stalePreviews: null,
  };
  const lines = diffSnapshots(null, cur, repoSignal());
  assert.equal(lines.filter((l) => l.includes('product')).length, 1);
  assert.match(lines[0], /baseline established/);
  assert.match(lines[0], /120 recently merged/);
  assert.doesNotMatch(lines.join('\n'), /#\d+/); // no individual PR numbers/titles enumerated
});

test('diffSnapshots: bootstrap message stays short regardless of history size (the actual overflow reproduction)', () => {
  const cur = {
    ts: '2026-07-03T00:00:00Z',
    repos: {
      'acme/a': {
        openNumbers: [],
        mergedNumbers: Array.from({ length: 50 }, (_, i) => i),
        failingOpenNumbers: [],
        conflictingOpenNumbers: [],
      },
      'acme/b': {
        openNumbers: [],
        mergedNumbers: Array.from({ length: 50 }, (_, i) => i),
        failingOpenNumbers: [],
        conflictingOpenNumbers: [],
      },
      'acme/c': {
        openNumbers: [],
        mergedNumbers: Array.from({ length: 50 }, (_, i) => i),
        failingOpenNumbers: [],
        conflictingOpenNumbers: [],
      },
    },
    smoke: null,
    buildOrderDrifted: false,
    stalePreviews: null,
  };
  const signals = [
    { repo: 'acme/a', byNumber: {} },
    { repo: 'acme/b', byNumber: {} },
    { repo: 'acme/c', byNumber: {} },
  ];
  const lines = diffSnapshots(null, cur, signals);
  const message = lines.join('\n');
  assert.ok(
    message.length < 1000,
    `bootstrap message across 3 repos with 150 total merged PRs must stay tiny, got ${message.length} chars`
  );
});

// ---- normal delta path (regression coverage for existing behavior) ----

test('diffSnapshots: a genuinely new merged PR is reported with its title', () => {
  const prev = {
    repos: {
      [REPO]: { openNumbers: [], mergedNumbers: [1], failingOpenNumbers: [], conflictingOpenNumbers: [] },
    },
  };
  const cur = {
    repos: {
      [REPO]: { openNumbers: [], mergedNumbers: [1, 2], failingOpenNumbers: [], conflictingOpenNumbers: [] },
    },
    smoke: null,
    buildOrderDrifted: false,
    stalePreviews: null,
  };
  const lines = diffSnapshots(
    prev,
    cur,
    repoSignal({ byNumber: { 2: { title: 'feat: new thing', url: 'x' } } })
  );
  assert.match(lines.join('\n'), /merged: #2 feat: new thing/);
});

test('diffSnapshots: nothing changed at all (repo, smoke, build-order, previews) → no lines', () => {
  const snap = { openNumbers: [1], mergedNumbers: [2], failingOpenNumbers: [], conflictingOpenNumbers: [] };
  const prev = { repos: { [REPO]: snap }, smoke: null, buildOrderDrifted: false, stalePreviews: null };
  const cur = { repos: { [REPO]: snap }, smoke: null, buildOrderDrifted: false, stalePreviews: null };
  assert.deepEqual(diffSnapshots(prev, cur, repoSignal()), []);
});

test('diffSnapshots: a busy night still caps the merged-PR title list via formatPrList', () => {
  const prev = {
    repos: {
      [REPO]: { openNumbers: [], mergedNumbers: [], failingOpenNumbers: [], conflictingOpenNumbers: [] },
    },
  };
  const byNumber = Object.fromEntries(
    Array.from({ length: 20 }, (_, i) => [i + 1, { title: `pr${i + 1}`, url: 'x' }])
  );
  const cur = {
    repos: {
      [REPO]: {
        openNumbers: [],
        mergedNumbers: Array.from({ length: 20 }, (_, i) => i + 1),
        failingOpenNumbers: [],
        conflictingOpenNumbers: [],
      },
    },
    smoke: null,
    buildOrderDrifted: false,
    stalePreviews: null,
  };
  const lines = diffSnapshots(prev, cur, repoSignal({ byNumber }));
  assert.match(lines.join('\n'), /…and 8 more/); // 20 merged, capped at 12
});

test('diffSnapshots: a new merge-conflict on an open PR is reported', () => {
  const prev = {
    repos: {
      [REPO]: { openNumbers: [5], mergedNumbers: [], failingOpenNumbers: [], conflictingOpenNumbers: [] },
    },
  };
  const cur = {
    repos: {
      [REPO]: { openNumbers: [5], mergedNumbers: [], failingOpenNumbers: [], conflictingOpenNumbers: [5] },
    },
    smoke: null,
    buildOrderDrifted: false,
    stalePreviews: null,
  };
  assert.match(diffSnapshots(prev, cur, repoSignal()).join('\n'), /merge conflict on open PR: #5/);
});

test('diffSnapshots: build-order drift flip is reported even with no PR changes', () => {
  const snap = { openNumbers: [], mergedNumbers: [], failingOpenNumbers: [], conflictingOpenNumbers: [] };
  const prev = { repos: { [REPO]: snap }, smoke: null, buildOrderDrifted: false, stalePreviews: null };
  const cur = { repos: { [REPO]: snap }, smoke: null, buildOrderDrifted: true, stalePreviews: null };
  assert.match(diffSnapshots(prev, cur, repoSignal()).join('\n'), /BUILD-ORDER\.md is stale/);
});
