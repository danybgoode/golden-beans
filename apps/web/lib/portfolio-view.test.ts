import { test } from 'node:test'
import assert from 'node:assert/strict'
import { COULDNT_LOAD, asOfLabel, buildPortfolioRowView, spendLabel } from './portfolio-view.ts'

// portfolio-view S2.1 — what each cell SAYS and where it links (D2, D4, C1, C5, C6). Three shapes stay three.

const links = {
  today: '/app?project=gf',
  northStar: '/app/north-star/gf',
  report: '/hub/gf/report',
  experiments: '/app/experiments/gf',
  flags: '/app/flags/gf',
  finops: '/app/finops/gf',
}

const row = {
  project: { id: 'id-gf', slug: 'gf', role: 'owner' },
  loop_stage: { value: 'operate' },
  north_star: { value: { metric: 'payable_sellers', inputs: 2 } },
  funnel_stage: { value: 'retained' as const },
  experiments_running: { value: 1 },
  kill_switches_off: { value: 0 },
  epic_lead_time_days: { value: 3.1, as_of: '2026-09-30T10:00:00Z' },
  spend_vs_quote: { value: { usd: 410.4, deltaPct: 18, epics: 5 }, as_of: '2026-10-03T02:17:31Z' },
}

test('2.1: a full row reads as values, each linked to the page it came from', () => {
  const v = buildPortfolioRowView(row, links)
  assert.deepEqual(v.northStar, {
    text: 'payable_sellers',
    detail: '2 inputs',
    tone: 'value',
    href: links.northStar,
  })
  assert.deepEqual(v.funnel, {
    text: 'Retained',
    detail: 'furthest stage reached',
    tone: 'value',
    href: links.report,
  })
  assert.deepEqual(v.running, { text: '1 experiment', tone: 'value', href: links.experiments })
  assert.deepEqual(v.killSwitches, { text: '0 kill switches off', tone: 'value', href: links.flags })
  assert.deepEqual(v.leadTime, {
    text: '3.1 d',
    detail: 'as of 2026-09-30',
    tone: 'value',
    href: links.report,
  })
  assert.deepEqual(v.spend, {
    text: '≈$410 · +18% (5 quoted epics)',
    detail: 'as of 2026-10-03',
    tone: 'value',
    href: links.finops,
  })
})

test('2.1 / D2: an absent cell shows its reason, an errored one says so — neither shows a number, neither is a link', () => {
  const v = buildPortfolioRowView(
    {
      ...row,
      north_star: { value: null, reason: 'no North Star set' },
      spend_vs_quote: { error: true },
      experiments_running: { value: null, reason: 'no experiments defined' },
    },
    links
  )
  assert.deepEqual(v.northStar, { text: 'no North Star set', tone: 'absent' })
  assert.deepEqual(v.spend, { text: COULDNT_LOAD, tone: 'error' })
  assert.equal(v.running.text, 'no experiments defined')
  for (const cell of [v.northStar, v.spend, v.running]) assert.doesNotMatch(cell.text, /\d/)
})

test('2.1: a surface whose gate is off for this viewer is not linked', () => {
  const v = buildPortfolioRowView(row, { today: links.today, report: links.report })
  assert.equal(v.northStar.href, undefined)
  assert.equal(v.running.href, undefined)
  assert.equal(v.spend.href, undefined)
  assert.equal(v.funnel.href, links.report)
})

test('D4: pushed figures say the day they were pushed', () => {
  assert.equal(asOfLabel('2026-07-26T13:50:48.287Z'), 'as of 2026-07-26')
})

test('1.4: the label says the sum, the delta and how many epics it is over', () => {
  assert.equal(spendLabel({ usd: 410.4, deltaPct: 18, epics: 5 }), '≈$410 · +18% (5 quoted epics)')
  assert.equal(spendLabel({ usd: 96, deltaPct: -6, epics: 2 }), '≈$96.00 · −6% (2 quoted epics)')
  assert.equal(spendLabel({ usd: 12.5, deltaPct: 0, epics: 1 }), '≈$12.50 · ±0% (1 quoted epic)')
  assert.equal(spendLabel({ usd: 12.5, deltaPct: null, epics: 1 }), '≈$12.50 (1 quoted epic)')
})
