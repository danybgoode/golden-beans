import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  AGENT_USAGE_EVENT,
  AGENT_USAGE_KEYS,
  agentUsageIdempotencyKey,
  latestSnapshots,
  parseAgentUsage,
  rollUp,
  usdIsLowerBound,
} from './agent-usage.ts'

// finops · Story 3.1 — the `$agent_usage` payload contract and the latest-wins reader (D9, D22).

const tokens = (n: number) => ({ input: n, output: n, cache_read: n, cache_write_5m: 0, cache_write_1h: 0 })
const usage = (over: Record<string, unknown> = {}) => ({
  session_id: 'b7a1c2d3-0000-4000-8000-000000000001',
  epic: 'finops',
  branch: 'feat/finops-s2',
  model_breakdown: { 'claude-opus-5-5': { tokens: tokens(10), usd: 1.5 } },
  skill_breakdown: { '(no skill)': { tokens: tokens(10), usd: 1.5 } },
  tokens_by_kind: tokens(10),
  usd_estimate: 1.5,
  price_table_date: '2026-10-02',
  first_at: '2026-10-02T10:00:00.000Z',
  last_at: '2026-10-02T11:00:00.000Z',
  ...over,
})

test('the event name and the exact key set (D9)', () => {
  assert.equal(AGENT_USAGE_EVENT, '$agent_usage')
  assert.deepEqual([...AGENT_USAGE_KEYS].sort(), Object.keys(usage()).sort())
})

test('a well-formed payload parses; every extra key is refused — content cannot ride along', () => {
  assert.equal(parseAgentUsage(usage()).ok, true)
  for (const extra of [{ prompt: 'hi' }, { message: 'x' }, { content: [] }]) {
    const r = parseAgentUsage(usage(extra))
    assert.equal(r.ok, false)
    assert.match(String(!r.ok && r.errors[0]), /unknown key\(s\) — \$agent_usage carries metrics only/)
  }
  const nested = parseAgentUsage(usage({ model_breakdown: { m: { tokens: tokens(1), usd: 1, text: 'x' } } }))
  assert.equal(nested.ok, false, 'not even one level down')
})

test('missing keys, bad numbers, bad dates and inverted spans are each refused', () => {
  const bad = (over: Record<string, unknown>) => parseAgentUsage(usage(over)).ok
  const { usd_estimate: _drop, ...noUsd } = usage()
  assert.equal(parseAgentUsage(noUsd).ok, false)
  assert.equal(bad({ usd_estimate: -1 }), false)
  assert.equal(bad({ tokens_by_kind: { ...tokens(1), input: 1.5 } }), false)
  assert.equal(bad({ price_table_date: 'yesterday' }), false)
  assert.equal(bad({ first_at: '2026-10-03T00:00:00.000Z' }), false)
  assert.equal(bad({ epic: '../etc' }), false)
  assert.equal(
    bad({ model_breakdown: { m: { tokens: tokens(1), usd: null } } }),
    true,
    'an unpriced model is null, not refused'
  )
})

test('the idempotency key: an unchanged snapshot dedups, a grown one is new', () => {
  const a = usage() as never
  assert.equal(
    agentUsageIdempotencyKey(a),
    'agent_usage:b7a1c2d3-0000-4000-8000-000000000001:finops:2026-10-02T11:00:00.000Z'
  )
  assert.ok(agentUsageIdempotencyKey(a).length <= 128, 'fits the ingest key limit')
})

test('D22: the latest snapshot per (session, epic) wins — a re-push never double-counts', () => {
  const snaps = latestSnapshots([
    usage({ usd_estimate: 1, last_at: '2026-10-02T10:30:00.000Z' }),
    usage({ usd_estimate: 3 }),
    usage({ usd_estimate: 2, last_at: '2026-10-02T10:45:00.000Z' }),
    usage({ epic: 'other', usd_estimate: 5 }),
    { not: 'a usage row' },
  ])
  assert.equal(snaps.length, 2)
  const r = rollUp(snaps)
  assert.equal(r.byEpic.finops.usd, 3)
  assert.equal(r.total.usd, 8)
  assert.equal(r.total.sessions, 1, 'one session across two epics is one session')
})

test('rollUp: skills and models from the breakdowns; an unpriced part makes the total a lower bound (D4)', () => {
  const r = rollUp(
    latestSnapshots([
      usage({
        model_breakdown: {
          'claude-opus-5-5': { tokens: tokens(10), usd: 1.5 },
          'claude-future-9': { tokens: tokens(5), usd: null },
        },
        skill_breakdown: { 'golden-frijoles:groom': { tokens: tokens(15), usd: 1.5 } },
      }),
    ])
  )
  assert.equal(r.byModel['claude-future-9'].usdLowerBound, true)
  assert.equal(r.total.usdLowerBound, true)
  assert.equal(r.bySkill['golden-frijoles:groom'].tokens, 45)
  assert.equal(usdIsLowerBound(usage() as never), false)
})
