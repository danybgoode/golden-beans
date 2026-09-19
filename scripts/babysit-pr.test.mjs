// babysit-pr.test.mjs — pure-logic coverage for decideBabysitActions (no gh/git I/O — those are
// exercised live, --dry-run, against a real open PR per the sprint's verification walkthrough).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideBabysitActions, actionsRunIdFromDetailsUrl, buildComment } from './babysit-pr.mjs';

test('clean PR (mergeable, no failing/pending checks) → allClean true, nothing to do', () => {
  const d = decideBabysitActions({
    mergeable: 'MERGEABLE',
    checks: [{ name: 'ci', conclusion: 'SUCCESS' }],
  });
  assert.equal(d.conflict, false);
  assert.deepEqual(d.failingChecks, []);
  assert.deepEqual(d.pendingChecks, []);
  assert.equal(d.allClean, true);
});

test('conflicting PR with otherwise-green checks → conflict true, allClean false', () => {
  const d = decideBabysitActions({
    mergeable: 'CONFLICTING',
    checks: [{ name: 'ci', conclusion: 'SUCCESS' }],
  });
  assert.equal(d.conflict, true);
  assert.equal(d.failingChecks.length, 0);
  assert.equal(d.allClean, false);
});

test('failing check on an otherwise-mergeable PR → surfaced, not clean', () => {
  const d = decideBabysitActions({
    mergeable: 'MERGEABLE',
    checks: [
      { name: 'ci', conclusion: 'FAILURE' },
      { name: 'lint', conclusion: 'SUCCESS' },
    ],
  });
  assert.equal(d.conflict, false);
  assert.equal(d.failingChecks.length, 1);
  assert.equal(d.failingChecks[0].name, 'ci');
  assert.equal(d.allClean, false);
});

test('a still-in-progress check is pending, not failing, and does not block allClean on its own', () => {
  const d = decideBabysitActions({
    mergeable: 'MERGEABLE',
    checks: [{ name: 'ci', status: 'IN_PROGRESS' }],
  });
  assert.equal(d.failingChecks.length, 0);
  assert.equal(d.pendingChecks.length, 1);
  assert.equal(d.allClean, true); // pending isn't a failure — nothing actionable to retry/surface yet
});

test('conflict AND a failing check both surface together', () => {
  const d = decideBabysitActions({
    mergeable: 'CONFLICTING',
    checks: [{ name: 'ci', conclusion: 'ERROR' }],
  });
  assert.equal(d.conflict, true);
  assert.equal(d.failingChecks.length, 1);
  assert.equal(d.allClean, false);
});

test('missing/undefined checks array degrades to empty, not a throw', () => {
  const d = decideBabysitActions({ mergeable: 'MERGEABLE', checks: undefined });
  assert.deepEqual(d.failingChecks, []);
  assert.deepEqual(d.pendingChecks, []);
  assert.equal(d.allClean, true);
});

test('a legacy/external status context (state, no conclusion) failing is still caught — not silently clean', () => {
  const d = decideBabysitActions({
    mergeable: 'MERGEABLE',
    checks: [{ name: 'external-ci', state: 'FAILURE' }],
  });
  assert.equal(d.failingChecks.length, 1);
  assert.equal(d.allClean, false);
});

test('actionsRunIdFromDetailsUrl extracts the run id from a GitHub Actions job URL', () => {
  const url = 'https://github.com/o/r/actions/runs/28542370519/job/84619135130';
  assert.equal(actionsRunIdFromDetailsUrl(url), '28542370519');
});

test('actionsRunIdFromDetailsUrl returns null for a non-Actions / missing URL', () => {
  assert.equal(actionsRunIdFromDetailsUrl('https://circleci.com/gh/o/r/123'), null);
  assert.equal(actionsRunIdFromDetailsUrl(undefined), null);
  assert.equal(actionsRunIdFromDetailsUrl(''), null);
});

// ---- buildComment ----
// A run whose rerun attempt ITSELF errored (e.g. "already running") is a DIFFERENT fact from "nothing
// needed a retry" — confirmed live, 2026-07-02/03: a rerun attempt on PR #23 errored, and the two cases
// need to read differently to a human deciding whether to look closer.

test('buildComment: nothing failed, no retry attempted → the plain "no retry needed" line', () => {
  const body = buildComment({
    conflict: false,
    retried: [],
    retryFailures: [],
    dryRun: false,
    noAutoRetryNames: [],
    stillPendingNames: [],
  });
  assert.match(body, /No failing CI runs needed a retry/);
  assert.doesNotMatch(body, /Retry attempt itself failed/);
});

test('buildComment: a successful retry is reported, not the "no retry needed" line', () => {
  const body = buildComment({
    conflict: false,
    retried: [123],
    retryFailures: [],
    dryRun: false,
    noAutoRetryNames: [],
    stillPendingNames: [],
  });
  assert.match(body, /Retried failing Actions run\(s\): #123/);
  assert.doesNotMatch(body, /No failing CI runs needed a retry/);
});

test('buildComment: a retry attempt that itself errored is surfaced distinctly, not folded into "no retry needed"', () => {
  const body = buildComment({
    conflict: false,
    retried: [],
    retryFailures: [{ runId: 456, error: 'run 456 cannot be rerun; This workflow is already running' }],
    dryRun: false,
    noAutoRetryNames: [],
    stillPendingNames: [],
  });
  assert.match(body, /Retry attempt itself failed for: #456/);
  assert.match(body, /already running/);
  assert.doesNotMatch(body, /No failing CI runs needed a retry/);
});

test('buildComment: a mix of successful and failed retries reports both', () => {
  const body = buildComment({
    conflict: false,
    retried: [1],
    retryFailures: [{ runId: 2, error: 'some error' }],
    dryRun: false,
    noAutoRetryNames: [],
    stillPendingNames: [],
  });
  assert.match(body, /Retried failing Actions run\(s\): #1/);
  assert.match(body, /Retry attempt itself failed for: #2/);
});
