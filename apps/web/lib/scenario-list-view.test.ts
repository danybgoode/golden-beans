import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SCENARIO_OUTCOME_WORDS,
  projectScenarioRows,
  scenarioAnswer,
  scenarioOutcome,
  summariseScenarios,
  type ScenarioDefinitionInput,
  type ScenarioOutcome,
  type ScenarioRunInput,
} from './scenario-list-view.ts'

function definition(
  scenarioKey: string,
  version = 1,
  kind: 'resilience' | 'security' = 'resilience'
): ScenarioDefinitionInput {
  return {
    scenarioKey,
    version,
    kind,
    targetKey: `${scenarioKey}-target`,
    cohort: 'synthetic',
    environment: 'production',
  }
}

function run(
  scenarioKey: string,
  { requests = 100, failed = 0, at = '2026-08-24T14:02:00.000Z' } = {}
): ScenarioRunInput {
  return {
    scenarioKey,
    requestCount: requests,
    successCount: requests - failed,
    failureCount: failed,
    createdAt: at,
    startedAt: at,
  }
}

test('a drill that has never run is a STATE, not a zero', () => {
  // The row this list exists for. A drill nobody has run is not a passing drill, and the tile that
  // counts it is what stops it sitting quietly among the green ones.
  const rows = projectScenarioRows([definition('never_run')], [])
  assert.equal(rows[0].lastRun, null)
  assert.equal(summariseScenarios(rows).neverRun, 1)
  assert.equal(
    summariseScenarios(rows).heldRate,
    null,
    '100% held over zero requests is the dangerous reading'
  )
})

test('“everything held” is never reported over nothing sent', () => {
  const rows = projectScenarioRows([definition('a'), definition('b')], [])
  const summary = summariseScenarios(rows)
  assert.equal(summary.requestsReplayed, 0)
  assert.equal(summary.heldRate, null)
  // ...and a real clean run IS 100%, which must still be reachable.
  const clean = summariseScenarios(projectScenarioRows([definition('a')], [run('a', { requests: 2400 })]))
  assert.equal(clean.heldRate, 1)
})

test('the LATEST run describes the row, ordered by when it actually started', () => {
  const rows = projectScenarioRows(
    [definition('drill')],
    [
      run('drill', { at: '2026-08-01T00:00:00.000Z', failed: 9 }),
      run('drill', { at: '2026-08-24T00:00:00.000Z', failed: 3 }),
      run('drill', { at: '2026-08-10T00:00:00.000Z', failed: 40 }),
    ]
  )
  assert.equal(rows[0].lastRun?.failed, 3)
  assert.equal(rows[0].lastRun?.at, '2026-08-24T00:00:00.000Z')
})

test('a run that was created and never started still orders by its creation', () => {
  // `startedAt ?? createdAt`: a queued run happened as an act, and ordering by `createdAt` alone
  // would put it ahead of one that actually executed later.
  const rows = projectScenarioRows(
    [definition('drill')],
    [
      {
        ...run('drill', { at: '2026-08-01T00:00:00.000Z' }),
        startedAt: null,
        createdAt: '2026-08-30T00:00:00.000Z',
      },
      run('drill', { at: '2026-08-24T00:00:00.000Z', failed: 3 }),
    ]
  )
  assert.equal(rows[0].lastRun?.at, '2026-08-30T00:00:00.000Z')
})

test('a drill with several versions is ONE row, at its highest', () => {
  // Listing it three times would make "4 drills defined" disagree with the rows beneath it.
  const rows = projectScenarioRows(
    [definition('drill', 1), definition('drill', 3), definition('drill', 2)],
    []
  )
  assert.equal(rows.length, 1)
  assert.equal(rows[0].version, 3)
  assert.equal(summariseScenarios(rows).defined, 1)
})

test('rows are ordered by key, so the page does not reshuffle between loads', () => {
  const rows = projectScenarioRows([definition('zeta'), definition('alpha'), definition('mid')], [])
  assert.deepEqual(
    rows.map((row) => row.scenarioKey),
    ['alpha', 'mid', 'zeta']
  )
})

test('the summary counts the two kinds separately', () => {
  const rows = projectScenarioRows(
    [definition('a', 1, 'resilience'), definition('b', 1, 'resilience'), definition('c', 1, 'security')],
    []
  )
  const summary = summariseScenarios(rows)
  assert.equal(summary.resilience, 2)
  assert.equal(summary.security, 1)
  assert.equal(summary.defined, 3)
})

// ── The answer line ───────────────────────────────────────────────────────────────────────────

