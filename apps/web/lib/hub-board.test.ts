import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROADMAP_STAGES, type RoadmapRow } from './roadmap-artifact-schema.ts'
import { BOARD_STAGES, boardQuery, buildBoard, findCard, hasStages, parseBoardFilters } from './hub-board.ts'

// board-sinks-and-scrumban · Sprint 2, Story 2.1 — the board's arithmetic, over a fixture artifact.

const NOW = new Date('2026-10-02T12:00:00Z')

const row = (over: Record<string, unknown>): RoadmapRow =>
  ({ grain: 'Epic', status: 'Scaffolded', area: '02 Commercial', ...over }) as RoadmapRow

const ITEMS: RoadmapRow[] = [
  row({
    name: 'CMS integration',
    slug: 'cms',
    stage: 'Ready to build',
    build_order_num: 18,
    type: 'Spike',
    risk: 'Low',
  }),
  row({
    name: 'Finops',
    slug: 'finops',
    stage: 'Ready to build',
    build_order_num: 40,
    type: 'Feature',
    risk: 'High',
  }),
  row({
    name: 'Unordered fix',
    slug: 'fix',
    grain: 'Seed',
    stage: 'Ready to build',
    type: 'Bug',
    risk: 'Low',
  }),
  row({
    name: 'One plugin',
    slug: 'plugin',
    stage: 'QA',
    build_order_num: 34,
    type: 'Feature',
    risk: 'High',
  }),
  row({ name: 'Monorepo', slug: 'mono', stage: 'QA', build_order_num: 45, type: 'Feature', risk: 'High' }),
  row({
    name: 'This board',
    slug: 'board',
    stage: 'Building',
    build_order_num: 39,
    type: 'Feature',
    risk: 'High',
  }),
  row({ name: 'An idea', slug: 'idea', grain: 'Seed', stage: 'To groom', type: 'Chore' }),
  row({ name: 'A pitch', slug: 'pitch', grain: 'Seed', stage: 'Grooming', type: 'Spike' }),
  row({ name: 'Recent', slug: 'recent', stage: 'Shipped', shipped_at: '2026-10-01', type: 'Feature' }),
  row({ name: 'Older', slug: 'older', stage: 'Shipped', shipped_at: '2026-09-10', type: 'Feature' }),
  row({ name: 'Ancient', slug: 'ancient', stage: 'Shipped', shipped_at: '2026-07-01', type: 'Feature' }),
  row({ name: 'Archived', slug: 'gone', stage: null }),
  row({ name: 'This board — S1', slug: 'board--s1', grain: 'Sprint', stage: 'Building', epic_slug: 'board' }),
]

const names = (b: ReturnType<typeof buildBoard>, stage: string) =>
  b.columns.find((c) => c.stage === stage)!.cards.map((c) => c.name)

test('the Hub copy of the six stages is the resolver’s list, word for word (D19)', () => {
  const here = dirname(fileURLToPath(import.meta.url))
  const src = readFileSync(join(here, '..', '..', '..', 'scripts', 'lib', 'stage.mjs'), 'utf8')
  const m = src.match(/export const STAGES = Object\.freeze\(\[([^\]]+)\]\)/)
  assert.ok(m, 'STAGES not found in scripts/lib/stage.mjs')
  const resolver = [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1])
  assert.deepEqual([...ROADMAP_STAGES], resolver, 'the push schema')
  assert.deepEqual([...BOARD_STAGES], resolver, 'the board')
})

test('six columns in board order; cards are initiatives — no sprints, nothing archived', () => {
  const b = buildBoard(ITEMS, { now: NOW })
  assert.deepEqual(
    b.columns.map((c) => c.stage),
    ['To groom', 'Grooming', 'Ready to build', 'Building', 'QA', 'Shipped']
  )
  assert.deepEqual(names(b, 'Building'), ['This board'])
  assert.equal(b.total, 10)
})

test('Ready to build runs in build order, an unordered card last; QA in build order', () => {
  const b = buildBoard(ITEMS, { now: NOW })
  assert.deepEqual(names(b, 'Ready to build'), ['CMS integration', 'Finops', 'Unordered fix'])
  assert.deepEqual(names(b, 'QA'), ['One plugin', 'Monorepo'])
})

test('Shipped shows the last 30 days, newest first, and counts what left the window', () => {
  const b = buildBoard(ITEMS, { now: NOW })
  assert.deepEqual(names(b, 'Shipped'), ['Recent', 'Older'])
  assert.equal(b.shippedOutsideWindow, 1)
})

