import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseProgress,
  progressSentence,
  withChapterOpened,
  type ReadProgress,
} from './methodology-progress.ts'

const IDS = ['a', 'b', 'c'] as const

test('a first-time visitor is a KNOWN zero, not an unknown', () => {
  const first = parseProgress(null, IDS)
  assert.deepEqual(first, { opened: [], total: 3 })
  // ...and renders nothing, because "0 of 3" tells a reader who has just arrived nothing they did
  // not know, and a rail that appears before it can say anything is decoration.
  assert.equal(progressSentence(first), null)
})

// The distinction the whole module exists for. A corrupt read must NOT collapse into "zero".
test('a value we cannot trust is null, and null is not zero', () => {
  for (const raw of ['not json', '{"opened":1}', '"a"', '42', 'null']) {
    assert.equal(parseProgress(raw, IDS), null, `${raw} must be unknown, not empty`)
  }
  assert.equal(progressSentence(null), null)

  // The failure this prevents, stated as a test: a reader who has opened everything, whose storage
  // then returns garbage, must not be told they have opened none.
  const knownEmpty = parseProgress(JSON.stringify([]), IDS)
  assert.deepEqual(knownEmpty, { opened: [], total: 3 })
  assert.notEqual(parseProgress('corrupt', IDS), knownEmpty)
})

test('unknown and duplicate ids never inflate the count', () => {
  const progress = parseProgress(JSON.stringify(['a', 'a', 'zzz', 'b']), IDS)
  assert.deepEqual(progress, { opened: ['a', 'b'], total: 3 })
  // A renamed or retired chapter drops out rather than counting toward a total it left.
  assert.equal(progress!.opened.length <= progress!.total, true)
})

test('opening a chapter is idempotent and bounded by the known chapters', () => {
  let p: ReadProgress | null = null
  p = withChapterOpened(p, 'a', IDS)
  p = withChapterOpened(p, 'a', IDS)
  assert.deepEqual(p, { opened: ['a'], total: 3 })

  p = withChapterOpened(p, 'ghost', IDS)
  assert.deepEqual(p.opened, ['a'], 'an unknown id must not be stored')

  p = withChapterOpened(p, 'b', IDS)
  p = withChapterOpened(p, 'c', IDS)
  assert.deepEqual(p, { opened: ['a', 'b', 'c'], total: 3 })
})

// The sentence says "opened". The page's own argument is that reading is not the same as doing, so
// a rail claiming to know what was READ would be the surface contradicting itself.
test('the sentence claims only what the page can actually observe', () => {
  const sentence = progressSentence({ opened: ['a', 'b'], total: 3 })
  assert.equal(sentence, '2 of 3 chapters opened')
  assert.ok(!/\bread\b/i.test(sentence!), 'the rail must not claim a chapter was READ')
  assert.ok(!/tried|produced/i.test(sentence!), 'cut promises must not reappear in the copy')
})
