import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  READINESS_ANALYSIS_CAP,
  dayCountSince,
  experimentAnswer,
  projectExperimentRows,
  readinessCandidates,
  type ExperimentListInput,
  type ExperimentStatus,
} from './experiment-list-view.ts'

const NOW = new Date('2026-09-01T12:00:00.000Z')

function input(key: string, status: ExperimentStatus, startedAt: string | null = null): ExperimentListInput {
  return {
    key,
    version: {
      version: 1,
      status,
      startedAt,
      hypothesis: `${key} hypothesis`,
      primaryMetricEvent: 'checkout',
    },
  }
}

test('only RUNNING experiments need the analysis, and the cap bounds how many get it', () => {
  const many = Array.from({ length: 30 }, (_, index) => input(`run-${index}`, 'running'))
  const mixed = [input('a', 'decided'), input('b', 'draft'), ...many, input('c', 'stopped')]
  const candidates = readinessCandidates(mixed)
  assert.equal(candidates.length, READINESS_ANALYSIS_CAP)
  assert.ok(
    candidates.every((key) => key.startsWith('run-')),
    'a non-running experiment was analysed'
  )
  // `miyagisanchez` in production: two experiments, both decided. This list runs ZERO analyses,
  // which is the case the cap exists to make cheap rather than the case it exists to clip.
  assert.deepEqual(readinessCandidates([input('a', 'decided'), input('b', 'decided')]), [])
})

test('"we did not look" is a DIFFERENT state from "it is not ready"', () => {
  // The distinction the whole module turns on. A key absent from the readiness map is `unresolved`,
  // and rendering that as "Still gathering" would put a pill on a row nothing measured — the same
  // class as a zero standing for an unreadable value.
  const rows = projectExperimentRows(
    [input('checked-ready', 'running'), input('checked-not', 'running'), input('never-checked', 'running')],
    new Map([
      ['checked-ready', true],
      ['checked-not', false],
    ]),
    NOW
  )
  assert.deepEqual(
    rows.map((row) => row.state),
    ['ready', 'gathering', 'unresolved']
  )
  assert.ok(rows.every((row) => row.needsAnalysis))
})

test('a status that is not running maps to itself, and `running` is never a row state', () => {
  const rows = projectExperimentRows(
    [input('a', 'decided'), input('b', 'draft'), input('c', 'stopped'), input('d', 'invalid')],
    new Map(),
    NOW
  )
  assert.deepEqual(
    rows.map((row) => row.state),
    ['decided', 'draft', 'stopped', 'invalid']
  )
  assert.ok(rows.every((row) => !row.needsAnalysis))
  // ⚠️ `running` is not in `ExperimentRowState` at all, and the compiler is what says so. Left as
  // an assertion too, because the union is what stops a blank pill rendering for a status nothing
  // draws.
  assert.ok(!rows.some((row) => (row.state as string) === 'running'))
})

test('a registry with no version at all is a draft, not a crash', () => {
  const rows = projectExperimentRows([{ key: 'empty', version: null }], new Map(), NOW)
  assert.equal(rows[0].state, 'draft')
  assert.equal(rows[0].version, null)
  assert.equal(rows[0].dayCount, null)
})

test('the day count is whole days, and a future start is null rather than negative', () => {
  assert.equal(dayCountSince('2026-08-19T12:00:00.000Z', NOW), 13)
  assert.equal(dayCountSince('2026-09-01T00:00:00.000Z', NOW), 0)
  assert.equal(dayCountSince(null, NOW), null)
  // A clock problem, not a measurement. "day -3" sends somebody looking for a bug in the experiment
  // rather than in the timestamp.
  assert.equal(dayCountSince('2026-09-05T00:00:00.000Z', NOW), null)
  assert.equal(dayCountSince('not a date', NOW), null)
})

// ── The answer line ───────────────────────────────────────────────────────────────────────────

test('the answer reports what was actually RESOLVED, never what was assumed', () => {
  const rows = projectExperimentRows(
    [input('a', 'running'), input('b', 'running'), input('c', 'decided')],
    new Map([['a', true]]),
    NOW
  )
  const answer = experimentAnswer(rows)
  assert.match(answer, /1 experiment is ready for you to decide\./)
  // ⚠️ The half that matters: `b` was never analysed, and the sentence says so. Claiming "1 is
  // ready" alone would be a headline the list beneath it does not support.
  assert.match(answer, /1 running experiment was not checked/)
  assert.match(answer, /1 already has a decision on record\./)
})

test('with everything resolved and nothing ready, the answer says so plainly', () => {
  const rows = projectExperimentRows(
    [input('a', 'running'), input('b', 'running')],
    new Map([
      ['a', false],
      ['b', false],
    ]),
    NOW
  )
  const answer = experimentAnswer(rows)
  assert.match(answer, /Nothing is waiting on a decision\./)
  assert.ok(!answer.includes('not checked'), 'nothing was unresolved, so nothing should be reported as such')
})

test('an empty project gets its own sentence, not a count of zero', () => {
  assert.match(experimentAnswer([]), /No experiment has been declared/)
})

test('the answer never claims a readiness it could not compute', () => {
  // Every row unresolved: the sentence must NOT open with "0 experiments are ready", which reads as
  // a measurement, and must not open with "Nothing is waiting on a decision", which is a claim.
  const rows = projectExperimentRows([input('a', 'running'), input('b', 'running')], new Map(), NOW)
  const answer = experimentAnswer(rows)
  assert.ok(!answer.includes('ready for you to decide'), answer)
  assert.ok(!answer.includes('Nothing is waiting'), answer)
  assert.match(answer, /2 running experiments were not checked/)
})
