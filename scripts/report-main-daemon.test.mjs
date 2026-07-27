import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lockDecision } from './report-main-daemon.mjs';

test('an initializing lock is held, never unlinked by a concurrent trigger', () => {
  assert.equal(lockDecision({ raw: '', ageMs: 5, ownerAlive: false }), 'held');
  assert.equal(lockDecision({ raw: '{', ageMs: 59_999, ownerAlive: false }), 'held');
});

test('an abandoned malformed lock becomes recoverable after its grace period', () => {
  assert.equal(lockDecision({ raw: '', ageMs: 60_000, ownerAlive: false }), 'recover');
});

test('a living valid owner keeps the mutex and a dead one is recoverable', () => {
  const raw = JSON.stringify({ pid: 12345 });
  assert.equal(lockDecision({ raw, ageMs: 10_000, ownerAlive: true }), 'held');
  assert.equal(lockDecision({ raw, ageMs: 10_000, ownerAlive: false }), 'recover');
});
