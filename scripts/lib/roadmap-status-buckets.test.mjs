import assert from 'node:assert/strict';
import test from 'node:test';
import { EPIC_STATUS_ORDER, SEED_FUNNEL_STATUSES, isFunnelSeed } from './roadmap-status-buckets.mjs';

test('EPIC_STATUS_ORDER is the three epic buckets, in board order', () => {
  assert.deepEqual(EPIC_STATUS_ORDER, ['In progress', 'Scaffolded', 'Shipped']);
});

test('SEED_FUNNEL_STATUSES is exactly Raw/Ready/Queued', () => {
  assert.deepEqual([...SEED_FUNNEL_STATUSES].sort(), ['Queued', 'Raw', 'Ready']);
});

test('isFunnelSeed: true only for a Seed-grain row with a funnel status', () => {
  assert.equal(isFunnelSeed({ grain: 'Seed', status: 'Raw' }), true);
  assert.equal(isFunnelSeed({ grain: 'Seed', status: 'Ready' }), true);
  assert.equal(isFunnelSeed({ grain: 'Seed', status: 'Queued' }), true);
  assert.equal(isFunnelSeed({ grain: 'Seed', status: 'Shipped' }), false);
  assert.equal(isFunnelSeed({ grain: 'Seed', status: 'Scaffolded' }), false);
  assert.equal(isFunnelSeed({ grain: 'Seed', status: 'Archived' }), false);
  assert.equal(isFunnelSeed({ grain: 'Epic', status: 'Raw' }), false, 'grain must be Seed');
});

test('isFunnelSeed tolerates a missing/malformed row', () => {
  assert.equal(isFunnelSeed(null), false);
  assert.equal(isFunnelSeed(undefined), false);
  assert.equal(isFunnelSeed({}), false);
});
