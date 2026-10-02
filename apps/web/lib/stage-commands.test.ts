import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BoardCard } from './hub-board.ts'
import { stageCommands } from './stage-commands.ts'

// board-sinks-and-scrumban · Sprint 2, Story 2.3 — one map keyed by stage, in the SESSION-KICKOFFS verbs.

const card = (over: Partial<BoardCard>): BoardCard => ({
  slug: 'demo',
  name: 'Demo epic',
  grain: 'Epic',
  stage: 'Ready to build',
  stageSource: null,
  type: 'Feature',
  risk: 'High',
  area: '02 Commercial',
  buildOrder: 18,
  appetite: 'M',
  bet: null,
  sprintProgress: null,
  goal: null,
  sprints: [
    { n: 1, title: 'One', done: 3, total: 3 },
    { n: 2, title: 'Two', done: 1, total: 4 },
  ],
  links: { readme: 'Roadmap/02-commercial/demo/README.md', seed: null, sprints: [], retro: null },
  pr: null,
  kickoff: null,
  shippedAt: null,
  ...over,
})
const texts = (c: BoardCard) => stageCommands(c).map((x) => x.text)

test('To groom and Grooming use the Groom and Bet verbs', () => {
  assert.deepEqual(texts(card({ stage: 'To groom', grain: 'Seed', name: 'An idea' })), ['Groom: An idea'])
  assert.deepEqual(texts(card({ stage: 'Grooming', grain: 'Seed' })), ['Groom: demo', 'Bet the wave'])
})

test('Ready to build: an epic offers Build epic and the generator; a fixed-scope seed offers Build', () => {
  assert.deepEqual(texts(card({})), [
    'Build epic demo',
    'node skills/groom/emit-epic-kickoff.mjs --epic demo',
  ])
  assert.deepEqual(texts(card({ grain: 'Seed' })), ['Build: demo'])
})

test('Building: Resume, the trail, and Wrap for the first sprint not yet done', () => {
  assert.deepEqual(texts(card({ stage: 'Building' })), [
    'Resume',
    'node scripts/session-trail.mjs --resume',
    'Wrap S2',
  ])
})

test('QA with an open PR: Review PR and the routing command, then Close epic and its DoD check', () => {
  const pr = { number: 224, url: 'https://github.com/o/r/pull/224', state: 'OPEN', draft: false }
  assert.deepEqual(texts(card({ stage: 'QA', pr })), [
    'Review PR #224',
    'node scripts/review-route.mjs --builder <who-wrote-it> 224',
    'Close epic demo',
    'node scripts/epic-dod.mjs --check 02-commercial/demo',
  ])
})

test('QA after the merge (close-out owed): only the close commands', () => {
  const pr = { number: 98, url: 'https://github.com/o/r/pull/98', state: 'MERGED', draft: false }
  assert.deepEqual(texts(card({ stage: 'QA', pr })), [
    'Close epic demo',
    'node scripts/epic-dod.mjs --check 02-commercial/demo',
  ])
})

test('Shipped owes nothing', () => {
  assert.deepEqual(stageCommands(card({ stage: 'Shipped' })), [])
})
