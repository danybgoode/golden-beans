import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  CELL_TIMEOUT_MS,
  REASONS,
  assemblePortfolio,
  experimentsRunningCell,
  funnelStageCell,
  killSwitchesOffCell,
  leadTimeCell,
  loopStageCell,
  northStarCell,
  spendCell,
  spendLabel,
  withTimeout,
  type EpicSpendFacts,
  type OutcomeFacts,
  type PortfolioReaders,
} from './portfolio-model.ts'

// portfolio-view S1.1, S1.2, S1.4 — every shaping rule, with readers injected (no database, no session).
// The lock's D2 is the thing under test throughout: a missing or failed read is NEVER a number.

const outcome = (over: Partial<OutcomeFacts> = {}): OutcomeFacts => ({
  unavailable: false,
  rows: [{ tars: { targeted: 10, adopted: 4, retained: 0 } }],
  northStar: { metric: 'payable_sellers', inputCount: 2 },
  ...over,
})

const epics = (payload: unknown) => payload as EpicSpendFacts[]

const fullReaders = (over: Partial<PortfolioReaders> = {}): PortfolioReaders => ({
  loopStage: async () => 'operate',
  outcome: async () => outcome(),
  experiments: async () => [{ versions: [{ status: 'running' }] }, { versions: [{ status: 'stopped' }] }],
  flags: async () => [
    { polarity: 'killswitch', state: 'off' },
    { polarity: 'killswitch', state: 'on' },
    { polarity: 'enablement', state: 'off' },
  ],
  podReport: async () => ({
    payload: { delivery: { epicLeadTime: { medianDays: 3.1 } } },
    generatedAt: '2026-09-30T10:00:00Z',
  }),
  roadmap: async () => ({
    payload: [
      { quoteHigh: 30, actualUsd: 36 },
      { quoteHigh: null, actualUsd: 12 },
    ],
    generatedAt: '2026-09-29T10:00:00Z',
  }),
  epicSpend: epics,
  ...over,
})

const P = (slug: string) => ({ id: `id-${slug}`, slug, role: 'owner' })

test('1.1: one row per project handed in, in its order, and nothing else', async () => {
  const rows = await assemblePortfolio([P('b'), P('a')], fullReaders())
  assert.deepEqual(
    rows.map((r) => r.project.slug),
    ['b', 'a']
  )
  assert.deepEqual(await assemblePortfolio([], fullReaders()), [])
})

test('1.1: every reader is called with THAT row’s project id — never another', async () => {
  const seen: string[] = []
  const spy = (label: string) => async (id: string) => {
    seen.push(`${label}:${id}`)
    return null
  }
  await assemblePortfolio([P('x')], {
    ...fullReaders(),
    loopStage: spy('loop'),
    podReport: spy('pod'),
    roadmap: spy('roadmap'),
  })
  assert.deepEqual(seen.sort(), ['loop:id-x', 'pod:id-x', 'roadmap:id-x'])
})

test('1.1: a full row has the locked shape (C8)', async () => {
  const [row] = await assemblePortfolio([P('gf')], fullReaders())
  assert.deepEqual(row, {
    project: P('gf'),
    loop_stage: { value: 'operate' },
    north_star: { value: { metric: 'payable_sellers', inputs: 2 } },
    funnel_stage: { value: 'adopted' },
    experiments_running: { value: 1 },
    kill_switches_off: { value: 1 },
    epic_lead_time_days: { value: 3.1, as_of: '2026-09-30T10:00:00Z' },
    spend_vs_quote: { value: { usd: 36, deltaPct: 20, epics: 1 }, as_of: '2026-09-29T10:00:00Z' },
  })
})

test('1.2: each “not set” carries its own reason — never a 0', async () => {
  assert.deepEqual(loopStageCell(null), { value: null, reason: REASONS.notPlaced })
  assert.deepEqual(northStarCell(outcome({ northStar: null })), { value: null, reason: REASONS.noNorthStar })
  assert.deepEqual(funnelStageCell(outcome({ rows: [] })), { value: null, reason: REASONS.noFeatures })
  assert.deepEqual(funnelStageCell(outcome({ rows: [{ tars: { targeted: 0, adopted: 0, retained: 0 } }] })), {
    value: null,
    reason: REASONS.nobodyTargeted,
  })
  assert.deepEqual(experimentsRunningCell([]), { value: null, reason: REASONS.noExperiments })
  assert.deepEqual(killSwitchesOffCell([{ polarity: 'enablement', state: 'off' }]), {
    value: null,
    reason: REASONS.noKillSwitches,
  })
  assert.deepEqual(leadTimeCell(null), { value: null, reason: REASONS.noReport })
  assert.deepEqual(
    leadTimeCell({ payload: { delivery: { epicLeadTime: { medianDays: null } } }, generatedAt: 't' }),
    {
      value: null,
      reason: REASONS.noLeadTime,
    }
  )
})

test('1.2: a REAL zero stays a zero — it is a measurement, not an absence', () => {
  assert.deepEqual(experimentsRunningCell([{ versions: [{ status: 'stopped' }] }]), { value: 0 })
  assert.deepEqual(killSwitchesOffCell([{ polarity: 'killswitch', state: 'on' }]), { value: 0 })
  assert.deepEqual(
    leadTimeCell({ payload: { delivery: { epicLeadTime: { medianDays: 0 } } }, generatedAt: 't' }),
    {
      value: 0,
      as_of: 't',
    }
  )
})

