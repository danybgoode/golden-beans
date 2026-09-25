import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildEventCatalog, type EventCatalogRow } from './event-catalog.ts'

const asOf = new Date('2026-09-24T12:00:00.000Z')

function row(overrides: Partial<EventCatalogRow> = {}): EventCatalogRow {
  return {
    event: 'checkout_completed',
    tags: {},
    subject_type: 'merchant',
    subject_id: 'merchant-1',
    created_at: '2026-09-24T11:00:00.000Z',
    ...overrides,
  }
}

function catalog(rows: EventCatalogRow[]) {
  return buildEventCatalog(rows, { asOf, rowCap: 50_000, windowDays: 14 })
}

test('buildEventCatalog returns D11 counts, UTC daily series, entities, and baselines', () => {
  const result = catalog([
    row({
      event: 'checkout_completed',
      subject_id: 'merchant-1',
      tags: { source: 'google', plan: 'pro', region: 'mx' },
      created_at: '2026-09-24T11:00:00.000Z',
    }),
    row({
      event: 'checkout_completed',
      subject_id: 'merchant-2',
      tags: { source: 'email', plan: 'starter' },
      created_at: '2026-09-23T11:59:00.000Z',
    }),
    row({
      event: 'signup_completed',
      subject_type: 'visitor',
      subject_id: 'visitor-1',
      tags: { source: 'google', channel: 'paid', plan: 'pro' },
      created_at: '2026-09-11T23:59:00.000Z',
    }),
    row({
      event: 'checkout_completed',
      subject_id: 'merchant-1',
      tags: { source: 'google', plan: 'pro' },
      created_at: '2026-09-10T11:59:00.000Z',
    }),
  ])

  assert.deepEqual(result.events, [
    {
      event: 'checkout_completed',
      count14d: 2,
      count24h: 1,
      daily: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1],
      reserved: false,
    },
    {
      event: 'signup_completed',
      count14d: 1,
      count24h: 0,
      daily: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
      reserved: false,
    },
  ])
  assert.deepEqual(result.entities, [
    { type: 'merchant', subjects14d: 2 },
    { type: 'visitor', subjects14d: 1 },
  ])
  assert.deepEqual(result.baselines, [
    { event: 'checkout_completed', type: 'merchant', baseline: 1 },
    { event: 'checkout_completed', type: 'visitor', baseline: 0 },
    { event: 'signup_completed', type: 'merchant', baseline: 0 },
    { event: 'signup_completed', type: 'visitor', baseline: 1 },
  ])
  assert.deepEqual(result.segments, [
    {
      field: 'source',
      coverage: 1,
      values: [
        { value: 'google', share: 2 / 3 },
        { value: 'email', share: 1 / 3 },
      ],
    },
    { field: 'channel', coverage: 1 / 3, values: [{ value: 'paid', share: 1 }] },
    { field: 'campaign', coverage: 0, values: [] },
    {
      field: 'plan',
      coverage: 1,
      values: [
        { value: 'pro', share: 2 / 3 },
        { value: 'starter', share: 1 / 3 },
      ],
    },
    { field: 'region', coverage: 1 / 3, values: [{ value: 'mx', share: 1 }] },
  ])
  assert.equal(result.asOf, asOf.toISOString())
  assert.equal(result.truncated, false)
})

test('buildEventCatalog marks reserved events, preserves typed values, caps values, and counts production flags', () => {
  const rows = Array.from({ length: 22 }, (_, index) =>
    row({
      event: index === 0 ? 'experiment_exposed' : index === 1 ? '$error' : 'flag_evaluated',
      subject_id: `merchant-${index}`,
      tags: {
        campaign: index === 20 ? 1 : index === 21 ? '1' : `campaign-${String(21 - index).padStart(2, '0')}`,
        environment: index < 3 ? 'production' : 'staging',
        flag_key: index < 2 ? 'checkout' : 'search',
      },
      created_at: '2026-09-24T11:00:00.000Z',
    })
  )
  const result = buildEventCatalog(rows, { asOf, rowCap: 22, windowDays: 14 })

  assert.equal(result.truncated, true)
  assert.deepEqual(
    result.events.filter(({ reserved }) => reserved).map(({ event }) => event),
    ['$error', 'experiment_exposed', 'flag_evaluated']
  )
  const campaign = result.segments.find(({ field }) => field === 'campaign')!
  assert.equal(campaign.coverage, 1)
  assert.equal(campaign.values.length, 20)
  assert.deepEqual(campaign.values.slice(0, 3), [
    { value: 1, share: 1 / 22 },
    { value: '1', share: 1 / 22 },
    { value: 'campaign-02', share: 1 / 22 },
  ])
  assert.deepEqual(result.flagEvaluations, [{ flagKey: 'search', evaluations: 1 }])
})

test('buildEventCatalog returns an honest empty catalog and rejects a non-D11 window', () => {
  const result = catalog([])
  assert.deepEqual(result.events, [])
  assert.deepEqual(result.entities, [])
  assert.deepEqual(result.baselines, [])
  assert.deepEqual(result.flagEvaluations, [])
  assert.deepEqual(
    result.segments.map(({ field, coverage, values }) => ({ field, coverage, values })),
    [
      { field: 'source', coverage: 0, values: [] },
      { field: 'channel', coverage: 0, values: [] },
      { field: 'campaign', coverage: 0, values: [] },
      { field: 'plan', coverage: 0, values: [] },
      { field: 'region', coverage: 0, values: [] },
    ]
  )
  assert.throws(() => buildEventCatalog([], { asOf, rowCap: 50_000, windowDays: 7 }), /windowDays must be 14/)
})

test('buildEventCatalog represents a seen type with no subject identifier as an unknown baseline', () => {
  const result = catalog([row({ subject_type: 'anonymous', subject_id: null })])
  assert.deepEqual(result.entities, [{ type: 'anonymous', subjects14d: 0 }])
  assert.deepEqual(result.baselines, [{ event: 'checkout_completed', type: 'anonymous', baseline: null }])
})

// ── the window's edges (fresh reviewer, PR #169: no fixture sat on a boundary) ──────────────────
test('the window is exactly the 14 UTC days the daily series draws, inclusive of asOf and of the first midnight', () => {
  const result = catalog([
    row({ created_at: '2026-09-11T00:00:00.000Z' }), // first bucket's midnight — in
    row({ created_at: '2026-09-10T23:59:59.999Z' }), // the day before — out
    row({ created_at: '2026-09-24T12:00:00.000Z' }), // exactly asOf — in
    row({ created_at: '2026-09-24T12:00:00.001Z' }), // after asOf — out
    row({ created_at: '2026-09-23T12:00:00.000Z' }), // exactly asOf − 24h — in the 24h count
    row({ created_at: '2026-09-23T11:59:59.999Z' }), // just before — out of it
  ])
  const event = result.events[0]
  assert.equal(event.count14d, 4)
  assert.equal(
    event.daily.reduce((sum, n) => sum + n, 0),
    event.count14d
  )
  assert.equal(event.daily[0], 1)
  assert.equal(event.count24h, 2)
})
