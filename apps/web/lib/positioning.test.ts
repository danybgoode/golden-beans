// agentic-pm-public-surface · Sprint 1, Story 1.1 — the category string's own gate.
//
// This module is two string constants, which is exactly the kind of thing nobody tests and everyone
// edits. The three properties below are the ones that make it safe to paste onto five outward
// surfaces at once, and each of them can only ever regress silently — prose has no type, and a
// second sentence or a smuggled capability claim type-checks perfectly.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { CATEGORY, CATEGORY_DEFINITION } from './positioning.ts'

test('the definition is one sentence', () => {
  // Counted rather than eyeballed: a definition that grows a second sentence stops being a
  // definition and becomes a paragraph, and the surfaces that render it inline (the link preview,
  // the manifest's opening, the hero's micro line) have room for one sentence.
  const terminators = CATEGORY_DEFINITION.match(/[.!?]/g) ?? []
  assert.equal(terminators.length, 1, 'the definition must contain exactly one sentence terminator')
  assert.ok(CATEGORY_DEFINITION.endsWith('.'), 'and it must be the last character')
})

test('the definition contains the category it defines', () => {
  // The failure this catches is a definition rewritten into a description — a sentence that says
  // what we do without ever naming the thing, which leaves every surface using `CATEGORY` bare
  // (epic D2's whole hazard: an agent then repeats it with the market's meaning).
  assert.ok(
    CATEGORY_DEFINITION.toLowerCase().includes(CATEGORY.toLowerCase()),
    `the definition must name "${CATEGORY}"`
  )
})

test('the definition names no capability', () => {
  // The rule `app/layout.tsx`'s DESCRIPTION lives under, generalised — see positioning.ts's header
  // for why it applies to every string in that file. Three of the terms below ride gates that are
  // closed in production today (experiments, flag serving, destination delivery); the rest name
  // primitives whose presence is a per-deployment fact this string cannot qualify.
  //
  // Word-boundary matched, not `includes()`: a substring test would fire on "flagship" and on
  // "SDK" inside a URL, and a guard that reports the wrong thing is worse than no guard.
  const CAPABILITIES = [
    'telemetry',
    'ingest',
    'SDK',
    'TARS',
    'funnel',
    'funnels',
    'North Star',
    'A/B',
    'experiment',
    'experiments',
    'MCP',
    'connector',
    'flag',
    'flags',
    'release',
    'releases',
    'scenario',
    'scenarios',
    'destination',
    'destinations',
    'webhook',
    'webhooks',
  ]

  for (const capability of CAPABILITIES) {
    const pattern = new RegExp(`\\b${capability.replace(/[/\\]/g, '\\$&')}\\b`, 'i')
    assert.ok(
      !pattern.test(CATEGORY_DEFINITION),
      `the definition names "${capability}" — a link preview travels without the qualification the page carries, and gate state is per-deployment while this string is per-build`
    )
  }
})