test('1.2: a failed read is “couldn’t load” — distinct from both a value and an absence', () => {
  assert.deepEqual(
    northStarCell(outcome({ northStar: { metric: null, inputCount: null, unavailable: true } })),
    {
      error: true,
    }
  )
  assert.deepEqual(funnelStageCell(outcome({ unavailable: true })), { error: true })
  // The shared outcome read failed: getProjectOutcome then reports northStar: null, which must NOT read as "none set".
  assert.deepEqual(northStarCell(outcome({ unavailable: true, rows: [], northStar: null })), { error: true })
  // Every feature's funnel failed: that is not "nobody targeted".
  assert.deepEqual(funnelStageCell(outcome({ rows: [{ tars: null }, { tars: null }] })), { error: true })
  // One failed, one read: the unread one may have got further, so the cell cannot answer — not even "nobody targeted".
  assert.deepEqual(
    funnelStageCell(outcome({ rows: [{ tars: null }, { tars: { targeted: 3, adopted: 2, retained: 1 } }] })),
    { error: true }
  )
  assert.deepEqual(
    funnelStageCell(outcome({ rows: [{ tars: null }, { tars: { targeted: 0, adopted: 0, retained: 0 } }] })),
    { error: true }
  )
})

test('1.2: a throwing reader errors ITS cell only; the rest of the row still renders', async () => {
  const [row] = await assemblePortfolio(
    [P('a')],
    fullReaders({
      experiments: async () => {
        throw new Error('db down')
      },
      flags: () => {
        throw new Error('sync throw')
      },
    })
  )
  assert.deepEqual(row.experiments_running, { error: true })
  assert.deepEqual(row.kill_switches_off, { error: true })
  assert.deepEqual(row.loop_stage, { value: 'operate' })
  assert.deepEqual(row.epic_lead_time_days, { value: 3.1, as_of: '2026-09-30T10:00:00Z' })
})

test('1.2 / D7: one slow read times out to its own cell; the page does not wait on it', async () => {
  const started = Date.now()
  const [row] = await assemblePortfolio(
    [P('a')],
    fullReaders({ roadmap: () => new Promise(() => {}) }), // never settles
    50
  )
  assert.ok(Date.now() - started < 1000, 'the row came back near the timeout, not never')
  assert.deepEqual(row.spend_vs_quote, { error: true })
  assert.deepEqual(row.experiments_running, { value: 1 })
})

test('1.2 / D7: the outcome read is shared — a slow one costs exactly the North Star and funnel cells', async () => {
  const [row] = await assemblePortfolio([P('a')], fullReaders({ outcome: () => new Promise(() => {}) }), 50)
  assert.deepEqual(row.north_star, { error: true })
  assert.deepEqual(row.funnel_stage, { error: true })
  assert.deepEqual(row.loop_stage, { value: 'operate' })
})

test('withTimeout: resolves, rejects and stalls are three different answers to the caller, two of them ok:false', async () => {
  assert.deepEqual(await withTimeout(Promise.resolve(7), 50), { ok: true, value: 7 })
  assert.deepEqual(await withTimeout(Promise.reject(new Error('x')), 50), { ok: false })
  assert.deepEqual(await withTimeout(new Promise(() => {}), 10), { ok: false })
})

test('1.4: spend sums only epics with BOTH a quote and an actual; Δ is against the quote tops', () => {
  const cell = spendCell(
    {
      payload: [
        { quoteHigh: 35, actualUsd: 56.13 },
        { quoteHigh: 17, actualUsd: 11 },
        { quoteHigh: 20, actualUsd: null }, // quoted, not measured — excluded
        { quoteHigh: null, actualUsd: 40 }, // measured, not quoted — excluded
      ],
      generatedAt: '2026-10-03T02:17:31Z',
    },
    epics
  )
  assert.deepEqual(cell, {
    value: { usd: 67.13, deltaPct: 29, epics: 2 },
    as_of: '2026-10-03T02:17:31Z',
  })
})

test('1.4: no roadmap pushed, or no quoted epics, is “no quotes yet” — never an error, never $0', () => {
  assert.deepEqual(spendCell(null, epics), { value: null, reason: REASONS.noQuotes })
  assert.deepEqual(spendCell({ payload: [], generatedAt: 't' }, epics), {
    value: null,
    reason: REASONS.noQuotes,
  })
  // A pre-finops roadmap: epics exist, none carries the fields.
  assert.deepEqual(spendCell({ payload: [{ quoteHigh: null, actualUsd: null }], generatedAt: 't' }, epics), {
    value: null,
    reason: REASONS.noQuotes,
  })
})

test('1.4: the label says the sum, the delta and how many epics it is over', () => {
  assert.equal(spendLabel({ usd: 410.4, deltaPct: 18, epics: 5 }), '≈$410 · +18% (5 quoted epics)')
  assert.equal(spendLabel({ usd: 96, deltaPct: -6, epics: 2 }), '≈$96.00 · −6% (2 quoted epics)')
  assert.equal(spendLabel({ usd: 12.5, deltaPct: 0, epics: 1 }), '≈$12.50 · ±0% (1 quoted epic)')
  assert.equal(spendLabel({ usd: 12.5, deltaPct: null, epics: 1 }), '≈$12.50 (1 quoted epic)')
})

test('D7: the per-cell timeout is the locked 5000 ms', () => {
  assert.equal(CELL_TIMEOUT_MS, 5000)
})
