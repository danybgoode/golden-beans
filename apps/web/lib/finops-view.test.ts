import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildFinopsView, epicsCsv, storiesDoneOf } from './finops-view.ts'

// finops · Story 3.3 — every number on /app/finops, without rendering it.

const NOW = new Date('2026-10-15T12:00:00Z')
const epic = (over: Record<string, unknown> = {}) => ({
  slug: 'workspaces',
  name: 'Workspaces',
  appetite: 'M',
  shipped: true,
  quoteLow: 24,
  quoteHigh: 35,
  actualUsd: 33.08,
  deltaPct: -5,
  verdict: 'inside' as const,
  storiesDone: 10,
  ...over,
})
const total = (usd: number, sessions = 1) => ({ usd, usdLowerBound: false, tokens: 2_000_000, sessions })
const empty = { epics: [], snapshots: [], byEpic: {}, bySkill: {}, byModel: {}, lastAt: null, now: NOW }

test('nothing from either source is the empty state — never a page of zeros', () => {
  assert.deepEqual(buildFinopsView(empty), { state: 'empty' })
  assert.deepEqual(
    buildFinopsView({
      ...empty,
      epics: [epic({ quoteLow: null, quoteHigh: null, actualUsd: null, verdict: null })],
    }),
    { state: 'empty' },
    'an epic with neither a quote nor an actual is not data'
  )
})

test('the three tiles: this month’s spend, the quote hit rate, cost per shipped story', () => {
  const v = buildFinopsView({
    ...empty,
    epics: [
      epic(),
      epic({ slug: 'over', name: 'Over', actualUsd: 71, verdict: 'over', deltaPct: 103, storiesDone: 5 }),
    ],
    snapshots: [
      { epic: 'finops', usd_estimate: 12.5, last_at: '2026-10-02T10:00:00.000Z', session_id: 'a' },
      { epic: 'finops', usd_estimate: 99, last_at: '2026-09-30T10:00:00.000Z', session_id: 'b' },
    ],
    byEpic: { finops: total(111.5, 2) },
  })
  assert.equal(v.state, 'populated')
  if (v.state !== 'populated') return
  assert.deepEqual(
    v.tiles.map((t) => [t.label, t.value]),
    [
      ['Spend this month', '≈$13'],
      ['Quote hit rate', '1 of 2'],
      ['Cost per shipped story', '≈$7'],
    ]
  )
})

test('absent tiles say so in words', () => {
  const v = buildFinopsView({ ...empty, epics: [epic({ shipped: false, actualUsd: null, verdict: null })] })
  assert.equal(v.state, 'populated')
  if (v.state !== 'populated') return
  for (const t of v.tiles) assert.equal(t.value, null, t.label)
  assert.match(v.tiles[1].absent, /No quoted epic has shipped yet/)
})

test('an epic row: the stamped actual wins; while building it is the live push, “so far”', () => {
  const v = buildFinopsView({
    ...empty,
    epics: [
      epic(),
      epic({
        slug: 'finops',
        name: 'FinOps',
        shipped: false,
        quoteLow: null,
        quoteHigh: null,
        actualUsd: null,
        verdict: null,
        deltaPct: null,
      }),
    ],
    byEpic: { finops: total(6.4, 3) },
  })
  if (v.state !== 'populated') return assert.fail('populated')
  const [ws, fo] = v.epics
  assert.deepEqual([ws.quote, ws.actual, ws.actualSource, ws.delta], ['$24–35', '≈$33', 'stamped', '−5%'])
  assert.deepEqual(
    [fo.quote, fo.actual, fo.actualSource, fo.sessions],
    ['not quoted', '≈$6 so far', 'live', '3']
  )
})

test('storiesDoneOf reads only the extractor’s exact shape', () => {
  assert.equal(storiesDoneOf('10/13 stories'), 10)
  assert.equal(storiesDoneOf('3 sprints'), null)
  assert.equal(storiesDoneOf(undefined), null)
})

test('the CSV quotes every cell and defuses a formula-looking one', () => {
  const v = buildFinopsView({ ...empty, epics: [epic({ name: '=HYPERLINK("x")' })] })
  if (v.state !== 'populated') return assert.fail('populated')
  const csv = epicsCsv(v.epics)
  assert.match(
    csv.split('\n')[0],
    /^"Epic","Slug","Appetite","Quote","Actual","Actual source","Δ","Sessions"$/
  )
  assert.match(csv.split('\n')[1], /^"'=HYPERLINK\(""x""\)"/)
})
