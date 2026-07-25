import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parseRoadmapPush,
  summarizeRoadmap,
  isRoadmapStatusShipped,
  ROADMAP_SCHEMA_VERSION,
  type RoadmapRow,
} from './roadmap-artifact-schema.ts'

// pod-report · Sprint 1, Story 1.1 — the ingest contract, asserted directly.
//
// This is the boundary a customer's tooling hits, so the cases that matter are the UNKIND ones: a
// generator one version ahead, a slug that wants to escape a URL path, a payload that is valid JSON
// but not a roadmap. An HTTP spec can reach these too, but only through a server and a database —
// here they run in microseconds with no fixtures, which is the whole point of keeping the module
// under test free of `server-only` / framework imports (Roadmap/LEARNINGS.md).

const row = (over: Partial<RoadmapRow> = {}): RoadmapRow =>
  ({
    name: 'An epic',
    slug: 'an-epic',
    grain: 'Epic',
    status: 'Shipped',
    area: '01 Growth Engine',
    ...over,
  }) as RoadmapRow

const push = (over: Record<string, unknown> = {}) => ({
  schemaVersion: ROADMAP_SCHEMA_VERSION,
  generatedAt: '2026-07-25T00:00:00.000Z',
  source: { commit: 'abc1234', ref: 'main' },
  items: [row()],
  ...over,
})

test('a well-formed push parses', () => {
  const r = parseRoadmapPush(push())
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.value.items.length, 1)
    assert.ok(r.value.generatedAt instanceof Date)
  }
})

test('a wrong schemaVersion is rejected with a DIFFERENT message than a malformed shape', () => {
  // The two failures need different remedies — upgrade a generator vs fix a payload — so a client
  // must be able to tell them apart from the response alone.
  const versionErr = parseRoadmapPush(push({ schemaVersion: ROADMAP_SCHEMA_VERSION + 1 }))
  assert.equal(versionErr.ok, false)
  if (!versionErr.ok) {
    assert.match(versionErr.error, /Unsupported schemaVersion/)
    assert.equal(versionErr.issues, undefined, 'a version mismatch is not a shape problem')
  }

  const shapeErr = parseRoadmapPush(push({ items: [{ name: 'no slug' }] }))
  assert.equal(shapeErr.ok, false)
  if (!shapeErr.ok) {
    assert.match(shapeErr.error, /Malformed/)
    assert.ok(shapeErr.issues, 'a shape problem must say which field failed')
  }
})

test('an empty items array is rejected — an immutable empty artifact is unfixable', () => {
  assert.equal(parseRoadmapPush(push({ items: [] })).ok, false)
})