test('the answer line: the approved sentence, with the next pull', () => {
  const b = buildBoard(ITEMS, { now: NOW })
  assert.equal(
    b.answer,
    '2 initiatives in QA and 1 building. Next to pull: CMS integration (build order 18).'
  )
  assert.equal(b.nextToPull?.slug, 'cms')
})

test('WIP: under, at and over the limit; over is said in the answer line, never enforced', () => {
  const at = buildBoard(ITEMS, { now: NOW, wip: { Building: 1, QA: 3 } })
  const building = at.columns.find((c) => c.stage === 'Building')!
  assert.deepEqual(building.wip, { limit: 1, count: 1, over: false, at: true })
  assert.deepEqual(at.columns.find((c) => c.stage === 'QA')!.wip, {
    limit: 3,
    count: 2,
    over: false,
    at: false,
  })
  const over = buildBoard(ITEMS, { now: NOW, wip: { QA: 1 } })
  assert.match(over.answer, / QA is over its WIP limit \(2 of 1\)\.$/)
  assert.equal(over.columns.find((c) => c.stage === 'Building')!.wip, null, 'no limit, no WIP state')
})

test('WIP counts the whole column even when a filter hides some of it (a team limit, not a view limit)', () => {
  const spikes = buildBoard(ITEMS, {
    now: NOW,
    wip: { QA: 1 },
    filters: parseBoardFilters({ type: 'spike' }),
  })
  const qa = spikes.columns.find((c) => c.stage === 'QA')!
  assert.equal(qa.cards.length, 0, 'no spike is in QA')
  assert.deepEqual(qa.wip, { limit: 1, count: 2, over: true, at: false })
  assert.match(spikes.answer, /QA is over its WIP limit \(2 of 1\)/)
})

test('an empty flow says so, and nothing ready says so', () => {
  const b = buildBoard([row({ name: 'Done', slug: 'd', stage: 'Shipped', shipped_at: '2026-10-01' })], {
    now: NOW,
  })
  assert.equal(b.answer, 'Nothing is in QA or building. Nothing is ready to pull.')
})

test('filters: ?type=spike keeps only spikes; ?risk=high only high-risk; both compose', () => {
  const spikes = buildBoard(ITEMS, { now: NOW, filters: parseBoardFilters({ type: 'spike' }) })
  assert.equal(spikes.total, 2)
  assert.deepEqual(
    spikes.columns.flatMap((c) => c.cards.map((x) => x.type)),
    ['Spike', 'Spike']
  )
  const high = buildBoard(ITEMS, { now: NOW, filters: parseBoardFilters({ risk: 'high' }) })
  assert.ok(high.columns.every((c) => c.cards.every((x) => x.risk === 'High')))
  assert.equal(high.total, 4)
  const both = buildBoard(ITEMS, { now: NOW, filters: parseBoardFilters({ type: 'feature', risk: 'high' }) })
  assert.deepEqual(both.columns.flatMap((c) => c.cards.map((x) => x.slug)).sort(), [
    'board',
    'finops',
    'mono',
    'plugin',
  ])
})

test('filter parsing ignores junk and round-trips to a shareable query', () => {
  assert.deepEqual(parseBoardFilters({ type: 'epic', risk: 'medium' }), { type: null, highRisk: false })
  assert.deepEqual(parseBoardFilters({ type: ['Bug', 'spike'], risk: 'HIGH' }), {
    type: 'bug',
    highRisk: true,
  })
  assert.equal(boardQuery({ type: 'spike', highRisk: true }), '?type=spike&risk=high')
  assert.equal(boardQuery({ type: null, highRisk: false }), '')
  assert.equal(boardQuery({ type: 'spike', highRisk: false }, { card: 'cms' }), '?type=spike&card=cms')
})

test('findCard opens an initiative by slug; a sprint or an archived row is no card', () => {
  assert.equal(findCard(ITEMS, 'plugin')?.name, 'One plugin')
  assert.equal(findCard(ITEMS, 'board--s1'), null)
  assert.equal(findCard(ITEMS, 'gone'), null)
  assert.equal(findCard(ITEMS, 'nope'), null)
})

test('a payload pushed before the board has no stages, so the page shows its empty state', () => {
  assert.equal(hasStages([row({ name: 'Old', slug: 'old' })]), false)
  assert.equal(hasStages(ITEMS), true)
})