test('the answer names the failures and the untested drills, and only when there are some', () => {
  const rows = projectScenarioRows(
    [definition('ran'), definition('never')],
    [run('ran', { requests: 2836, failed: 3 })]
  )
  const answer = scenarioAnswer(rows)
  assert.match(answer, /3 of 2,836 requests failed across the last runs\./)
  assert.match(answer, /One drill has never been run — an untested control is an assumption\./)

  const allRun = projectScenarioRows([definition('ran')], [run('ran', { requests: 400, failed: 0 })])
  assert.equal(scenarioAnswer(allRun), '0 of 400 requests failed across the last runs.')
})

test('with drills defined and nothing replayed, the answer says exactly that', () => {
  // ⚠️ NOT "0 of 0 requests failed", which reads as a clean bill of health for a project that has
  // tested nothing.
  const answer = scenarioAnswer(projectScenarioRows([definition('a')], []))
  assert.match(answer, /Nothing has been replayed yet, so there is no evidence either way\./)
  assert.match(answer, /an untested control is an assumption/)
  assert.ok(!answer.includes('0 of 0'), answer)
})

test('an empty project gets a sentence explaining what a drill IS', () => {
  // The empty state is a deliverable (D10): production `miyagisanchez` has zero scenarios, so this
  // is what a real person meets there.
  const answer = scenarioAnswer([])
  assert.match(answer, /No drill has been defined/)
  assert.match(answer, /keeps the evidence of what held/)
})

// ── The outcome — the ONE answer the pill and the bar both read ──────────────────────────────

test('a run that replayed NOTHING is neither held nor never-run', () => {
  // ⚠️ **This state was missing, and the page said two contradictory things about it.** The pill was
  // derived from `failed > 0` and the bar from `splitGeometry(held, failed)`, and a run that started
  // and replayed nothing satisfies both "no failures" and "nothing to draw" — so the row rendered a
  // green **Held** beside the sentence "Never run — nothing here is evidence yet." Found by opening
  // the page; nothing structural could see it, because each half was correct on its own.
  const rows = projectScenarioRows([definition('ran_empty')], [run('ran_empty', { requests: 0 })])
  assert.equal(scenarioOutcome(rows[0]), 'no_traffic')
  assert.notEqual(scenarioOutcome(rows[0]), 'held')
  assert.notEqual(scenarioOutcome(rows[0]), 'never_run')
})

test('the four outcomes are exactly the four states a drill can be in', () => {
  const cases: [string, ScenarioOutcome][] = [
    ['never', 'never_run'],
    ['empty', 'no_traffic'],
    ['broke', 'failed'],
    ['clean', 'held'],
  ]
  const rows = projectScenarioRows(
    cases.map(([key]) => definition(key)),
    [
      run('empty', { requests: 0 }),
      run('broke', { requests: 100, failed: 3 }),
      run('clean', { requests: 100, failed: 0 }),
    ]
  )
  for (const [key, expected] of cases) {
    const row = rows.find((candidate) => candidate.scenarioKey === key)
    assert.ok(row, `${key} did not produce a row`)
    assert.equal(scenarioOutcome(row), expected, key)
  }
})

test('a drill with no evidence either way counts as untested, however it got there', () => {
  // The tile asks "how many controls have no evidence", and a run that sent zero requests has
  // exactly as little as one that never happened.
  const rows = projectScenarioRows(
    [definition('never'), definition('empty'), definition('clean')],
    [run('empty', { requests: 0 }), run('clean', { requests: 10 })]
  )
  assert.equal(summariseScenarios(rows).neverRun, 2)
})

test('every outcome has a word, a tone and a sentence — and none says the wrong thing', () => {
  const outcomes: ScenarioOutcome[] = ['never_run', 'no_traffic', 'failed', 'held']
  assert.deepEqual(Object.keys(SCENARIO_OUTCOME_WORDS).sort(), [...outcomes].sort())
  for (const outcome of outcomes) {
    const words = SCENARIO_OUTCOME_WORDS[outcome]
    assert.ok(words.label.length > 3, `${outcome} has no label`)
    assert.ok(words.unreadable.length > 30, `${outcome} has no sentence`)
    // The one that started this: `no_traffic` must not claim anything held.
    if (outcome === 'no_traffic') {
      assert.ok(!/\bheld\b/i.test(words.label), 'the no-traffic label claims the drill held')
      assert.match(words.unreadable, /not the same as holding/)
    }
  }
  // Only a genuinely clean run is green.
  assert.equal(SCENARIO_OUTCOME_WORDS.held.tone, 'on')
  assert.notEqual(SCENARIO_OUTCOME_WORDS.no_traffic.tone, 'on')
})
