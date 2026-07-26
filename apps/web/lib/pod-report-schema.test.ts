import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  parsePodReportPush,
  POD_REPORT_SCHEMA_VERSION,
  POD_REPORT_MAX_PAYLOAD_BYTES,
} from './pod-report-schema.ts'

const valid = () => ({
  schemaVersion: POD_REPORT_SCHEMA_VERSION,
  generatedAt: '2026-07-26T00:00:00.000Z',
  pushSource: { commit: 'abc1234', ref: 'refs/heads/main' },
  source: { repo: 'medusa-bonsai', commits: 841, epics: 133, windowDays: 49 },
  delivery: { epicLeadTime: { medianDays: 7.1 }, notInstrumented: [{ key: 'velocity' }] },
  maturity: { verdict: { step: 1 } },
  benchmarks: [{ id: 'dora-2025' }],
  caveats: ['computed, not claimed'],
})

test('a well-formed push parses; pushSource leaves the payload and dataset source STAYS', () => {
  const r = parsePodReportPush(valid())
  assert.equal(r.ok, true)
  if (!r.ok) return
  assert.equal(r.value.generatedAt.toISOString(), '2026-07-26T00:00:00.000Z')
  assert.deepEqual(r.value.source, { commit: 'abc1234', ref: 'refs/heads/main' })

  // Git provenance is stripped: it lands in the artifact's own source_commit/source_ref columns, so
  // a copy inside the payload would create two answers to "which commit produced this".
  assert.equal('pushSource' in r.value.payload, false)

  // The DATASET provenance must survive, and this is the assertion that would have caught the bug
  // the two keys exist to prevent: an earlier draft read git provenance from `source`, which
  // stripped repo/commits/epics out of every PUSHED artifact — so the renderer's "measured over 841
  // commits / 49 days" line came out empty in production while a locally printed report looked
  // perfect. Two keys, and the mistake is no longer expressible.
  assert.deepEqual(r.value.payload.source, {
    repo: 'medusa-bonsai',
    commits: 841,
    epics: 133,
    windowDays: 49,
  })
  assert.ok('delivery' in r.value.payload)
})

test('a version mismatch is reported distinctly from a shape failure', () => {
  const r = parsePodReportPush({ ...valid(), schemaVersion: 99 })
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /schemaVersion/)
  // No `issues` array: the pusher needs "upgrade your script", not a list of field complaints.
  assert.equal(r.issues, undefined)
})

test('a missing notInstrumented array is REJECTED, not stored', () => {
  // The epic's central promise arriving as data. An artifact with metrics and no declared gaps is
  // speed-without-honesty (Decision 4), and the rail refuses it at ingest rather than leaving the
  // renderer to notice later.
  const body = valid()
  delete (body.delivery as Record<string, unknown>).notInstrumented
  const r = parsePodReportPush(body)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.ok(r.issues?.some((i) => /notInstrumented/.test(i)))
})

test('an EMPTY notInstrumented array is accepted — it is a claim, not an omission', () => {
  const body = valid()
  body.delivery.notInstrumented = []
  assert.equal(parsePodReportPush(body).ok, true)
})

test('a malformed timestamp is rejected', () => {
  for (const bad of ['yesterday', '', 42, null, undefined]) {
    const r = parsePodReportPush({ ...valid(), generatedAt: bad })
    assert.equal(r.ok, false, `generatedAt=${JSON.stringify(bad)} should be rejected`)
  }
})

test('delivery must be an object, and a string does not sneak through as truthy', () => {
  const r = parsePodReportPush({ ...valid(), delivery: 'invalid' })
  assert.equal(r.ok, false)
})

test('optional sections are type-checked when present and skipped when absent', () => {
  assert.equal(parsePodReportPush({ ...valid(), maturity: 'nope' }).ok, false)
  assert.equal(parsePodReportPush({ ...valid(), benchmarks: {} }).ok, false)
  assert.equal(parsePodReportPush({ ...valid(), caveats: 'one' }).ok, false)

  const minimal = {
    schemaVersion: POD_REPORT_SCHEMA_VERSION,
    generatedAt: '2026-07-26T00:00:00.000Z',
    delivery: { notInstrumented: [] },
  }
  assert.equal(parsePodReportPush(minimal).ok, true)
})

test('a payload over the cap is rejected, and the cap measures what the read path returns', () => {
  const body = valid() as Record<string, unknown>
  body.delivery = {
    notInstrumented: [],
    filler: 'x'.repeat(POD_REPORT_MAX_PAYLOAD_BYTES + 1),
  }
  const r = parsePodReportPush(body)
  assert.equal(r.ok, false)
  if (r.ok) return
  assert.match(r.error, /over the .* limit/)

  // The complement, and the one that actually matters: a payload sized just UNDER the cap must be
  // accepted — and because `getLatestArtifact` returns `payload` and nothing derived, accepted
  // implies readable. Two layers measuring different bytes is how an immutable row becomes
  // permanently unreadable (Roadmap/LEARNINGS.md, experiment-governance-v2 S3).
  const stored = { schemaVersion: POD_REPORT_SCHEMA_VERSION, generatedAt: '2026-07-26T00:00:00.000Z', delivery: { notInstrumented: [] as unknown[], filler: '' } }
  const overhead = Buffer.byteLength(JSON.stringify(stored), 'utf8')
  stored.delivery.filler = 'x'.repeat(POD_REPORT_MAX_PAYLOAD_BYTES - overhead)
  const near = parsePodReportPush(stored)
  assert.equal(near.ok, true)
  if (!near.ok) return
  assert.ok(Buffer.byteLength(JSON.stringify(near.value.payload), 'utf8') <= POD_REPORT_MAX_PAYLOAD_BYTES)
})

test('a non-object body is rejected without throwing', () => {
  for (const bad of [null, undefined, 'string', 42, ['array']]) {
    assert.equal(parsePodReportPush(bad).ok, false)
  }
})
