import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { BoardCard } from './hub-board.ts'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { stageCommands } from './stage-commands.ts'

// board-sinks-and-scrumban · Sprint 2, Story 2.3 — one map keyed by stage, in the SESSION-KICKOFFS verbs.

const card = (over: Partial<BoardCard>): BoardCard => ({
  project: null,
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

test("Ready to build: an epic offers Build epic (the kickoff is the card's own action); a fixed-scope seed offers Build", () => {
  assert.deepEqual(texts(card({})), ['Build epic demo'])
  assert.deepEqual(texts(card({ grain: 'Seed' })), ['Build: demo'])
})

test('Building: Resume, and Wrap for the first sprint not yet done', () => {
  assert.deepEqual(texts(card({ stage: 'Building' })), ['Resume', 'Wrap S2'])
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

test('every `node scripts/…` command a card offers exists in the template — a copied command must run (the CLASS, #226)', () => {
  const template = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    '..',
    '..',
    'skills',
    'template',
    'scripts'
  )
  const pr = { number: 9, url: 'https://github.com/o/r/pull/9', state: 'OPEN', draft: false }
  const every = (['To groom', 'Grooming', 'Ready to build', 'Building', 'QA', 'Shipped'] as const).flatMap(
    (stage) => (['Epic', 'Seed'] as const).flatMap((grain) => stageCommands(card({ stage, grain, pr })))
  )
  // EVERY `scripts/` path anywhere in a command, whatever runs it (`node --flag scripts/x.mjs`, `./scripts/x.sh` …), and
  // a command that runs anything must name such a path — so a new runner form cannot slip past (round-3 review, #226).
  const scripts = [
    ...new Set(
      every.flatMap((c) => [...c.text.matchAll(/(?:^|\s)(?:\.\/)?(scripts\/\S+)/g)].map((m) => m[1]))
    ),
  ]
  for (const c of every)
    if (/(?:^|\s)(?:node|npx|npm|bash|sh)\s/.test(c.text))
      assert.match(
        c.text,
        /(?:^|\s)(?:\.\/)?scripts\//,
        `"${c.text}" runs something that is not a checked scripts/ path`
      )
  assert.ok(scripts.length >= 2, `expected the map to run some scripts, found: ${scripts.join(', ')}`)
  for (const script of scripts) {
    assert.ok(
      existsSync(join(template, script.replace(/^scripts\//, ''))),
      `${script} is not shipped by the template`
    )
  }
})