test('unknown row fields are PRESERVED, so a newer generator is not an outage', () => {
  // The extract gains columns as the roadmap tooling grows. Rejecting a richer payload would turn an
  // additive upstream change into a hard failure for a client who upgraded before we did.
  const r = parseRoadmapPush(push({ items: [{ ...row(), brand_new_field: 'kept' }] }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal((r.value.items[0] as Record<string, unknown>).brand_new_field, 'kept')
})

test('a hostile slug is refused at ingest, never stored to be dealt with at render time', () => {
  // Slugs become URL path segments on the drill-down view. Validate once at the boundary rather
  // than trusting every future renderer to re-sanitise.
  for (const slug of ['../../etc/passwd', 'a/b', 'a b', '<script>', '', 'a'.repeat(201)]) {
    assert.equal(
      parseRoadmapPush(push({ items: [row({ slug })] })).ok,
      false,
      `slug should be refused: ${slug}`
    )
  }
  // …and the real shapes the generator actually emits must still pass.
  for (const slug of ['pod-report', 'entity-journeys-projections--s1', 'growth-engine-v1']) {
    assert.equal(
      parseRoadmapPush(push({ items: [row({ slug })] })).ok,
      true,
      `slug should be accepted: ${slug}`
    )
  }
})

test('a bad commit sha is refused at the edge, matching the migration CHECK', () => {
  // Rejecting here turns a database constraint violation (500, opaque) into a 400 naming the field.
  assert.equal(parseRoadmapPush(push({ source: { commit: 'nothex!' } })).ok, false)
  assert.equal(parseRoadmapPush(push({ source: { commit: 'abc' } })).ok, false, 'too short')
  assert.equal(parseRoadmapPush(push({ source: { commit: 'abc1234' } })).ok, true)
  assert.equal(parseRoadmapPush(push({ source: null })).ok, true, 'provenance is optional')
})

test('an unparseable generatedAt is refused rather than passed to Postgres', () => {
  assert.equal(parseRoadmapPush(push({ generatedAt: 'not a date' })).ok, false)
})

test('an unknown grain is refused — an unrecognised generator is not something to guess at', () => {
  assert.equal(parseRoadmapPush(push({ items: [row({ grain: 'Initiative' as never })] })).ok, false)
})

test('non-object input does not throw', () => {
  for (const bad of [null, undefined, 42, 'string', []]) {
    assert.equal(parseRoadmapPush(bad).ok, false)
  }
})

// ── summarizeRoadmap ────────────────────────────────────────────────────────────────────────

test('summarizeRoadmap counts grains and nests sprints under their epic', () => {
  const s = summarizeRoadmap([
    row({ slug: 'e1', grain: 'Epic', status: 'Shipped', build_order_num: 1 }),
    row({ slug: 'e2', grain: 'Epic', status: 'Scaffolded', build_order_num: 2 }),
    row({ slug: 'e1--s1', grain: 'Sprint', epic_slug: 'e1' }),
    row({ slug: 'e1--s2', grain: 'Sprint', epic_slug: 'e1' }),
    row({ slug: 'seed-1', grain: 'Seed', status: 'Raw' }),
  ])
  assert.deepEqual(s.counts, { epics: 2, sprints: 2, seeds: 1, shippedEpics: 1 })
  assert.equal(s.epics[0].sprints.length, 2)
  assert.equal(s.epics[1].sprints.length, 0)
  assert.equal(s.seeds.length, 1)
})

test('summarizeRoadmap never claims ✅ for a status it does not recognise', () => {
  // The poster rule: over-claiming shipped is the one failure that is not merely untidy. Anything
  // unrecognised must fall to not-shipped.
  const s = summarizeRoadmap([
    row({ slug: 'a', status: 'shipped' }), // case-insensitive: genuinely shipped
    row({ slug: 'b', status: '  Shipped  ' }), // whitespace-padded: genuinely shipped
    row({ slug: 'c', status: 'Shipping' }), // NOT shipped
    row({ slug: 'd', status: 'In progress' }),
    row({ slug: 'e', status: 'Ship' }),
  ])
  assert.equal(s.counts.shippedEpics, 2)
  assert.deepEqual(
    s.epics.filter((e) => e.shipped).map((e) => e.slug),
    ['a', 'b']
  )
})

test('summarizeRoadmap orders epics by build order, and an ungroomed row never jumps the queue', () => {
  const s = summarizeRoadmap([
    row({ slug: 'third', build_order_num: 3 }),
    row({ slug: 'nobody-groomed-me', build_order_num: null }),
    row({ slug: 'first', build_order_num: 1 }),
  ])
  assert.deepEqual(
    s.epics.map((e) => e.slug),
    ['first', 'third', 'nobody-groomed-me']
  )
})

test('summarizeRoadmap handles an all-seeds payload without inventing epics', () => {
  const s = summarizeRoadmap([row({ slug: 's', grain: 'Seed', status: 'Raw' })])
  assert.deepEqual(s.counts, { epics: 0, sprints: 0, seeds: 1, shippedEpics: 0 })
  assert.deepEqual(s.epics, [])
})

// ── isRoadmapStatusShipped ──────────────────────────────────────────────────────────────────
// Pinned directly (not just indirectly through summarizeRoadmap above) because the epic drill-down
// view (Story 1.2) calls this exported function itself for SPRINT rows' ✅ ticks — it needs to be
// correct as a standalone public API, not just as an internal implementation detail.

test('isRoadmapStatusShipped is case- and whitespace-insensitive, and refuses anything else', () => {
  assert.equal(isRoadmapStatusShipped('Shipped'), true)
  assert.equal(isRoadmapStatusShipped('shipped'), true)
  assert.equal(isRoadmapStatusShipped('  SHIPPED  '), true)
  assert.equal(isRoadmapStatusShipped('In progress'), false)
  assert.equal(isRoadmapStatusShipped('Shipping'), false)
  assert.equal(isRoadmapStatusShipped(null), false)
  assert.equal(isRoadmapStatusShipped(undefined), false)
  assert.equal(isRoadmapStatusShipped(''), false)
})
