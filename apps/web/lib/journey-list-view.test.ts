import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  journeyAnswer,
  projectJourneyRows,
  summariseJourneys,
  type JourneyListInput,
} from './journey-list-view.ts'

function journey(
  key: string,
  versions: { id: string; version: number; state: 'draft' | 'active' | 'superseded' }[],
  activeVersionId: string | null
): JourneyListInput {
  return { key, description: `${key} description`, activeVersionId, versions }
}

const active = (n: number) => ({ id: `v${n}`, version: n, state: 'active' as const })
const draft = (n: number) => ({ id: `v${n}`, version: n, state: 'draft' as const })
const superseded = (n: number) => ({ id: `v${n}`, version: n, state: 'superseded' as const })

test('the active version and the draft above it are both named', () => {
  const rows = projectJourneyRows(
    [journey('founding_merchant', [superseded(3), active(4), draft(5)], 'v4')],
    new Map([['founding_merchant', 1284]])
  )
  assert.deepEqual(rows[0], {
    key: 'founding_merchant',
    description: 'founding_merchant description',
    activeVersion: 4,
    waitingDraftVersion: 5,
    subjectCount: 1284,
  })
})

test('a draft BELOW the active version is not waiting for anything', () => {
  // `canActivateJourneyVersion` refuses it, so reporting it as "waiting for you" would put a call to
  // action on a row whose control is disabled.
  const rows = projectJourneyRows([journey('j', [draft(2), active(4)], 'v4')], new Map())
  assert.equal(rows[0].waitingDraftVersion, null)
})

test('the HIGHEST waiting draft is the one named', () => {
  const rows = projectJourneyRows([journey('j', [active(1), draft(2), draft(3)], 'v1')], new Map())
  assert.equal(rows[0].waitingDraftVersion, 3)
})

test('a journey with no active version reports null, not version 1', () => {
  const rows = projectJourneyRows([journey('j', [draft(1)], null)], new Map())
  assert.equal(rows[0].activeVersion, null)
  // With nothing active, every draft is activatable — so the draft IS waiting.
  assert.equal(rows[0].waitingDraftVersion, 1)
})

test('an unread subject count is null, never zero', () => {
  // "Nobody is in this journey" and "we did not read how many are" are different sentences.
  const rows = projectJourneyRows([journey('j', [active(1)], 'v1')], new Map())
  assert.equal(rows[0].subjectCount, null)
  const zero = projectJourneyRows([journey('j', [active(1)], 'v1')], new Map([['j', 0]]))
  assert.equal(zero[0].subjectCount, 0, 'a real zero is a reading and must survive')
})

test('a total over a partial set is not a total', () => {
  // ⚠️ The harder half of the honest-zero rule: summing only the rows that answered produces a
  // number that is confidently too small, and it is harder to notice than a zero because it is not
  // one.
  const rows = projectJourneyRows(
    [journey('a', [active(1)], 'v1'), journey('b', [active(1)], 'v1')],
    new Map([['a', 100]])
  )
  assert.equal(summariseJourneys(rows).subjectsCounted, null)

  const complete = projectJourneyRows(
    [journey('a', [active(1)], 'v1'), journey('b', [active(1)], 'v1')],
    new Map([
      ['a', 100],
      ['b', 23],
    ])
  )
  assert.equal(summariseJourneys(complete).subjectsCounted, 123)
})

test('the summary counts what is live and what is waiting', () => {
  const rows = projectJourneyRows(
    [
      journey('a', [active(1)], 'v1'),
      journey('b', [active(1), draft(2)], 'v1'),
      journey('c', [draft(1)], null),
    ],
    new Map()
  )
  const summary = summariseJourneys(rows)
  assert.equal(summary.active, 2)
  assert.equal(summary.draftsWaiting, 2, 'b has a draft above its active; c has nothing active at all')
})

// ── The answer line ───────────────────────────────────────────────────────────────────────────

test('the answer names the drafts only when there ARE drafts', () => {
  const withDraft = projectJourneyRows(
    [journey('a', [active(1)], 'v1'), journey('b', [active(1), draft(2)], 'v1')],
    new Map()
  )
  assert.match(journeyAnswer(withDraft), /2 journeys are running\./)
  assert.match(journeyAnswer(withDraft), /1 has a draft waiting for you/)
  assert.match(journeyAnswer(withDraft), /a draft changes nothing until you activate it/)

  const none = projectJourneyRows([journey('a', [active(1)], 'v1')], new Map())
  assert.equal(journeyAnswer(none), '1 journey is running.')
  assert.ok(!journeyAnswer(none).includes('draft'), 'the draft clause appeared with no drafts')
})

test('definitions that exist but count nobody say so, rather than reading as running', () => {
  const rows = projectJourneyRows([journey('a', [draft(1)], null)], new Map())
  assert.match(journeyAnswer(rows), /Nothing is counting anyone yet/)
})

test('an empty project gets a sentence explaining what a journey IS', () => {
  // The empty state is a deliverable (epic D10) and production `miyagisanchez` has zero journeys, so
  // this is the sentence a real person actually meets on that route.
  const answer = journeyAnswer([])
  assert.match(answer, /No journey has been defined/)
  assert.match(answer, /how far people actually get/)
})
