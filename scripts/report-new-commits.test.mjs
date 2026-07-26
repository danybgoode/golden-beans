// report-new-commits — the pure planning half of the deterministic prose trigger.
//
// The I/O (git, the state file, spawning commit-report) is deliberately not tested here; what matters
// is the PLAN, because every way this rail can misbehave is a planning mistake: posting twice, posting
// nothing, or posting all of history at once.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planReports } from './report-new-commits.mjs';

// `rev-list` returns newest-first; the plan must hand back oldest-first so the channel reads in the
// order things actually shipped.
const NEWEST_FIRST = ['ccc', 'bbb', 'aaa'];

test('a missing baseline is a BOUNDED NO-OP, never "report all of history"', () => {
  // The failure this guards is a channel receiving one message per commit in the repo. This repo has
  // a LEARNINGS entry for exactly that shape: a delta tool with a wiped baseline must not treat
  // everything as new.
  const plan = planReports({ lastReported: null, commits: NEWEST_FIRST });
  assert.equal(plan.adoptOnly, true);
  assert.deepEqual(plan.shas, [], 'nothing may be posted without a baseline');
});

test('pending commits are reported OLDEST first', () => {
  const plan = planReports({ lastReported: 'zzz', commits: NEWEST_FIRST });
  assert.deepEqual(plan.shas, ['aaa', 'bbb', 'ccc']);
  assert.equal(plan.adoptOnly, false);
});

test('a catch-up is bounded by --limit, and says how many it held back', () => {
  const plan = planReports({ lastReported: 'zzz', commits: NEWEST_FIRST, limit: 2 });
  assert.deepEqual(plan.shas, ['aaa', 'bbb'], 'the oldest two, in order');
  assert.equal(plan.skipped, 1);
});

test('nothing pending yields nothing to post', () => {
  const plan = planReports({ lastReported: 'zzz', commits: [] });
  assert.deepEqual(plan.shas, []);
  assert.equal(plan.adoptOnly, false, 'this is "up to date", NOT "needs a baseline"');
});

test('a single new commit is the ordinary case', () => {
  assert.deepEqual(planReports({ lastReported: 'zzz', commits: ['aaa'] }).shas, ['aaa']);
});

test('the limit never returns more than the commits available', () => {
  const plan = planReports({ lastReported: 'zzz', commits: ['aaa'], limit: 10 });
  assert.deepEqual(plan.shas, ['aaa']);
  assert.equal(plan.skipped, 0);
});
