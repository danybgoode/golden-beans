import { test } from 'node:test'
import assert from 'node:assert/strict'
import { aggregateDailyRevenue } from './revenue-sync-payload.mjs'

test('aggregateDailyRevenue sums same-day amounts and converts cents to dollars', () => {
  const result = aggregateDailyRevenue([
    { amountCents: 10050, capturedAt: '2026-01-01T08:00:00Z' },
    { amountCents: 4950, capturedAt: '2026-01-01T20:00:00Z' },
  ])
  assert.deepEqual(result, [{ occurredOn: '2026-01-01', value: 150 }])
})

test('aggregateDailyRevenue produces one sorted entry per distinct day', () => {
  const result = aggregateDailyRevenue([
    { amountCents: 20000, capturedAt: '2026-01-03T12:00:00Z' },
    { amountCents: 10000, capturedAt: '2026-01-01T12:00:00Z' },
    { amountCents: 5000, capturedAt: '2026-01-02T12:00:00Z' },
  ])
  assert.deepEqual(result, [
    { occurredOn: '2026-01-01', value: 100 },
    { occurredOn: '2026-01-02', value: 50 },
    { occurredOn: '2026-01-03', value: 200 },
  ])
})

test('aggregateDailyRevenue buckets by UTC calendar day regardless of time-of-day', () => {
  const result = aggregateDailyRevenue([
    { amountCents: 100, capturedAt: '2026-01-01T00:00:00.000Z' },
    { amountCents: 200, capturedAt: '2026-01-01T23:59:59.999Z' },
  ])
  assert.deepEqual(result, [{ occurredOn: '2026-01-01', value: 3 }])
})

test('aggregateDailyRevenue returns an empty array for no events', () => {
  assert.deepEqual(aggregateDailyRevenue([]), [])
})

test('aggregateDailyRevenue rounds to the nearest cent (no fractional-cent drift)', () => {
  const result = aggregateDailyRevenue([
    { amountCents: 1, capturedAt: '2026-01-01T00:00:00Z' },
    { amountCents: 1, capturedAt: '2026-01-01T01:00:00Z' },
    { amountCents: 1, capturedAt: '2026-01-01T02:00:00Z' },
  ])
  assert.deepEqual(result, [{ occurredOn: '2026-01-01', value: 0.03 }])
})
