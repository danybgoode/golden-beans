import { test } from 'node:test'
import assert from 'node:assert/strict'
import { epicFinops, epicFinopsFromArtifact, quoteActualLine } from './roadmap-finops.ts'

// finops · Story 3.2 — quote and actual off the roadmap artifact.

const epic = (over: Record<string, unknown> = {}) => ({
  grain: 'Epic',
  slug: 'finops',
  name: 'FinOps',
  status: 'Shipped',
  ...over,
})

test('inside, over and under — with Δ against the quote’s top', () => {
  assert.equal(
    quoteActualLine(epicFinops(epic({ quote_low_usd: 30, quote_high_usd: 55, actual_usd: 38 }))),
    'Quote $30–55 · Actual ≈$38 (−31%)'
  )
  const over = epicFinops(epic({ quote_low_usd: 30, quote_high_usd: 55, actual_usd: 71 }))
  assert.deepEqual([over.verdict, over.deltaPct], ['over', 29])
  assert.equal(epicFinops(epic({ quote_low_usd: 30, quote_high_usd: 55, actual_usd: 10 })).verdict, 'under')
})

test('absent is not zero: no quote, no actual → no line at all; one half says what is missing', () => {
  assert.equal(quoteActualLine(epicFinops(epic())), null)
  assert.equal(quoteActualLine(epicFinops(epic({ actual_usd: 33.08 }))), 'Not quoted · Actual ≈$33.08')
  assert.equal(
    quoteActualLine(epicFinops(epic({ quote_low_usd: 24, quote_high_usd: 35 }))),
    'Quote $24–35 · not measured yet'
  )
  assert.equal(
    epicFinops(epic({ quote_low_usd: 60, quote_high_usd: 55 })).quoteLow,
    null,
    'an inverted quote is no quote'
  )
})

test('the typed accessor portfolio-view reads: epics only, and never throws on a foreign payload', () => {
  const rows = epicFinopsFromArtifact({
    items: [epic({ actual_usd: 1 }), { grain: 'Sprint', slug: 'finops--s1' }],
  })
  assert.deepEqual(
    rows.map((r) => [r.slug, r.actualUsd, r.shipped]),
    [['finops', 1, true]]
  )
  assert.deepEqual(epicFinopsFromArtifact(null), [])
  assert.deepEqual(epicFinopsFromArtifact({ items: 'nope' }), [])
})
