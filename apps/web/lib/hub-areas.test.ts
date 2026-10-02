import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { RoadmapRow } from './roadmap-artifact-schema.ts'
import { areasAnswer, buildAreas, HORIZONS } from './hub-areas.ts'

// board-sinks-and-scrumban · Sprint 4, Story 4.1 — areas × Shipped · Now · Next · Later (D10).

const row = (over: Record<string, unknown>): RoadmapRow =>
  ({ grain: 'Epic', status: 'Scaffolded', area: '02 Commercial', ...over }) as RoadmapRow

const ITEMS: RoadmapRow[] = [
  row({
    name: 'One plugin',
    slug: 'plugin',
    stage: 'Building',
    build_order_num: 34,
    area: '09 Platform Infra',
  }),
  row({ name: 'Public monorepo', slug: 'mono', stage: 'QA', build_order_num: 45, area: '09 Platform Infra' }),
  row({ name: 'Workspaces', slug: 'ws', stage: 'Shipped', build_order_num: 38 }),
  row({ name: 'Portfolio', slug: 'portfolio', stage: 'Ready to build', build_order_num: 41 }),
  row({
    name: 'Finops',
    slug: 'finops',
    stage: 'Ready to build',
    build_order_num: 40,
    area: '09 Platform Infra',
  }),
  row({ name: 'An idea', slug: 'idea', grain: 'Seed', stage: 'To groom', area: '02 Commercial' }),
  row({ name: 'A pitch', slug: 'pitch', grain: 'Seed', stage: 'Grooming', build_order_num: 17 }),
  row({ name: 'Gone', slug: 'gone', stage: null, status: 'Archived' }),
  row({ name: 'Plugin — S1', slug: 'plugin--s1', grain: 'Sprint', stage: 'Building' }),
]

const cell = (v: ReturnType<typeof buildAreas>, area: string, h: (typeof HORIZONS)[number]) =>
  v.areas.find((a) => a.area === area)!.cells[h].map((i) => i.name)

test('the four horizons, in this order', () => {
  assert.deepEqual([...HORIZONS], ['Shipped', 'Now', 'Next', 'Later'])
})

test('areas are rows; Now = Building + QA, Next = Ready to build, Later = To groom + Grooming; each cell in build order', () => {
  const v = buildAreas(ITEMS)
  assert.deepEqual(
    v.areas.map((a) => a.area),
    ['02 Commercial', '09 Platform Infra']
  )
  assert.deepEqual(cell(v, '09 Platform Infra', 'Now'), ['One plugin', 'Public monorepo'])
  assert.deepEqual(cell(v, '09 Platform Infra', 'Next'), ['Finops'])
  assert.deepEqual(cell(v, '02 Commercial', 'Next'), ['Portfolio'])
  assert.deepEqual(
    cell(v, '02 Commercial', 'Later'),
    ['A pitch', 'An idea'],
    'build order first, unordered last'
  )
  assert.deepEqual(cell(v, '02 Commercial', 'Shipped'), ['Workspaces'])
})

test('sprints and archived rows never appear; epics are counted for the answer', () => {
  const v = buildAreas(ITEMS)
  const all = v.areas.flatMap((a) => HORIZONS.flatMap((h) => a.cells[h].map((i) => i.slug)))
  assert.ok(!all.includes('plugin--s1') && !all.includes('gone'))
  assert.deepEqual([v.epics, v.shippedEpics], [5, 1])
})

test('the answer: shipped of epics, then what is Now with its stage', () => {
  assert.equal(
    areasAnswer(buildAreas(ITEMS)),
    '1 of 5 epics have shipped. Now: One plugin (Building), Public monorepo (QA).'
  )
  assert.equal(
    areasAnswer(buildAreas([row({ name: 'Done', slug: 'd', stage: 'Shipped' })])),
    '1 of 1 epic has shipped. Nothing is being built or in QA right now.'
  )
})

test('the Hub never computes a stage (D19): a row without one is off the roadmap, never placed from its status', () => {
  const v = buildAreas([
    row({ name: 'Old shipped', slug: 'a', status: 'Shipped' }),
    row({ name: 'Old open', slug: 'b', status: 'In progress' }),
    row({ name: 'Staged', slug: 'c', stage: 'Building' }),
  ])
  assert.deepEqual(cell(v, '02 Commercial', 'Shipped'), [])
  assert.deepEqual(cell(v, '02 Commercial', 'Now'), ['Staged'])
  assert.equal(v.epics, 1)
})
