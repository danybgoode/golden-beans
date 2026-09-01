// The three bands, asserted — design-system-rails · Sprint 5, Story 5.2.
//
// Three surfaces read this module: Today's bands, `/app/tasks`' bands, and the "needs a decision"
// stat tile that counts one of them. A headline number that contradicts the rows beneath it is
// worse than no headline, and the only reason it cannot happen here is that all three call the
// same function — which is what these tests are defending.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  type BandTask,
  splitTaskBands,
  taskEvidencePhrase,
  taskHolder,
  taskSignalKind,
} from './today-bands.ts'

function task(overrides: Partial<BandTask> & Pick<BandTask, 'status'>): BandTask {
  return {
    id: 't-1',
    title: 'Checkout fails for sellers with no payout account',
    claimedBy: null,
    evidence: null,
    impactRank: 10,
    ...overrides,
  }
}

test('every status lands in exactly the band DD1 names, and order is preserved', () => {
  const bands = splitTaskBands([
    task({ status: 'open', id: 'a' }),
    task({ status: 'claimed', id: 'b' }),
    task({ status: 'resolved', id: 'c' }),
    task({ status: 'dismissed', id: 'd' }),
    task({ status: 'open', id: 'e' }),
  ])
  assert.deepEqual(
    bands.open.map((t) => t.id),
    ['a', 'e']
  )
  assert.deepEqual(
    bands.claimed.map((t) => t.id),
    ['b']
  )
  assert.deepEqual(
    bands.resolved.map((t) => t.id),
    ['c']
  )
  assert.deepEqual(
    bands.dismissed.map((t) => t.id),
    ['d']
  )
  // Today's third band shows both closed states under one heading, in the order they arrived.
  assert.deepEqual(
    bands.done.map((t) => t.id),
    ['c', 'd']
  )
  assert.deepEqual(bands.unknown, [])
})

test('no task can be in the queue and in no band', () => {
  // The property the three call sites depend on. A task that exists and appears nowhere is the
  // worst outcome for a queue whose whole promise is that humans see what agents see.
  const tasks = (['open', 'claimed', 'resolved', 'dismissed'] as const).map((status, index) =>
    task({ status, id: `t-${index}` })
  )
  const bands = splitTaskBands(tasks)
  const placed = [...bands.open, ...bands.claimed, ...bands.resolved, ...bands.dismissed, ...bands.unknown]
  assert.equal(placed.length, tasks.length, 'a task was dropped or double-counted')
  assert.deepEqual(new Set(placed.map((t) => t.id)), new Set(tasks.map((t) => t.id)))
})

test('an unrecognised status is COLLECTED, not silently dropped', () => {
  // Unreachable today — the database CHECK allows exactly four — but a fifth status added by a
  // migration would otherwise vanish from every band with no error anywhere. The caller can assert
  // `unknown` is empty; nothing can assert against a task that was never returned.
  const rogue = { status: 'archived' as unknown as BandTask['status'], id: 'x' }
  const bands = splitTaskBands([rogue])
  assert.deepEqual(bands.unknown, [rogue])
  assert.equal(bands.open.length + bands.claimed.length + bands.done.length, 0)
})

test('an empty queue produces five empty bands, not five undefineds', () => {
  const bands = splitTaskBands([])
  for (const [name, rows] of Object.entries(bands)) {
    assert.ok(Array.isArray(rows), `${name} is not an array on an empty queue`)
    assert.equal(rows.length, 0)
  }
})

// ── The holder ────────────────────────────────────────────────────────────────────────────────

test('the holder is a NAME and never a claim about whether it is a person or an agent', () => {
  // The rule `lib/task-lifecycle-facts.ts` and `lib/agent-activity-read.ts` both state: agent
  // attribution comes from `metadata.via === 'connector'`, never from an actor string, because
  // `claimed_by` is caller-supplied free text. This test is what stops a future "helpful" refactor
  // reintroducing the inference — a tenant could otherwise relabel a human as an agent.
  assert.deepEqual(taskHolder({ claimedBy: 'claude-code-prod-smoke' }), {
    name: 'claude-code-prod-smoke',
    held: true,
  })
  // The exact strings a pattern-matcher would be tempted by. All of them come back the SAME shape.
  for (const label of ['claude', 'agent:miyagi-ops', 'some-bot', 'Daniel', 'a human being']) {
    const holder = taskHolder({ claimedBy: label })
    assert.equal(holder.name, label, 'the holder label was rewritten')
    assert.equal(holder.held, true)
    assert.equal(
      Object.keys(holder).sort().join(','),
      'held,name',
      `taskHolder grew a field that classifies "${label}" — see the module note`
    )
  }
})

test('nobody holding it is a state, with its own words', () => {
  assert.deepEqual(taskHolder({ claimedBy: null }), { name: 'nobody yet', held: false })
  // Whitespace is not a holder. A row claimed by "   " must not render four spaces where a name goes.
  assert.deepEqual(taskHolder({ claimedBy: '   ' }), { name: 'nobody yet', held: false })
})

// ── The signal kind ───────────────────────────────────────────────────────────────────────────

test('the dot is drawn only for a kind the evidence actually names', () => {
  assert.equal(taskSignalKind({ evidence: { signal: { kind: 'error' } } }), 'error')
  assert.equal(taskSignalKind({ evidence: { signal: { kind: 'friction' } } }), 'friction')
  // A red mark against something nobody classified is worse than no mark.
  assert.equal(taskSignalKind({ evidence: null }), null)
  assert.equal(taskSignalKind({ evidence: {} }), null)
  assert.equal(taskSignalKind({ evidence: { signal: null } }), null)
  assert.equal(taskSignalKind({ evidence: { signal: 'error' } }), null)
  assert.equal(taskSignalKind({ evidence: { signal: { kind: 'outage' } } }), null)
})

// ── The evidence phrase ───────────────────────────────────────────────────────────────────────

test('the evidence phrase omits what the bundle does not carry, and never writes a zero', () => {
  assert.equal(
    taskEvidencePhrase({ evidence: { signal: { eventCount: 41, usersAffected: 12 } } }),
    'seen 41× · 12 people affected'
  )
  assert.equal(taskEvidencePhrase({ evidence: { signal: { eventCount: 41 } } }), 'seen 41×')
  assert.equal(taskEvidencePhrase({ evidence: { signal: { usersAffected: 1 } } }), '1 person affected')
  // A zero here can only mean the field was missing — an error seen zero times cannot be promoted —
  // so it is omitted rather than rendered as a measurement (CODE-QUALITY #8).
  assert.equal(taskEvidencePhrase({ evidence: { signal: { eventCount: 0, usersAffected: 0 } } }), null)
  assert.equal(taskEvidencePhrase({ evidence: { signal: {} } }), null)
  assert.equal(taskEvidencePhrase({ evidence: null }), null)
  // A non-numeric count is not a count.
  assert.equal(taskEvidencePhrase({ evidence: { signal: { eventCount: '41' } } }), null)
  assert.equal(taskEvidencePhrase({ evidence: { signal: { eventCount: Number.NaN } } }), null)
})

test('a large count is grouped, so a five-figure number is readable at a glance', () => {
  assert.equal(taskEvidencePhrase({ evidence: { signal: { eventCount: 41200 } } }), 'seen 41,200×')
})
